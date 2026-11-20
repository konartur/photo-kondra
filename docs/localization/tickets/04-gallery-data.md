# L10N-04 — Двомовні галереї: БД та API

**Статус:** Backlog. **Залежності:** L10N-01; фінальний write contract разом із L10N-05. **Пріоритет:** P2. **Область:** backend/database.

## Робота

Прочитати [правила](../README.md), [DTO-архітектуру](../dto-architecture.md) та [контракти](../dto-contracts.ts). Реалізувати additive Prisma migration/backfill, nested decorated DTO і Swagger. Title uk/en обов'язковий, description pair/null. Старі тексти копіювати в обидві мови без втрати; translationReviewRequired=true до ручного збереження. Нові записи одразу false. Owner/status/photos/access/archive lifecycle не змінювати.

Admin read містить translations/marker; public read locale-selected title/description/locale без admin полів. PATCH translations — атомарне повне заміщення; omission=unchanged, null об'єкта заборонений. Description null очищає обидві версії.

Зберегти робочий frontend: спочатку additive fields/backfill; required input активувати разом із новими формами, BFF, fixtures та тестами L10N-05. До закриття прибрати тимчасовий legacy write шлях. Не залишати два незалежно змінювані джерела title. Production migration не виконувати.

## Критерії приймання

- [ ] Nested uk/en validation: unknown languages/fields, trimming, межі 120/1000, типи, omission/null та PATCH atomicity.
- [ ] Тестова PostgreSQL підтверджує backfill/збереження наявних записів, marker і його очищення після повного перекладу.
- [ ] Admin/owner authorization і private-token validation збережені обома мовами.
- [ ] Public locale відсутній → en, неправильний → 400; storage keys/marker/admin envelope не витікають.
- [ ] Swagger/frontend types синхронні; старі форми не лишилися непрацездатними.

## Перевірка

Prisma validate/generate та міграція на тестовій PostgreSQL; unit/integration/relevant E2E, lint/typecheck/build. Записати фактичні результати й блокери.
