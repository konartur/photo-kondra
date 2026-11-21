# PF-CONTENT-05 — Атомарна публікація, архівація та preview

**Статус:** Виконано локально. Приймання пройдено 2026-11-22. **Область продукту:** лише портфоліо.
**Залежності:** PF-CONTENT-04. Порядок і посилання — у [індексі](README.md).

## Мета та область роботи

Portfolio publication service; snapshots; contentVersion; protected preview.

## Інструкції агенту

Прочитати [спільні правила](README.md#правила-виконання), [архітектуру](../architecture.md) і [DTO-специфікацію](../dto-architecture.md).

1. Перевірити completeness, ліміт 10 unique cover+photos та активні references; зберегти snapshot, contentVersion та PortfolioCacheInvalidation в одній DB transaction.
2. Забезпечити конкурентну безпеку publish/archive/delete; блокувати архівацію залежностей, на які посилаються активні snapshots.
3. Зафіксувати immutable slug після першої публікації; підтримати idempotent publish/archive і перевірку expectedVersion.
4. Реалізувати private preview повної чернетки з admin media routes; public projection ніколи не читає draft. Підготувати DB outbox replay; Redis-поведінку завершити в PF-CONTENT-06A без відкладення кешу після MVP.

## Критерії приймання

- [x] Нова редакція не видима до publish; невдалий publish не частково оновлює сайт.
- [x] Draft/published відрізняються і правильно показують hasUnpublishedChanges.
- [x] Concurrency tests доводять відсутність dangling published refs; архівація/видалення перевіряють snapshots.

## Перевірка

Виконати цільові перевірки поведінки, зазначені вище, та lint/typecheck/build змінених частин згідно зі спільними правилами. Записати команди, результат і невиконані критерії. Залежні наступні тікети не є виконаними фактом завершення цього.

### Поточний запис виконання (2026-11-21)

- Додано publish/archive команду для service/story/settings з ADMIN guard, expectedVersion та no-store; додано BFF адаптери.
- Publish перевіряє повноту обох мов, READY media з derivative variants, photo union, залежності (опублікований service для story; опубліковані всі добірки для home), потім у `withContentLock` атомарно записує snapshot/reference rows, lifecycle version/status, contentVersion і DB cache invalidation outbox.
- Archive видаляє active snapshot/reference rows в тій самій транзакції, перевіряє залежні published references і збільшує contentVersion лише при вилученні опублікованої версії. Повторні publish тієї ж версії/archive ідемпотентні. DB inconsistency fail-closed.
- Додано admin-only locale-aware preview projection з приватними same-origin media routes, без snapshot/public cache і з no-store; перевіряються повнота та media READY.
- **Перевірки:** backend lint/typecheck/build, `portfolio:contracts:check`, frontend lint/typecheck/production build і `git diff --check` пройшли. Production build вимагав дозволу на запис у `.next`; Next.js показав попередження про кілька lockfiles. Тести й PostgreSQL concurrency-приймання не запускалися; criteria лишаються відкритими до них. Міграція не застосовувалась. Redis invalidation worker належить PF-CONTENT-06A.

## Приймання 2026-11-22

На локальній photo_cloud_test набір portfolio-persistence пройшов п’ять разів поспіль (6/6). Перевірено ізоляцію snapshot від чернетки, preview напряму й історії, rollback, outbox, slug, ідемпотентність та одночасні publish історії й archive напряму. Виправлено повтор транзакції при PostgreSQL 40001 у сирому SQL блокування. Цільові unit та HTTP e2e публікації пройшли (2/2 кожен), backend lint, typecheck, build і portfolio:contracts:check успішні. Frontend BFF перевірено попереднім прогоном Playwright.

## Поза областю роботи

Довга історія ревізій, scheduling і distributed event bus.
