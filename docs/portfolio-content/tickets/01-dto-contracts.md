# PF-CONTENT-01 — Контракти DTO та OpenAPI

**Статус:** Виконано 2026-11-21 (контракти; робочі маршрути додаються наступними тікетами). **Область продукту:** лише портфоліо.
**Залежності:** Немає; початковий крок. Порядок і посилання — у [індексі](README.md).

## Мета та область роботи

backend/src/portfolio/dto; frontend/lib/portfolio/contracts.ts; OpenAPI tooling.

## Інструкції агенту

Прочитати [спільні правила](README.md#правила-виконання), [архітектуру](../architecture.md) і [DTO-специфікацію](../dto-architecture.md).

1. Зіставити dto-contracts.ts і dto-architecture.md з чинними NestJS DTO, global ValidationPipe та ApiErrorDto.
2. Реалізувати decorated input/output/query класи, конкретні wrappers замість generic-only schemas; покрити також admin summaries, списки та media routes.
3. Визначити відтворюване отримання frontend типів з OpenAPI (чинний механізм або мінімальний скрипт), без Prisma/Nest runtime у browser bundle.
4. Додати контрактні fixtures для site/home/service/story; перевірити вкладену валідацію, nullability, unknown fields, гроші, version і межі масивів: 10 фото разом з cover, відхилення 11-го; upload 10 000 000 байтів; story photos без pagination.

## Критерії приймання

- [x] OpenAPI описує всі погоджені поля, query та помилки; response schemas не порожні.
- [x] Вхідні запити не дозволяють записувати URL, storage keys, status і server-generated поля.
- [x] Frontend типи синхронізуються відтворювано; fixture DTO проходять перевірку.

## Перевірка

Виконати цільові перевірки поведінки, зазначені вище, та lint/typecheck/build змінених частин згідно зі спільними правилами. Записати команди, результат і невиконані критерії. Залежні наступні тікети не є виконаними фактом завершення цього.

## Поза областю роботи

Нова схема БД, публічний API з реальними даними та зміна UI.


## Доповнення L10N

Використати оновлені LocalizedTextDto/Locale, PortfolioLocaleQueryDto, PortfolioServiceListDto та sitemap alternates з dto-contracts.ts. Конкретні nested класи мають валідувати обидва uk/en ключі й забороняти сторонні поля. Public projection повертає тільки вибрану мову. Правила locale/default, nullability, двомовної публікації та помилок — у [L10N DTO](../../localization/dto-architecture.md). Додати uk/en fixtures та locale-aware query/OpenAPI tests.

## Результат виконання — 2026-11-21

- Додано `backend/src/portfolio/dto`: shared/input/query/public/admin-response класи, конкретні page/update/preview/list wrappers. Вкладені `{uk,en}` мають contextual text limits, trim і strict validation; omission відрізняється від nullable значень.
- Вхідні DTO перевіряють гроші/версії/масиви/посилання, дозволені контакти, JPEG/PNG/WebP та upload до 10 000 000 bytes. Photos DTO відхиляє 11-й елемент і дублікати; чиста перевірка union cover+photos підготовлена й протестована. Атомарне застосування зі stored cover/version виконується лише в PF-CONTENT-04/05.
- `setupApp` включає схеми в чинний Swagger через `extraModels`; реальні portfolio endpoints не додаються в цьому тікеті. Schema-only [OpenAPI snapshot](../openapi.json) навмисно не містить робочих paths. Коди помилок задокументовані; глобальний filter/exception behavior збережено, optional errors[] і предметні 5xx потребують підключення разом з endpoints.
- Додано генератор `backend/scripts/generate-portfolio-contracts.mjs` та `portfolio:contracts` / `portfolio:contracts:check`. Він не потребує БД/Redis/S3 й використовує наявні dependencies. Generated frontend types не мають runtime imports; compile-only checks перевіряють відповідність погодженому wire design.
- [Workflow і межі](../contracts-workflow.md) описують regeneration, drift check і відповідальність наступних сервісів. PF-CONTENT-02 та наступні тікети не виконувалися. Сторонній untracked `docs/performance/` з попереднього завдання збережено.

## Фактичні перевірки

| Команда | Результат |
| --- | --- |
| `npm --prefix backend run lint` | Успішно |
| `npm --prefix backend run typecheck` | Успішно |
| `npm --prefix backend test` | 30 suites / 245 tests passed, включно з 59 новими contract checks |
| `npm --prefix backend test -- --runTestsByPath src/portfolio/dto/contracts.spec.ts` | Після уточнення Swagger metadata повторно 59/59 passed |
| `npm --prefix backend run test:e2e` | 2 suites / 27 tests passed; sandbox спочатку блокував loopback EACCES, повтор виконано з дозволом поза sandbox |
| `npm --prefix backend run portfolio:contracts` | Успішно, включає backend build |
| `node backend/scripts/generate-portfolio-contracts.mjs --check` | Generated OpenAPI/types актуальні |
| `npm --prefix frontend run lint` | Успішно |
| `npm --prefix frontend run typecheck` | Успішно, включно з generated/design parity checks |
| `npm --prefix frontend run build` | Turbopack залишався на compile без прогресу; запуск зупинено, успішним не позначено |
| `npm --prefix frontend run build -- --webpack` | Успішно: TypeScript, prerender і build traces; Next config/build script не змінено |
| `git diff --check` | Успішно |

Playwright і DB/S3 integration не запускалися: UI, DB schema, storage та робочі portfolio routes у цьому тікеті не змінювались. Застереження: штатний Turbopack build у цьому середовищі не підтверджено, перевірено альтернативну production-збірку Webpack. Нових залежностей, міграцій або деплою немає.
