# Архітектура контенту портфоліо

**Стан:** план до реалізації. Підтверджені рішення — у [README](README.md).

## Межі

PortfolioModule використовує чинні PrismaModule, AuthModule, StorageService, Redis/BullMQ та журналювання. Контролери валідовують/авторизують і викликають операції модуля; правила публікації не розміщуються в контролерах.

Gallery, Photo, GalleryAccess, Archive та їхній lifecycle лишаються незалежними. Photo зараз вимагає galleryId, а GalleriesService.publish готує ZIP; тому портфоліо отримує власні сутності, а не isPortfolio на Gallery.

Виділити внутрішню чисту обробку Sharp з чинного image-processing лише настільки, наскільки потрібні обидва споживачі. Керування записами, lock, ключами й retry для портфоліо окреме. Новий job type і worker можуть використовувати чинний Redis; мікросервіси не потрібні.

## Пропоновані моделі Prisma

| Модель | Основні дані та обмеження |
| --- | --- |
| PortfolioService | UUID; slug unique у своєму просторі; поля чернетки напряму; price; cardMediaId; bookingEnabled; draftVersion; publishedVersion; status; publishedAt |
| PortfolioStory | UUID; slug unique; serviceId FK; поля чернетки; coverMediaId; SEO; версії та стан |
| PortfolioMedia | UUID; uploadedById FK User; оригінальний key; filename, MIME, size BigInt; ширина/висота; стан обробки; lock/lease для worker |
| PortfolioMediaVariant | UUID; mediaId FK; key unique; width, height, MIME; unique(mediaId, width, format); immutable після READY |
| PortfolioStoryPhoto | UUID розміщення; storyId FK; mediaId FK; alt, focalX/Y, sortOrder; stable tie-break ID; unique(storyId, mediaId) |
| PortfolioSettings | Singleton; brand/locale; типізований home draft; версії та стан |
| PortfolioContact | Settings FK; type unique в межах settings; label, address, visible, sortOrder |
| PortfolioHomeService | Settings FK; serviceId FK; sortOrder; unique(settingsId, serviceId) |
| PortfolioFeaturedStory | Settings FK; storyId FK; caption, sortOrder; unique(settingsId, storyId) |
| PortfolioPublishedDocument | Унікальна пара entityType/entityId; schemaVersion; sourceDraftVersion; типізований JSON snapshot з ID медіа/контенту та замороженими редакційними даними; publishedAt |
| PortfolioContentState | Singleton; contentVersion, монотонно зростає при кожній зміні публічної версії |
| PortfolioCacheInvalidation | DB outbox: contentVersion unique; attempts, nextAttemptAt, processedAt; повтори інвалідації при відмові Redis |

JSON використовується для immutable snapshot та фіксованого набору текстів головної, а не довільного page builder. Snapshot не є public DTO: він не містить upload URL чи короткоживучих signed URL. Його схема версіонується і перевіряється при записі/читанні.

Зв’язки з медіа всередині snapshot JSON потребують окремої перевірки посилань: перевіряти чернетки та всі активні snapshots перед видаленням. Допустиме доповнення схеми індексом посилань, якщо це потрібно для ефективного й атомарного контролю видалення; не покладатися на JSON як на FK.

Різниця між draftVersion і publishedVersion означає наявність неопублікованих змін. Статус PUBLISHED не змінюється через звичайне редагування. Чернетка може бути неповною; публікація — лише повною.

## Публікація

1. Перевірити ADMIN і expectedVersion; конфлікт повертає 409.
2. Перевірити тексти, slug, готовність усіх використаних медіа та опублікованість залежних сутностей. Історія потребує опублікованого напряму; home — опублікованих вибраних напрямів та історій.
3. У транзакції зафіксувати snapshot, publishedVersion/publishedAt, збільшити contentVersion та додати PortfolioCacheInvalidation. Перевірка залежностей і конкуренція publish/archive/delete мають бути серіалізовані через спільний рядок PortfolioContentState або еквівалентний DB lock, з визначеним retry.
4. Public mapper читає лише активні snapshots та READY-похідні. Ціна/назва пов’язаного напряму береться з його опублікованої версії, а не з чернетки.
5. Після commit негайна інвалідація Redis; невдала спроба повторюється з DB outbox. Redis error не відкочує успішну DB-публікацію; reader одразу використовує нову contentVersion.
6. Public URL медіа починає працювати лише за наявності активного опублікованого посилання.

Архівація прибирає публічну версію й збільшує contentVersion. Якщо на сутність посилається інша публікація, повернути 409 PORTFOLIO_CONTENT_REFERENCED із коротким описом; спочатку прибрати посилання й опублікувати залежний запис. Перевіряти snapshots, а не лише чернетки.

У MVP опублікований slug незмінний: зміна після першої публікації повертає 409 PORTFOLIO_SLUG_IMMUTABLE. Це зберігає видані URL без нової підсистеми redirects. Чернетка до першої публікації може змінювати slug.

Повтор publish для тієї самої версії без змін повертає чинний результат, без нового contentVersion. Повтор archive вже архівованого запису також ідемпотентний. expectedVersion потрібний і для archive.

Hard delete дозволений лише для неопублікованого запису без активних посилань. Оригінали і похідні видаляються тільки після перевірки всіх активних і draft-посилань. Перше впровадження може обмежитися soft delete та керованим cleanup; race publish/delete має бути закритий транзакційно.

## Фото та доступ

Оригінали, чернетки та варіанти зберігаються приватно під portfolio/media/{mediaId}/..., без зміни політики існуючого bucket. У БД — ключі, у DTO — адреси медіамаршрутів.

Завантаження: request-upload → прямий PUT у storage → upload-complete → BullMQ → перевірка фактичного файлу/лімітів → READY. Дозволені JPEG, PNG, WebP; максимум 20 МБ (20 000 000 байтів) на вхідний файл. Публічні похідні — WebP 480/960/1600 px без збільшення малих оригіналів; однакові фактичні ширини дедуплікувати. Зберегти rotate, видалення EXIF та технічний pixel limit у конфігурації worker. Наявність файла не підтверджує MIME чи dimensions.

На історію — максимум 10 унікальних фото разом з обкладинкою, можна менше; для публікації потрібна щонайменше обкладинка. Повторний mediaId у cover не подвоює ліміт; renderer не дублює cover автоматично. Перевіряти union cover + photos при редагуванні cover/списку, імпорті та publish, атомарно з version update. Загального продуктового ліміту медіабібліотеки немає; база MVP — 21 фото й може зростати. Фото однієї історії повертаються одним масивом до 10; pagination залишається для списків історій/медіа.

Public media endpoint приймає mediaId та дозволений variantId, перевіряє актуальне опубліковане використання й повертає redirect на короткоживучий signed GET. Відповідь redirect має Cache-Control: no-store; оригінал не видається. Signed URL може працювати до завершення TTL після архівації — це явна межа моделі, а не миттєве відкликання. Обмежити TTL конфігурацією і перевірити кеш-заголовки об’єкта. Admin preview окремий, авторизований, no-store.

Same-origin маршрути Next.js є адаптерами до NestJS із чинними довіреними BFF-заголовками; frontend не отримує внутрішній API_URL. Ні public, ні admin read DTO не містять storage keys. Операція імпорту з клієнтських галерей не входить до першої версії.

## Послідовне читання та Redis-кеш

Redis-кеш опублікованого контенту — обов’язкова частина MVP; PostgreSQL є джерелом істини. Кешувати site/home/service/story/sitemap і списки; фотографії, signed URLs, чернетки та admin preview в цей кеш не потрапляють.

Cache-aside у PortfolioPublicReader:
1. Прочитати authoritative contentVersion з PortfolioContentState у PostgreSQL. Це один дешевий запит навіть при hit, який замінює складне повторне складання DTO; активну версію не брати лише з Redis.
2. Key: portfolio:public:v{schemaVersion}:{contentVersion}:{route}:{normalizedParams}. У params врахувати slug/limit/cursor. Кеш містить перевірений public DTO тієї самої версії та стабільні media route URLs.
3. За hit перевірити schema/version; за miss або bounded timeout/error Redis зібрати site+page з одного узгодженого DB snapshot і повернути незалежно від результату cache write.
4. Перед поверненням звірити DB-версію з результатом. При конкурентному commit обмежено повторити читання; за постійної конкуренції — узгоджений DB read без кешу. Старий результат не записується під новою версією.
5. TTL конфігурується; стартове технічне значення 60 секунд. Bounded timeout, key prefix і очищення старих версій не чіпають BullMQ; FLUSHDB заборонений. Не змінювати eviction/maxmemory-policy Redis, що обслуговує BullMQ: обмежувати власні cache keys/розмір і за Redis write rejection повертатися до DB; TTL не є дозволом на eviction ключів черг.

Publish/archive змінюють snapshot, contentVersion і outbox однією DB-транзакцією. Після commit негайно інвалідувати Redis; помилки лишаються у PortfolioCacheInvalidation для retry з backoff. Періодичний DB scanner відновлює обробку після restart/Redis outage, незалежно від доступності BullMQ. Завдяки DB version fence старий кеш не використовується навіть до успішного purge.

Admin/preview обходять public-cache. Public media route перевіряє активне published-посилання через DB; redirect no-store. При відмові Redis — PostgreSQL fallback; при відмові DB — 503 замість потенційно архівованого кешу. 404/503 у першій версії не кешуються.

Next.js metadata і render отримують site+page одним server loader. Next fetch/HTTP JSON лишаються no-store, щоб не створювати другий незалежний кеш поверх Redis. Public projections при цьому кешуються backend Redis. Списки історій/медіа мають cursor pagination; фото конкретної історії — масив до 10 без cursor.

Приймання: cold/warm hit, конкурентний publish/archive, failed invalidation, DB fallback при Redis outage, outbox replay після restart, відсутність впливу на BullMQ. Виміряти latency/bytes/hit rate та DB projection-запити; cache hit усе ще має DB version query.

## Перехід

Імпорт MVP переносить увесь поточний контент: тексти, ціни, шість slug, порядок, добірки та 21 унікальне демофото. [Інвентаризація](media-inventory.json): love 4, portrait 4, family 3, events 3, brand 3, pets 4. Hero і контактний фон використовують ці самі медіа. Одне source-фото — один PortfolioMedia; повторні використання, crop та похідні не збільшують кількість джерел.

Поточні Unsplash-фото імпортувати в наше приватне object storage через той самий pipeline, з provenance/demo marker у manifest. Якщо source перевищує 20 МБ, підготувати demo-вхід з явним записом конвертації або повернути помилку; не обходити ліміт і не пропускати фото мовчки. MVP може публікувати демодані локально. Реальні фото/контакти наповнюються наприкінці через готову адмінку й не блокують готовність структури. Контактні заглушки зберегти як текст без вигаданих активних URL.

Обмежити перемикач FILE/DB серверною конфігурацією на час локального переходу; не показувати демодані як fallback у разі помилки API. Відсутній контент, loading і недоступність розрізняються.

Спочатку — additive migrations, backend, локальна перевірка імпорту, frontend DB mode. Для відкату повернути FILE лише явною дією оператора, зберігши БД та файли. Hosting/deployment лишається поза цим планом.


## Доповнення: двомовний контент

[Рішення L10N](../localization/README.md) доповнюють цю архітектуру: draft та immutable snapshots містять uk/en для всіх редакційних текстів, обидві мови публікуються атомарно. PortfolioSettings не задає єдину locale; public reader обирає locale запиту. Locale входить у normalizedParams Redis key, cursors і memoization; інвалідація охоплює обидві мови. Потрібна версія snapshot schema та контрольований двомовний імпорт. Подробиці — у [DTO-доповненні](dto-architecture.md#доповнення-локалізація-від-2026-11-20). Життєвий цикл галерей незалежний; їх двомовні тексти реалізує L10N-04.
