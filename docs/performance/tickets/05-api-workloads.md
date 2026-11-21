# PERF-05 — Навантаження реальних API-сценаріїв і фонових задач

**Статус:** Backlog; не виконано. **Пріоритет:** P1.
**Залежності:** [PERF-01](01-architecture-audit.md), [PERF-02](02-resource-metrics.md), [PERF-03](03-constrained-docker.md), [PERF-04](04-k6-harness.md), [спільні правила](README.md#межі-та-правила-виконання).
**Наступний крок:** [PERF-06](06-peaks-and-leaks.md).

## Очікуваний результат

Виміряні isolated і mixed workloads на незміненій бізнес-логіці, з реальними PostgreSQL, Redis, workers і тестовим S3. Моки з integration tests не замінюють performance path.

## Кроки реалізації

1. **Auth:** login → me → refresh → logout; окремо паралельний login/refresh із валідними independent sessions та неправильний пароль для наявного тестового admin. Виміряти Argon2/native RAM/CPU; не генерувати лише unknown-email fast path. Зберегти чинні rate limits і очікуваний 401/429.
2. **Галереї:** create/list/details/update, photo cursor pagination, access-link create/revoke. Перевірити великі списки галерей і metadata без завантаження оригіналів у API. Public metadata/photos/preview та original-download URL — через активний токен; revoked/expired/cross-gallery — окремі negative checks.
3. **Upload:** `POST /api/v1/galleries/:galleryId/photos/upload-url` → реальний PUT до S3 із потрібними заголовками → `POST /api/v1/photos/:photoId/upload-complete` → polling READY/FAILED. Виміряти 100-photo batch, upload-complete rate, queue wait, Sharp duration, output dimensions, S3 latency/bytes та час усього batch. Підтвердити, що normal upload/download bytes не проксіюються NestJS/BFF.
4. **Повний ZIP:** `POST /api/v1/galleries/:galleryId/publish` → poll admin `GET /api/v1/galleries/:galleryId/archive` і gallery READY → public `GET /api/v1/public/galleries/:token/archive` → signed S3 GET. Цей public GET не створює нову задачу. Перевірити ZIP directory, filenames/count і hashes оригіналів поза target; 202/URL недостатньо.
5. **Selected ZIP:** `POST /api/v1/public/galleries/:token/archives` із `photoIds` → `GET /api/v1/public/archives/:archiveId?token=...` → signed S3 GET. Однакова selection може reuse archive: для реального generation load створювати різні selection/галереї, окремо виміряти reuse. Перевірити active limit/429, invalid selection, expiry/revocation без витоку даних.
6. Спочатку isolated reads/auth/images/ZIP, потім одночасно public browsing + 100 uploads/Sharp + publish/selected ZIP + refresh. Черги мають незалежні workers у спільному Node-процесі: зафіксувати фактичне перекриття. Ступінчасто збільшувати load до SLO break або stop criterion; не змінювати concurrency для приховування baseline.
7. Для steady профілів виконати три repeats за PERF-04. Зберегти latency p50/p95/p99, achieved throughput/errors за route, queue wait/processing/end-to-end, RSS/heap/native/cgroup/host peak, CPU/throttling/loop, БД/Redis/S3 та recovery/drain після припинення запитів. Зазначити warm/cold dataset state й variance.

## Критерії приймання

- [ ] Пройдені або доказово позначені failed/blocked auth, galleries, direct upload, Sharp, public access, original, prebuilt і selected ZIP.
- [ ] Є isolated/mixed runs, числові навантаження й три steady repeats; reuse не виданий за нове ZIP generation.
- [ ] Async задачі та черги завершуються в межах SLO або зафіксовано lag/failure; немає нескінченного polling.
- [ ] ZIP/оригінали перевірені на цілісність; метрики API та S3 розділені, захист не вимикався.
- [ ] Є сирі знеособлені дані й summary по кожному run, включно з OOM/restarts/429/dropped iterations; невиконаний load не названий pass.

## Перевірка

Повторити команди runbook на чистому perf-середовищі, зіставити workload із time series та queue states. Недоступність реального тестового S3 залишає відповідні критерії blocked і обмежує фінальну оцінку.
