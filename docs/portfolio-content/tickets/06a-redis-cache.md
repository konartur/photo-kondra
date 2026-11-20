# PF-CONTENT-06A — Redis-кеш та надійна інвалідація

**Статус:** Backlog; не реалізовано. **Область продукту:** лише портфоліо.
**Залежності:** [PF-CONTENT-06](06-public-read-api.md); outbox/schema з PF-CONTENT-02/05.
**Наступний крок:** [PF-CONTENT-07](07-frontend-data.md) залежить від цього тікета.

## Мета та область роботи

Portfolio public cache, version fence, DB outbox retries та спостережуваність. Наявний Redis використовувати без зміни gallery/auth semantics і без впливу на BullMQ keys. Redis-кеш — умова готовності MVP.

## Інструкції агенту

Прочитати [правила виконання](README.md#правила-виконання), [підтверджені рішення](../decisions.md), [архітектуру кешу](../architecture.md#послідовне-читання-та-redis-кеш) та [DTO](../dto-architecture.md).

1. Додати cache-aside лише для published site/home/service/story/sitemap/list DTO. Key включає schemaVersion, authoritative DB contentVersion, route і нормалізовані params. Cache hit перевіряє schema/version.
2. Зберігати TTL у конфігурації (стартове значення 60 с), bounded Redis timeout, вузький key prefix. Ні медіабайти, ні signed URL, ні admin/draft/preview не кешуються.
3. Publish/archive після DB commit одразу запускає invalidation. Версія з DB не дозволяє використати старі ключі навіть при помилці purge; закрити race cached read/write vs publish.
4. Використати PortfolioCacheInvalidation для retry з backoff. Періодичний DB scanner відновлює роботу після процесного restart/Redis outage, а не покладається тільки на недоступну в цей момент Redis-чергу. Опрацювання outbox ідемпотентне.
5. За Redis error/miss читати PostgreSQL, повертати відповідь без вимоги успішного cache write. За DB outage — 503, а не stale fallback. 404/503 не кешувати.
6. Зберегти consistent site+page та перевірку версії при конкурентному commit. Cache hit має один дешевий DB version read і не повторює projection joins; це описати й виміряти.
7. Додати безпечні метрики/log events hit/miss/timeout/fallback/invalidation/retry. Не логувати signed URL, токени чи вміст заявок; FLUSHDB не використовувати.

## Критерії приймання

- [ ] Cold miss заповнює Redis; warm hit не повторює складні DB projection-запити.
- [ ] Після publish/archive запит нової версії не отримує стару відповідь, навіть якщо invalidation впала.
- [ ] Падіння Redis не робить портфоліо недоступним за працездатної PostgreSQL.
- [ ] Outbox retry працює після відновлення Redis й restart процесу; повтори безпечні.
- [ ] Admin/preview, signed URLs та оригінали не потрапляють у public cache.
- [ ] Очищення та cache eviction не зачіпають чинні BullMQ queues.

## Перевірка

Integration з тестовими PostgreSQL/Redis: miss/hit/TTL, invalid payload schema, конкурентні read+publish/archive, Redis timeout і restart, publish при недоступному Redis, outbox replay, DB outage. Перевірити config bounds, query counts і ключі черг. Виконати lint/typecheck, цільові тести та build за спільними правилами.

## Поза областю роботи

Кешування приватних галерей, адмінки або фотофайлів; другий незалежний Next/CDN cache; деплой.
