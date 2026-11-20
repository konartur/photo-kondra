# PF-CONTENT-01 — Контракти DTO та OpenAPI

**Статус:** Backlog; не реалізовано. **Область продукту:** лише портфоліо.
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

- [ ] OpenAPI описує всі погоджені поля, query та помилки; response schemas не порожні.
- [ ] Вхідні запити не дозволяють записувати URL, storage keys, status і server-generated поля.
- [ ] Frontend типи синхронізуються відтворювано; fixture DTO проходять перевірку.

## Перевірка

Виконати цільові перевірки поведінки, зазначені вище, та lint/typecheck/build змінених частин згідно зі спільними правилами. Записати команди, результат і невиконані критерії. Залежні наступні тікети не є виконаними фактом завершення цього.

## Поза областю роботи

Нова схема БД, публічний API з реальними даними та зміна UI.


## Доповнення L10N

Використати оновлені LocalizedTextDto/Locale, PortfolioLocaleQueryDto, PortfolioServiceListDto та sitemap alternates з dto-contracts.ts. Конкретні nested класи мають валідувати обидва uk/en ключі й забороняти сторонні поля. Public projection повертає тільки вибрану мову. Правила locale/default, nullability, двомовної публікації та помилок — у [L10N DTO](../../localization/dto-architecture.md). Додати uk/en fixtures та locale-aware query/OpenAPI tests.
