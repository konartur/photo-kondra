# PERF-04 — Відтворюваний k6 harness та синтетичні fixtures

**Статус:** Backlog; не реалізовано. **Пріоритет:** P1.
**Залежності:** [PERF-01](01-architecture-audit.md), [PERF-02](02-resource-metrics.md), [PERF-03](03-constrained-docker.md), [спільні правила](README.md#межі-та-правила-виконання).
**Наступний крок:** [PERF-05](05-api-workloads.md).

## Очікуваний результат

Один документований запуск від чистого тестового стенда до k6 summary і ресурсних рядів. Версія k6/образ pinned; k6 не входить до production dependencies і не споживає CPU/RAM цільового VPS.

## Кроки реалізації

1. Створити seeded generator/manifest синтетичних валідних JPG із відомими bytes, dimensions, hash і достатньою ентропією. Мати 100-photo базовий набір, high-megapixel/near-MAX_PHOTO_SIZE та many-small-files варіанти згідно з PERF-01. Для ZIP near-limit врахувати overhead контейнера відносно `MAX_ARCHIVE_SIZE`; не тестувати тільки крихітними однотонними картинками. Generating/encoding — поза target і поза measured phase.
2. Додати preflight guards для API host, database/Redis identity, bucket/AWS account і perf project; потрібна явна perf-конфігурація без fallback на робочу `.env`. Setup створює лише тестового admin/галереї; manifest run містить ID створених ресурсів для scoped cleanup.
3. Розділити прямий NestJS API baseline (`/api/v1`, JWT) і product-path через Nginx → Next.js BFF → NestJS (cookies/trust headers за чинними контрактами). Для endpoint details читати фактичний код, не старий roadmap. Не підробляти trusted client headers у зовнішньому сценарії.
4. Налаштувати smoke, ramp/steady, burst/stress, recovery та soak профілі з параметрами PERF-01. Мінімум: warm-up 5 хв, steady 15 хв, recovery 10 хв і три незалежні steady runs на чисто визначеному стані. Arrival-rate потрібен для контролю заданого RPS; user journeys — для сесій. Записувати configured/achieved rate, VUs, iterations, dropped_iterations, generator saturation.
5. HTTP checks перевіряють payload і business states, не лише 200/202. Для async jobs — bounded polling/backoff, timeout та custom trends time-to-READY. Для S3 — окремі tags і discarded response body/streaming helper, якщо k6 buffer надто великий. Перевірку bytes/hash робити контрольним helper поза VPS; його throughput/ресурси зафіксувати.
6. Застосувати thresholds контракту до endpoint/scenario groups, розділити expected negative responses і unexpected failures. Поточні rate limits зберегти; тести нижче лімітів та окремі 429 probes. Auth/refresh — per-VU session, без конкурентної ротації одного refresh token. URL tags нормалізувати, headers/bodies/secrets не експортувати.

## Критерії приймання

- [ ] Версії, seed, manifest/checksums, конфіг workload/SLO і однакові команди дають повторюваний setup/run/cleanup.
- [ ] Smoke проходить через обидва ingress paths; production target відхиляється до mutation.
- [ ] k6 thresholds повертають non-zero при невиконанні SLO; async outcomes і dropped load видимі.
- [ ] k6/fixtures/profilers поза target budget; є контроль, що generator не є bottleneck.
- [ ] Секрети й приватні URL відсутні в summaries/tags/артефактах; tests не знижують захист системи.

## Перевірка

Запустити короткий smoke, перевірити відмову preflight для забороненої адреси та failure path thresholds на контрольному локальному тесті. Зіставити phase timestamps із PERF-02. Це перевірка harness, а не висновок про місткість.
