# PF-CONTENT-06A — Redis-кеш та надійна інвалідація

**Статус:** Реалізовано й перевірено локально. **Область продукту:** лише портфоліо.
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

- [x] Cold miss заповнює Redis. Warm hit робить один SQL-запит версії.
- [x] Після publish/archive запит нової версії зберігає коректність навіть при невдалій інвалідації.
- [x] Таймаут Redis запускає читання з PostgreSQL.
- [x] Новий екземпляр обробника підбирає відкладені записи outbox. Повтор обробки безпечний.
- [x] Кеш обмежений DTO шести публічних JSON-маршрутів.
- [x] Очищення обмежене namespace портфоліо. Інтеграційна перевірка зберігає контрольний ключ BullMQ.

## Перевірка

Integration з тестовими PostgreSQL/Redis: miss/hit/TTL, invalid payload schema, конкурентні read+publish/archive, Redis timeout і restart, publish при недоступному Redis, outbox replay, DB outage. Перевірити config bounds, query counts і ключі черг. Виконати lint/typecheck, цільові тести та build за спільними правилами.

## Реалізація й результати

- Redis повертає кандидат з актуального для нього bucket. PostgreSQL підтверджує версію після читання Redis одним `SELECT`. При промаху агрегат будується у Repeatable Read. Повторна звірка перед записом і монотонне пересування Redis fence захищають від конкурентної інвалідації.
- `PORTFOLIO_CACHE_TTL` за замовчуванням 60 секунд. `PORTFOLIO_CACHE_TIMEOUT_MS` за замовчуванням 100 мс на команду. Поточний bucket обмежений 64 записами до 128 КіБ кожен. Записи підписані сервером із прив’язкою до версії схеми, маршруту та параметрів.
- Після commit publish/archive сигнал запускає обробку PostgreSQL outbox. Сканер стартує з модулем і повторює спроби кожні 5 секунд з backoff на рівні запису.
- Пройшли 10 інтеграційних тестів `portfolio-cache portfolio-persistence`, 34 HTTP e2e та 288 unit-тестів. Пройшли backend lint, typecheck, build і `portfolio:contracts:check`. Для Redis integration використано окремий контейнер на порту 16379 і локальну `photo_cloud_test`. Синтетичний sitemap на 32 байти показав 23 мс при промаху та 2 мс при влучанні в останньому локальному прогоні. Тест перевіряє один SQL-запит при влучанні. Ці локальні виміри описують тестовий fixture.

## Поза областю роботи

Кешування приватних галерей, адмінки або фотофайлів; другий незалежний Next/CDN cache; деплой.
