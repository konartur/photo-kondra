# PhotoKondra: вихідні факти для перевірки VPS 1 ГБ / 1 vCPU

Дата аналізу: 2026-11-21. Це статичне дослідження коду, а не результати профілювання. Навантажувальні тести, вимірювання ресурсів і деплой не виконувалися. Достатність 1 ГБ RAM / 1 vCPU та наявність memory leak наразі **не встановлено**.

## Фактична архітектура

| Частина | Що реалізовано | Джерело |
| --- | --- | --- |
| HTTP backend | Модульний моноліт NestJS 12 / TypeScript, Express; production-команда `node dist/main` | [package.json](../../backend/package.json), [main.ts](../../backend/src/main.ts), [AppModule](../../backend/src/app.module.ts) |
| Фонові задачі | BullMQ 6 та ioredis; image й archive workers створюються як Nest providers у тому самому застосунку. Окремого worker entrypoint у дослідженому коді немає. Для обох `Worker` передано лише connection, без явного concurrency; задачі різних черг можуть перекриватися | [image worker](../../backend/src/image-processing/image-processing.worker.ts), [archive worker](../../backend/src/archives/archive-generation.worker.ts) |
| База | Prisma Client 6, PostgreSQL; один сервіс успадковує PrismaClient, `$connect` / `$disconnect`; локальний Compose використовує PostgreSQL 16 Alpine | [PrismaService](../../backend/src/prisma/prisma.service.ts), [schema](../../backend/prisma/schema.prisma), [Compose](../../docker-compose.yml) |
| Модель | User, AuthSession, Gallery, Photo, GalleryAccess, Archive. Фото й архіви містять ключі об'єктів, статуси та processing leases; є індекси gallery/status/lease, але немає складеного індексу під повний порядок photo pagination | [schema](../../backend/prisma/schema.prisma) |
| Redis | Redis 7 Alpine з AOF і volume; Compose не задає RAM/CPU limits чи maxmemory. Завершені/невдалі BullMQ jobs мають age/count retention | [Compose](../../docker-compose.yml), [queue config](../../backend/src/queues/queue.config.ts) |
| Object storage | Бізнес-сервіси залежать від StorageService; S3 implementation використовує AWS SDK v3. Є endpoint/path-style конфіг для S3-compatible тестового storage | [StorageService](../../backend/src/storage/storage.service.ts), [S3 implementation](../../backend/src/storage/s3-storage.service.ts), [S3 config](../../backend/src/storage/s3-storage.config.ts) |
| Повний сервер | План хостингу включає Nginx, Next.js, NestJS, PostgreSQL, Redis; поточний Compose містить лише БД та Redis | [план](../hosting-and-deployment-plan.md), [frontend dependencies](../../frontend/package.json), [Compose](../../docker-compose.yml) |

Версії вище — діапазони/значення manifest, не перевірка встановлених runtime binary. Для вимірювань потрібно фіксувати commit, lock-файли, фактичні Node/image/package versions і конфіг без секретів.

## Потік фото та витрати пам'яті

1. [PhotosService](../../backend/src/photos/photos.service.ts) перевіряє власника/розмір, створює запис `UPLOADING` і повертає presigned PUT. Сам файл іде від клієнта до storage; [S3 signer](../../backend/src/storage/s3-storage.service.ts) підписує `Content-Type` та `If-None-Match: *`.
2. `upload-complete` перевіряє існування об'єкта через HEAD, змінює статус на `PROCESSING`, додає BullMQ job. Фото дозволено змінювати лише в `DRAFT` (транзакція блокує рядок галереї).
3. [ImageProcessingService](../../backend/src/image-processing/image-processing.service.ts) читає S3 Readable у Sharp, отримує metadata і **паралельно** створює thumbnail та preview через `clone().resize().webp().toBuffer()`. Два вихідні Buffer існують до upload. Потік на вході сам по собі не гарантує обмежене споживання пам'яті декодером: слід виміряти native/libvips, external/arrayBuffers і RSS, зважаючи на мегапікселі, а не лише розмір JPEG.
4. [Конфіг зображень](../../backend/src/image-processing/image-processing.config.ts) задає ширини 300/1600 і lease 900 с за замовчуванням; явних cache/concurrency налаштувань Sharp тут немає. Код має cleanup derivative keys та переведення у FAILED на помилці; поведінку stream cleanup при збоях необхідно перевірити вимірюваннями.
5. [PublicGalleryService](../../backend/src/public-gallery/public-gallery.service.ts) повертає cursor pages фото (`limit + 1`) і паралельно підписує дві URL на кожне видиме фото. Single-original download повертає signed URL, без проксіювання bytes через NestJS.

## Реальний ZIP-сценарій

- Повний ZIP готується при публікації адміністратором: `DRAFT → PROCESSING → READY`; незавершені фото блокують публікацію. Перехід у READY виконується під час завершення архіву. Це потрібно врахувати у fixtures та k6, а не спиратися лише на початковий приклад API з AGENTS.md. Джерела: [GalleriesService](../../backend/src/galleries/galleries.service.ts), [ArchivesService](../../backend/src/archives/archives.service.ts), [ArchiveGenerationService](../../backend/src/archives/archive-generation.service.ts).
- `GET /api/v1/public/galleries/:token/archive` отримує вже підготовлений ZIP і **не запускає** генерацію; `POST /api/v1/public/galleries/:token/archives` ставить ZIP вибраних фото у чергу; `GET /api/v1/public/archives/:archiveId?token=…` читає статус. Джерело: [controller](../../backend/src/public-gallery/public-archives.controller.ts).
- Selection обмежено 1–500 унікальними photo IDs; повторна однакова selection може перевикористати архів; є per-gallery обмеження частоти та активних selection archives, serializable transaction з максимум п'ятьма спробами при P2034. Джерело: [ArchivesService](../../backend/src/archives/archives.service.ts).
- [ArchiveGenerationService](../../backend/src/archives/archive-generation.service.ts) завантажує метадані всіх відповідних фото у масив, послідовно перевіряє originals через HEAD, використовує `archiver` з `store: true` (без повторного стиснення). Один original відкривається за раз; bytes проходять через streams, size-limit Transform і PassThrough у storage. Є timeout, destroy streams, видалення partial archive і обробка lease ownership. Весь ZIP не збирається у Buffer.
- [S3StorageService](../../backend/src/storage/s3-storage.service.ts) для stream upload використовує multipart `queueSize: 2`, `partSize: 5 MiB`, `leavePartsOnError: false`. Це параметри буферизації, **не виміряна верхня межа RSS**.
- [ArchiveGenerationConfig](../../backend/src/archives/archive-generation.config.ts): типовий MAX_ARCHIVE_SIZE 2 GiB, lease 900 с; це ліміт bytes архіву/originals, не бюджет RAM. [SelectedArchiveCleanupService](../../backend/src/archives/selected-archive-cleanup.service.ts) раз на 60 с очищає до 50 expired selections; повні архіви можуть бути безстроковими.

## Авторизація та інші кандидати для перевірки

- [AuthService](../../backend/src/auth/auth.service.ts) використовує Argon2 verify пароля та hash refresh token при login; refresh робить verify і новий hash. Параметри явно не передано: фактичні defaults/параметри encoded hash слід зафіксувати без витоку hash чи секретів. Native RAM/CPU під одночасними login/refresh — гіпотеза ризику, не виміряний bottleneck.
- [setupApp](../../backend/src/setup-app.ts) додає rate limiting, body limit, metadata-only JSON/form parsing, Swagger, validation, Helmet і логування. Необхідно тестувати реальну policy: очікувані 429 окремо від saturation errors, не вимикати захист для отримання кращих показників.
- [Gallery list](../../backend/src/galleries/galleries.service.ts) не пагінований. [ArchivesService.current](../../backend/src/archives/archives.service.ts) повторно вибирає всі READY photo records для content hash, зокрема під status polling; [archive worker](../../backend/src/archives/archive-generation.service.ts) теж читає всі метадані. Масиви можуть масштабувати RAM/DB/CPU з кількістю фото навіть при потокових bytes ZIP.
- [Photo queries](../../backend/src/photos/photos.service.ts) і [public queries](../../backend/src/public-gallery/public-gallery.service.ts) сортують за sortOrder/createdAt/id; план виконання запитів, connection pool Prisma та PostgreSQL settings ще не виміряні. Не слід міняти індекси/пули без evidence.
- BullMQ retries/retention, AOF persistence, PostgreSQL background activity, TLS/Nginx, Next.js і системний reserve мають входити до сукупного бюджету. k6, генератор fixtures, локальний S3 emulator та профайлери слід запускати поза цільовим бюджетом і звітувати їхню overhead окремо. Зовнішній AWS S3 не споживає RAM VPS, але його latency/throughput впливають на тривалість задач.

## Межі висновку

Код уже уникає HTTP-проксіювання великих фото і повної буферизації ZIP. Це аргумент спочатку виміряти поточну реалізацію, а не переписувати її. Водночас Sharp, Argon2, одночасність різних черг, всі сервіси на одному CPU та повні масиви photo metadata потребують перевірки. Жодна з цих гіпотез поки не доводить перевищення 1 ГБ чи необхідність міграції. Реалізація тестового стенда й інструментування потребують окремого підтвердження власника.
