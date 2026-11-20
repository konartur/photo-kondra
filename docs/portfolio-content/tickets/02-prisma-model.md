# PF-CONTENT-02 — Additive Prisma-схема та опубліковані snapshots

**Статус:** Backlog; не реалізовано. **Область продукту:** лише портфоліо.
**Залежності:** PF-CONTENT-01. Порядок і посилання — у [індексі](README.md).

## Мета та область роботи

backend/prisma/schema.prisma; migrations; portfolio persistence helpers.

## Інструкції агенту

Прочитати [спільні правила](README.md#правила-виконання), [архітектуру](../architecture.md) і [DTO-специфікацію](../dto-architecture.md).

1. Додати моделі з architecture.md, singleton settings/content state, outbox PortfolioCacheInvalidation, FK, індекси, унікальні slug та deterministic order.
2. Нормалізувати draft-зв’язки; визначити versioned immutable snapshot schema для публікації й контроль медіапосилань у JSON.
3. Забезпечити optimistic version updates та механізм DB serialization для конкурентних publish/archive/delete.
4. Згенерувати additive migration; перевірити на порожній БД та копії тестових даних Photo Cloud. Підготувати відкат коду без drop приватних таблиць.

## Критерії приймання

- [ ] Міграція не змінює дані/семантику Gallery, Photo, GalleryAccess, Archive і auth.
- [ ] FK/unique/version constraints перевірені; snapshot зберігає refs і заморожені поля, а не signed URL.
- [ ] Prisma validate/generate та DB integration checks проходять.

## Перевірка

Виконати цільові перевірки поведінки, зазначені вище, та lint/typecheck/build змінених частин згідно зі спільними правилами. Записати команди, результат і невиконані критерії. Залежні наступні тікети не є виконаними фактом завершення цього.

## Поза областю роботи

Ручна зміна production-схеми, імпорт і public endpoints.
