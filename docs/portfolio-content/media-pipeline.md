# Медіа портфоліо — PF-CONTENT-03

**Стан на 2026-11-21:** реалізація підготовлена, runtime-приймання відкладено. За вказівкою власника тести не запускалися; міграція PF-CONTENT-02 не застосована. Нових залежностей або публічних медіамаршрутів немає. Нова інструкція власника дозволила розпочати PF-CONTENT-03 попри відкладене DB-приймання попереднього тікета.

## API та прямий upload

Всі NestJS маршрути мають префікс `/api/v1/portfolio/media`, чинні JWT/ADMIN guards, owner check за `uploadedById` та `Cache-Control: no-store`. BFF використовує ті самі suffixes під `/api/portfolio/media`; JWT лишається в HttpOnly-cookie і передається лише внутрішньому backend із чинними довіреними client headers.

| Метод і suffix | Поведінка |
| --- | --- |
| `POST /upload-url` | 201: `RequestPortfolioUploadDto` → `PortfolioUploadResponseDto` з mediaId, uploadUrl, expiresIn, requiredHeaders |
| `POST /:id/upload-complete` | 202: ідемпотентний completion; наявність об'єкта перевіряється HEAD, файл перевіряє worker |
| `POST /:id/retry` | 202: повтор FAILED або recovery PROCESSING; READY не змінюється; UPLOADING → 409 |
| `GET /` | Власна media library, limit default 24/max 50, opaque cursor; немає загальної квоти 21 |
| `GET /:id` | Стан, фактичні dimensions після READY, authenticated previewUrl або null; bytes — десятковий рядок |
| `GET /:id/variants/:variantId` | 302: тільки READY derivative цього власника, підписаний GET, no-store/no-referrer; оригінал не видається |
| `DELETE /:id` | 204: лише без draft/published references; tombstone і відкликання lease, повторюваний cleanup |

Клієнт запитує upload URL, потім робить **прямий PUT File/Blob у S3** зі штатними `Content-Type` та `If-None-Match: *`. Для портфоліо presigner додатково отримує точний `ContentLength=sizeBytes` і `signableHeaders` з `content-length`; браузер задає його сам, вручну встановлювати forbidden header не потрібно. Фактичну сумісність цього підпису з браузером/S3 необхідно прийняти на тестовому bucket. Private Gallery uploads новий optional параметр не передають.

Оригінали мають ключ `portfolio/media/{mediaId}/original.{jpg|png|webp}`. Bucket та credentials не змінюються; бізнес-код залежить від StorageService. Через NestJS/BFF проходить лише metadata, не файл. Новий BFF upload route приймає JSON максимум 65 536 bytes; backend застосовує додатково свій `HTTP_BODY_LIMIT_BYTES`. Не підвищувати BFF body cap для фотографій — використовувати PUT у storage.

## Worker і перевірка файла

[PortfolioModule](../../backend/src/portfolio/portfolio.module.ts) підключений до AppModule; в одному NestJS-процесі працює окремий BullMQ worker `portfolio-media-processing` із concurrency 1. Використовується чинний Redis/default attempts/backoff/retention. Старі `image-processing` та `archive-generation` queues/jobs не перенаправляються. Shared [WebP helper](../../backend/src/image-processing/webp-transform.ts) виділяє тільки clone/resize/encode; старий gallery lifecycle, ширини та default quality не змінюються.

[Image processor](../../backend/src/portfolio/media/portfolio-image-processor.ts) виконує:

1. Streaming download із byte counter у власний тимчасовий каталог ОС. При 10 000 001-му байті потік зупиняється; розмір має точно збігатися з upload metadata. У RAM не збирається повний оригінал.
2. Перевірка JPEG/PNG/WebP signatures та відповідності заявленому MIME, Sharp decode, pixel limit і metadata format. Якщо metadata повідомляє кілька сторінок/кадрів, файл відхиляється. Пошкоджений/невідповідний файл → FAILED/UnrecoverableError; зміна extension не обходить перевірку.
3. Auto-rotate, EXIF stripping за стандартною поведінкою Sharp; оригінал не перекодовується. Media dimensions орієнтовані за EXIF, variant dimensions беруться з фактичного `OutputInfo`.
4. Послідовне створення WebP на диску шириною `min(480/960/1600, orientedSourceWidth)`, з дедуплікацією однакових фактичних ширин. Менший оригінал не збільшується. Окремий output buffer на весь файл не накопичується.
5. Запис запланованих immutable variant rows **до S3 upload**. Ключі `portfolio/media/{mediaId}/variants/{leaseId}/{actualWidth}.webp` унікальні для спроби; записані keys є журналом partial uploads. Після всіх передач та перевірки чинного lease — атомарний READY.

Тимчасові файли прибираються у звичайних success/error paths; завершення процесу через SIGKILL може залишити каталог `photokondra-portfolio-*` у temp ОС. Для такого випадку потрібне штатне OS temp-directory housekeeping; source code не видаляє довільні каталоги під час startup. Це операційне обмеження слід врахувати в disk/restart прийманні.

## Lease, retry та cleanup

[Processing service](../../backend/src/portfolio/media/portfolio-media-processing.service.ts) бере lease і виконує DB transitions під спільним PortfolioContentState fence. Sharp/S3 не виконуються у DB transaction. Кожен plan/READY перевіряє status=PROCESSING, власний lockId і строк lease. DELETED не може повернутися в READY. Спроба не чистить namespace іншої спроби; original та variant keys проходять перевірку portfolio/media/{id}/.

При неоднозначній помилці після READY commit worker перечитує стан: він не видаляє результат своєї вже успішно зафіксованої спроби. Якщо БД недоступна, cleanup відкладається, keys залишаються в журналі. Failed rows не доступні preview; наступна спроба прибирає попередні objects/rows до використання унікальних width slots. Пошкоджений оригінал лишається приватним FAILED asset до явного видалення; його не можна замінити тим самим create-only PUT — потрібно створити новий upload.

Один BullMQ job ID на mediaId. Повторний complete не створює дубль; retained failed job отримує новий attempts budget лише при явному retry або recovery PROCESSING. Worker із зайнятим DB lease відкладає job до його завершення, а не оголошує файл READY. Producer чекає готовності Redis під час ініціалізації. До готовності черги запит на додавання job одразу повертає помилку. Після підключення діють `enableOfflineQueue=false` і `maxRetriesPerRequest=1`; worker зберігає потрібне BullMQ `maxRetriesPerRequest=null`.

[Maintenance](../../backend/src/portfolio/media/portfolio-media-maintenance.service.ts) раз на налаштований інтервал сканує bounded batches по 50 ID:

- PROCESSING без живого lease, старіше 10 с: відновлення queue admission після DB commit/Redis outage або process crash;
- FAILED: cleanup відомих partial derivative objects, без автоматичного нескінченного retry invalid файла;
- DELETED: cleanup derivative objects та original, із збереженням tombstone/keys для наступних проходів.

Cleanup читає status і variant journal під тим самим DB fence, щоб retry не підмінив список keys між relation queries. S3 deletion виконується після transaction. Сканування не перекриваються; S3-фаза має загальний deadline 20 с. У наступних проходах cursor просувається по всій бібліотеці.

Вже виданий presigned PUT не можна миттєво відкликати. Object може з'явитися після DELETE через запізнілий PUT; він лишається приватним, DELETED media не видає preview, повторний tombstone cleanup його прибирає. Це eventual cleanup, не гарантія синхронного стирання всіх bytes на HTTP 204. Tombstones та variant metadata зараз зберігаються; їхню retention/hard-delete політику не запроваджено.

## Preview і pagination

Admin DTO містить лише authenticated same-origin variant route. BFF використовує `redirect: manual`, повертає 302 клієнту та **не** відправляє JWT у S3 й не завантажує derivative на сервер. Cache-Control override `private, no-store` задається також S3 upload/download; signed GET має чинний `SIGNED_URL_PREVIEW_TTL`. До завершення TTL вже виданий signed GET може залишатися чинним — та сама межа моделі, що в архітектурі.

Media list сортується за `(createdAt DESC,id DESC)`. Cursor HMAC-підписаний JWT access secret і містить owner/limit/context version/asOf/останній tuple. Підміна owner/limit/signature → 400; зміна global contentVersion після publish/archive → 409 PORTFOLIO_CURSOR_STALE. Це жива admin library: зміни READY/FAILED не підвищують public contentVersion, видалені assets зникають зі списку, нові upload після asOf не включаються до поточного проходу. Locale тут не потрібний.

## Конфігурація й неперевірені критерії

Нові [env defaults](../../.env.example): max pixels 40 000 000, WebP quality 82, processing timeout 120 с, lease 900 с (має перевищувати 2×timeout+60), maintenance interval 30 с. Це початкові технічні значення, **не виміряні performance/quality результати**. RAM усього сервера, поведінка Sharp та візуальна якість потребують окремої перевірки; збірка не підтверджує їх.

Після дозволу на тести та застосування PF-CONTENT-02 до окремої тестової БД виконати:

1. Unit suites processor/orchestration/queue/cursor/processing lease та S3 adapter; byte boundary 10 000 000/10 000 001, actual MIME, corrupt/pixel-heavy/EXIF inputs, no-upscale widths.
2. Backend `portfolio-media.e2e-spec.ts`: JWT/ADMIN boundaries, DTO validation, redirect/no-store, відсутність public media routes. Playwright `portfolio-media.spec.ts`: BFF cookie gate, metadata cap, ID validation. Mock suites не замінюють реального S3 flow.
3. Окремі test PostgreSQL/Redis/private S3: request → browser PUT зі signed Content-Length/Content-Type/If-None-Match → complete → READY → preview через BFF. Повтор complete/job, simultaneous retries, stop/restart на кожній фазі, Redis/S3 failures і tombstone cleanup після late PUT. Не використовувати production дані/credentials.
4. Concurrent delete vs plan/upload/READY, reference checks для всіх draft/published placements; переконатися, що чужі та інші attempt keys не видаляються. Перевірити disk/temp cleanup після аварійної зупинки.
5. Регресії gallery image-processing, storage signed URL і archive multipart upload, на які впливають shared helper/optional StorageService parameters. Підтвердити якість/вагу похідних на репрезентативних фото.

Стан результатів і команд збережений у [тікеті](tickets/03-portfolio-media.md). Публічні media routes, CRUD редакційних текстів та UI editor належать наступним тікетам.
