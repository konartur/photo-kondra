# Persistence портфоліо — PF-CONTENT-02

**Стан на 2026-11-21:** схема, additive SQL migration і helpers підготовлені. Міграцію не застосовано; unit/integration/E2E не запускалися за прямою вказівкою власника. Цей документ описує реалізацію, а не результати DB-приймання.

## Розміщення даних

- [Prisma schema](../../backend/prisma/schema.prisma) додає тільки Portfolio-моделі та enums. Зв'язок `User.portfolioMedia` — лише зворотне Prisma-поле; SQL не змінює стовпці/дані `User`, auth, Gallery, Photo, GalleryAccess або Archive. Новий media FK посилається на наявного автора з `onDelete: Restrict`.
- Напрями/історії мають власні slug namespaces, статуси й версії. `titleUk/titleEn`, інші редакційні тексти, SEO та alt зберігаються явними колонками, без одного глобального locale і без fallback між мовами. Draft може містити порожні рядки. Усі FK медіарозміщень нормалізовані; дублювання JSON-джерел у чернетці немає.
- Ціна — nullable трійка `amountMinor/currency/durationMinutes`; або всі null, або integer UAH-ціна й тривалість у погоджених межах. Focal point — або пара null, або два числа 0..1. Width/height — реальні цілі розміри; медіалібліотека не має загальної квоти.
- Settings має фіксований UUID `00000000-0000-4000-8000-000000000001`, щоб відповідати admin UUID DTO; content state має `id=1`. CHECK обмежує кожен singleton одним ID; міграція вставляє порожню DRAFT-конфігурацію і `contentVersion=0`. Це не публікація демоконтенту. Видаляти singletons через прикладний код не можна; відсутній fence спричиняє fail-closed.
- Story photos мають client-generated placement UUID і unique `(storyId,mediaId)`, `(storyId,sortOrder)`. CHECK `sortOrder=0..9` обмежує список десятьма місцями; union з окремою cover додатково перевіряється сервісом атомарно у PF-CONTENT-04/05. Home service/featured/contact order має відповідні межі 20/12/3. Не переставляти unique sortOrder по одному рядку: заміщувати весь список у транзакції з version check.
- Індекси підтримують deterministic pagination/order `(sortOrder,id)` та фільтри status/service, lookup медіапосилань, leases, outbox retries. Slug після першої публікації захищений SQL trigger. При archive `publishedVersion/publishedAt` лишаються записом останньої публікації: їх не можна обнулити для обходу slug policy.

## Версії та блокування

Лічильники в PostgreSQL — BigInt, у wire DTO — safe integer number. CHECK обмежує їх до `Number.MAX_SAFE_INTEGER`; mapper повинен явно перетворювати BigInt на Number, не віддавати ORM row напряму в JSON. `draftVersion` починається з 1, `contentVersion` — з 0; опублікована версія не перевищує draft. Triggers забороняють зменшення версій.

[PortfolioPersistenceService](../../backend/src/portfolio/persistence/portfolio-persistence.service.ts) надає внутрішні primitives:

1. `withContentLock(callback)` починає Serializable transaction, бере `SELECT ... FOR UPDATE` для singleton fence **до читання залежностей** і обмежено повторює P2034 до п'яти спроб. Callback містить лише DB-операції; S3/Redis/HTTP, зовнішні ефекти й логування успіху виконуються після commit. Таймаути: maxWait 5 с, transaction 10 с; retry pauses 25/50/75/100 мс.
2. `claimDraftVersion(tx,type,id,expectedVersion)` виконує CAS й increment. Спочатку перевірити admin/існування та domain constraints, потім claim і повне заміщення залежних rows у тій самій транзакції. Будь-яка помилка відкочує version claim разом зі змінами. Збереження draft не підвищує глобальний public contentVersion.
3. `writeSnapshot(tx,id,sourceVersion,payload)` перевіряє формат і відповідність поточній draftVersion, записує snapshot та заміщує всі normalized dependency refs. Той самий payload/sourceVersion ідемпотентний; інший payload під тією самою або нижчою версією — conflict. Додатковий SQL trigger забороняє зміну замороженого payload у межах revision.
4. `advanceContentVersion(tx)` збільшує public version і створює унікальний `PortfolioCacheInvalidation` у тій самій транзакції. Викликати **лише для фактичної зміни публічної версії** після domain/idempotency checks. Реалізація publish/archive, перевірка повноти обох мов, lifecycle rows і негайна Redis invalidation — PF-CONTENT-05/06A.

Всі draft/reference edits, publish/archive/delete мають використовувати спільний fence; інакше сервіси можуть обійти semantic checks. Helpers не авторизують зовнішній запит. У PF-CONTENT-03 [PersistenceModule](../../backend/src/portfolio/persistence/portfolio-persistence.module.ts) підключений через PortfolioModule до AppModule для [media API/worker](media-pipeline.md); migration перед їх runtime-використанням обов'язкова, її тут не застосовували.

## Snapshot schema 1

[Валідатор](../../backend/src/portfolio/persistence/portfolio-snapshot.ts) перевіряє дані на записі й читанні:

```ts
{ schemaVersion: 1, entityType: 'SERVICE', data: PortfolioServiceDraftInputDto }
{ schemaVersion: 1, entityType: 'STORY', data: PortfolioStoryDraftInputDto, photos: PortfolioStoryPhotoInputDto[] }
{ schemaVersion: 1, entityType: 'SETTINGS', data: PortfolioHomeDraftInputDto }
```

Тут `data` — заморожена копія editorial fields і ID refs обома мовами. Це внутрішній snapshot, не public DTO: немає signed URL, storage keys, original/derivative bytes, server URLs або Prisma BigInt. `parsePortfolioSnapshot` відхиляє невідомі поля/версії й порушення photo union. Він перевіряє **форму**, а не готовність до publish: повноту текстів, READY media, опублікованість залежностей та незмінність slug перевіряє майбутній publication service.

Один активний `PortfolioPublishedDocument` на `(entityType,entityId)`, без історичного revision store. Нові редакції атомарно заміщують його лише з новішою sourceDraftVersion; archive прибирає активний документ. Owner зв'язаний явним nullable FK на service/story/settings, SQL CHECK вимагає рівно правильного власника з тим самим ID. Це закриває відсутність polymorphic FK у JSON.

Додані три компактні reference tables на media/service/story. `snapshotReferences` формує їх з усього payload, включно з cover, photos, SEO share, desktop/mobile hero, contact background, home selections. FK Restrict захищає ці залежності навіть після зміни чернетки. Видалення/архівація referenced контенту перевіряє активні snapshots; draft refs перевіряються незалежно. Видалення документа каскадно прибирає тільки його reference rows. Заборонено записувати snapshot напряму, минаючи helper: SQL контролює envelope/FK, але не може довести повноту extracted reference index без прикладної перевірки.

Media variants immutable після створення: worker PF-CONTENT-03 створює immutable keys/rows і дедуплікує фактичні ширини; не оновлює існуючий variant. Видалення source media потребує перевірки draft/published використання і явного очищення variant rows/storage. SQL FK сам по собі не захищає від помилкового soft-delete/status change — це перевірка майбутнього media service під тим самим fence.

## Міграція, приймання та відкат

[Міграція](../../backend/prisma/migrations/20261121180000_portfolio_persistence/migration.sql) згенерована офлайн Prisma 6 `migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel prisma/schema.prisma --script`; потім додані portfolio-only CHECK/triggers/singleton seeds і `BEGIN/COMMIT`. Під час generate/validate використовувався недоступний placeholder DATABASE_URL, до БД підключення не було. SQL не застосовано, shadow DB не створювалася. Custom CHECK/triggers не відображаються повністю в Prisma schema; у наступних migrations їх слід зберігати явно.

**Після дозволу на тести**, в окремому локальному середовищі:

1. Створити дві порожні disposable БД із назвами `*_test`, явним локальним DATABASE_URL без production credentials. У першій застосувати всі migrations штатним Prisma workflow; записати checksum/результати. Не використовувати db push як заміну історії migrations.
2. У другій застосувати попередню історію до PF-CONTENT-02, додати синтетичні User/AuthSession/Gallery/Photo/GalleryAccess/Archive, зберегти контрольний dump/checksums. Застосувати нову migration; порівняти всі старі rows/constraints/операції. Не копіювати production-дані. Наявний integration suite не замінює цей migration regression run.
3. Встановити `PORTFOLIO_TEST_DATABASE_URL` на dedicated migrated local `*_test`, запустити новий `test/portfolio-persistence.integration-spec.ts` через чинний Jest integration config. Suite не читає `.env` і не мігрує БД самостійно; очищає тільки свої UUID rows. Запускати ексклюзивно на цій тестовій БД, без сторонніх writers.
4. Запустити unit suites `portfolio-snapshot.spec.ts` і `portfolio-persistence.service.spec.ts`, повний backend regression та релевантні E2E. Підтвердити rollback при помилці, конкурентні CAS, FK після draft edit, immutable revision/variant, singleton/price/version/order constraints. До цього DB Acceptance Criteria залишаються відкритими.

Відкат прикладного коду — попередній commit, **зі збереженням** нових таблиць/даних. Старий Photo Cloud їх не читає. Down migration/drop приватних або portfolio таблиць не додається. Невдала atomic migration має відкотитися цілком; реальний результат треба перевірити на disposable БД перед будь-яким застосуванням. Production schema та hosting цим тікетом не змінюються.
