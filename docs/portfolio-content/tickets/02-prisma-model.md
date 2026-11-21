# PF-CONTENT-02 — Additive Prisma-схема та опубліковані snapshots

**Статус:** У роботі — реалізація підготовлена 2026-11-21; DB-приймання не виконано. За дорученням власника тести не запускати. **Область продукту:** лише портфоліо.
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

## Реалізація — 2026-11-21

- Додано additive Portfolio-моделі/enums, двомовні scalar draft fields, нормалізовані media/content refs, FK/unique/order indexes і singleton settings/content state. Existing Photo Cloud rows/columns не змінюються SQL міграції; це статичний висновок за diff, не результат DB-regression.
- Згенеровано `20261121180000_portfolio_persistence` офлайн через Prisma migrate diff між HEAD datamodel і новою схемою. Додано CHECK, immutable revision/variant та monotonic version/slug triggers, atomic BEGIN/COMMIT і порожні singleton seeds. Міграцію не застосовано.
- Додано runtime schema-1 snapshot validator, extraction усіх media/service/story dependencies, persistence helpers з Serializable singleton lock, CAS, bounded P2034 retry, atomic contentVersion/outbox. Module ще не підключений до AppModule; lifecycle/API/media pipeline наступних тікетів не реалізовані.
- Додано unit та окремий non-production PostgreSQL integration suite, **жоден тест не запускався** за прямою вказівкою власника.
- [Persistence design, майбутнє DB-приймання й відкат](../persistence.md) документують уточнення реалізації, типи/версії, відповідальність наступних сервісів та обмеження.

## Виконані перевірки

| Перевірка | Результат |
| --- | --- |
| Prisma validate | Пройдено, без підключення до БД |
| Prisma format | Виконано |
| Prisma generate | Пройдено, Client 6.19.3 |
| `npm --prefix backend run lint` | Пройдено |
| `npm --prefix backend run typecheck` | Пройдено, включно з доданими тестовими файлами; тести не виконувалися |
| `npm --prefix backend run build` | Пройдено |
| Unit/integration/E2E | Не запускалися за вказівкою власника |
| Міграція на порожній БД та синтетичних старих даних | Не запускалася; обидва сценарії залишаються обов'язковими для закриття тікета |

Усі Acceptance Criteria вище залишені відкритими: FK/CHECK/triggers, конкурентні транзакції, rollback і збереження старих даних ще не перевірено на PostgreSQL. Не переходити до PF-CONTENT-03 як до етапу з прийнятою persistence foundation до виконання цих перевірок або окремого рішення власника.
