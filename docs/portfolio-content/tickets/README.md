# Послідовність реалізації портфоліо

**Стан:** PF-CONTENT-01 виконано. PF-CONTENT-02 запушено (`efc9a70`), локальне DB-приймання підтверджено. PF-CONTENT-03/04 запушено (557d8d4). PF-CONTENT-05 виконано локально, приймання пройдено 2026-11-22. PF-CONTENT-06 реалізовано локально. PF-CONTENT-06A реалізовано й перевірено локально. PF-CONTENT-07 реалізовано й перевірено локально. PF-CONTENT-08 запушено (`435d98e`). PF-CONTENT-09 запушено (`aecf7fd`). PF-CONTENT-10 пройшов локальне приймання, зовнішні перевірки залишаються відкритими. Контракти — у [DTO-архітектурі](../dto-architecture.md), генерація — у [runtime workflow](../contracts-workflow.md), схема — у [persistence design](../persistence.md), медіа — у [pipeline](../media-pipeline.md).

| Крок | Тікет | Залежить від |
| --- | --- | --- |
| 1 | [PF-CONTENT-01 — Контракти DTO та OpenAPI](01-dto-contracts.md) | Немає |
| 2 | [PF-CONTENT-02 — Additive Prisma-схема та опубліковані snapshots](02-prisma-model.md) | PF-CONTENT-01 |
| 3 | [PF-CONTENT-03 — Незалежне завантаження та обробка медіа](03-portfolio-media.md) | PF-CONTENT-02 |
| 4 | [PF-CONTENT-04 — Редагування напрямів, історій та головної](04-draft-crud.md) | PF-CONTENT-03 |
| 5 | [PF-CONTENT-05 — Атомарна публікація, архівація та preview](05-publication.md) | PF-CONTENT-04 |
| 6 | [PF-CONTENT-06 — Публічні агрегати, sitemap і безпечні медіамаршрути](06-public-read-api.md) · реалізовано локально | PF-CONTENT-05 |
| 7 | [PF-CONTENT-06A — Redis-кеш та надійна інвалідація](06a-redis-cache.md) | PF-CONTENT-06 |
| 8 | [PF-CONTENT-07 — Перевести публічне портфоліо на server DTO](07-frontend-data.md) | PF-CONTENT-06A |
| 9 | [PF-CONTENT-08 — Керування портфоліо в чинній адмінці](08-admin-editor.md) | PF-CONTENT-07 |
| 10 | [PF-CONTENT-09 — Імпорт поточного контенту та кероване перемикання](09-content-import.md) | PF-CONTENT-08 |
| 11 | [PF-CONTENT-10 — Наскрізна перевірка та закриття перетинів техборгу](10-acceptance.md) | PF-CONTENT-09 |

Виконувати по одному тікету за раз у наведеному порядку. Медіа потрібні до admin CRUD; публікація — до public reader; reader і Redis — до frontend; UI — до імпорту/приймання. Для MVP імпортуємо весь поточний контент і 21 фото з [інвентаризації](../media-inventory.json). Реальні матеріали наповнюємо наприкінці через адмінку; їх відсутність не блокує ці 11 кроків.

## Правила виконання

1. Прочитати [AGENTS.md](../../../AGENTS.md) і правила змінюваних каталогів. Перед кодом Next.js — відповідну локальну документацію. Схеми/DTO/інваріанти є джерелом контракту, а не назви файлів з прикладу.
2. Почати зі звірки актуального стану залежностей і підтверджених рішень [плану](../README.md). Нову суттєву вимогу власника спершу внести у специфікацію.
3. Зберегти приватні Gallery/Photo та auth/BFF; застосовувати Swagger, class-validator/class-transformer й чинний ApiErrorDto. При змінах інтерфейсу виконати застосовні UI/UX інструкції.
4. Писати перевірки інваріантів і меж public/admin: не тестувати лише повторення полів реалізації. Виконати на змінених частинах lint, typecheck, цільові unit/integration/E2E і build; зміни схеми перевірити через Prisma та реальну тестову PostgreSQL.
5. Записати результат критеріїв, команди та блокери у виконуваному тікеті. Не оголошувати виконаними роботу наступного тікета чи перевірки, які не запускалися.
6. Жоден тікет не дозволяє деплой, зміну DNS/TLS чи руйнівну міграцію. Відкладений hosting/deployment план лишається чинним.

## Перетини техборгу

- PF-CONTENT-02/04/07 закривають відповідні частини [TD-PF-01](../../technical-debt/portfolio/01-explicit-content-references.md) та [TD-PF-02](../../technical-debt/portfolio/02-story-photo-model.md).
- PF-CONTENT-03/06/09 деталізують [TD-PF-03](../../technical-debt/portfolio/03-owned-responsive-assets.md): object storage замінює файловий підхід тільки після перевіреного переходу.
- PF-CONTENT-06/07 охоплюють [TD-PF-04](../../technical-debt/portfolio/04-public-metadata.md), зберігаючи перевірку APP_URL та noindex.
- PF-CONTENT-04/07/08 охоплюють [TD-PF-07](../../technical-debt/portfolio/07-contact-configuration.md).
- PF-CONTENT-10 спирається на [TD-PF-09](../../technical-debt/portfolio/09-content-contract-checks.md), [TD-PF-10](../../technical-debt/portfolio/10-browser-coverage.md) і [TD-PF-11](../../technical-debt/portfolio/11-performance-baseline.md).
- Весь план деталізує [TD-PF-12](../../technical-debt/portfolio/12-database-content-design.md).
- Viewport/refactoring booking/resource isolation — окремі TD-PF-05/06/08; виконувати лише потрібну для переходу частину, решту залишати в backlog.


## Обов’язкове доповнення L10N

Перед виконанням будь-якого тікета прочитати [план локалізації](../../localization/README.md) та [DTO-правила](../../localization/dto-architecture.md). PF-CONTENT-01/02/04/05/06/06A/07/08/09/10 реалізують двомовні editorial fields, повноту uk/en перед publish, атомарні snapshots, locale-aware public/cache/cursor/editor/import і приймання обох мов. PF-CONTENT-03 не дублює файли медіа за мовою. Жодного одномовного locale settings або лише uk snapshot. Ці вимоги доповнюють наведені вище критерії, не означають завершення тікетів.
