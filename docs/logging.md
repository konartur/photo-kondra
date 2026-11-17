# Логування та пошук помилок

Тікет: [№27 — Add Access and Processing Logging](https://github.com/konartur/photo-kondra/issues/24).

Бекенд використовує спільний `AppLogger` поверх NestJS Logger. Звичайний запуск через `main.ts` виводить JSON у stdout/stderr без кольорів. Нових сервісів, залежностей або таблиць БД немає.

## Рівні

У конфігурації бекенду:

```dotenv
LOG_LEVEL=info
```

| Значення | Що видно |
| --- | --- |
| `debug` | Усі події, зокрема успішні HTTP-запити, прогрес ZIP і обробку окремих фото в ZIP |
| `info` | Ключові lifecycle-події, попередження й помилки; рекомендований стандартний рівень |
| `warn` | Невдала автентифікація, HTTP 4xx, повторювані збої задач і помилки cleanup |
| `error` | HTTP 5xx, транспортні помилки та вичерпані спроби задач |

Рівні накопичувальні: `info` включає `warn` та `error`. Некоректне значення зупиняє запуск із безпечним повідомленням. Для зміни рівня перезапусти бекенд. У термінах NestJS рівень `info` називається `log`.

## Як знайти пов'язані події

1. У DevTools → Network знайди заголовок відповіді `X-Request-Id`. Бекенд створює свій UUID перед routing, CORS, rate limiting та парсингом body; надісланому клієнтом ID не довіряє.
2. Знайди цей `requestId` у логах. У JSON він міститься в об'єкті `message`.
3. Якщо запит поставив задачу в BullMQ, той самий ID міститься в її даних і відновлюється у воркері. Додатково доступні `jobId`, `queue` та `attemptsMade`.
4. Для різних HTTP-запитів до того самого фото використовуй `photoId`/`galleryId`; для ZIP — `archiveId`. Кожен HTTP-запит має окремий `requestId`.

`attemptsMade` — кількість уже невдалих спроб перед поточним виконанням; перша спроба має значення 0. `maxAttempts` береться з налаштувань BullMQ. Старі задачі без requestId отримують новий ID на час виконання; їх можна пов'язати через jobId. Помилки з'єднання Redis не прив'язуються до випадкового активного HTTP-запиту.

Якщо запит повторно використовує вже наявну задачу ZIP, вона зберігає requestId початкового запиту; повторні звернення зіставляй через jobId/archiveId.

Обидва воркери слухають подію BullMQ `failed`, тому логуються також відмови до запуску processor, зокрема перевищення stalled limit. Спільний `JobLogger` відновлює контекст із задачі та прибирає дубль, якщо ту саму помилку вже записав processor. Позначки тимчасові, прив'язані до об'єктів задач через WeakMap і очищаються перед наступною спробою; Redis/БД не змінюються. Для failure-події лічильник спроб нормалізується, бо BullMQ вже збільшив його.

## Основні події

| Потік | Події |
| --- | --- |
| Auth | `authentication_failed` із `operation: login` або `refresh` |
| Upload | `upload_created`, `upload_completed`, `image_job_enqueued`, `job_enqueue_failed` |
| Фото | `image_processing_started`, `image_processing_completed`, `image_processing_failed`, `image_cleanup_failed` |
| ZIP | `archive_job_enqueued`, `archive_progress`, `archive_generation_failed`, `archive_cleanup_failed` |
| Приватні лінки | `access_link_created`, `access_link_revoked` |
| Задачі | `job_started`, `job_completed`, `job_attempt_failed`, `job_exhausted`, `job_delayed` |
| Інфраструктура | `queue_error`, `worker_error`, `selected_archive_cleanup_failed` |
| HTTP | `http_request_completed`, `http_request_failed` |

`upload_completed` означає, що API перевірив наявність об'єкта й перевів фото в PROCESSING. Успішна постановка в чергу має окрему подію. `job_completed` означає успішне завершення processor; зокрема, він міг безпечно пропустити вже оброблений об'єкт. `job_delayed` означає перенесення через зайнятий lease, без помилкового списання retry. Час виконання записується як `durationMs`.

## Захист даних

Logger пропускає лише відомі типи подій, UUID внутрішніх ресурсів, числові метрики та фіксовані значення полів. Job ID дозволений лише як UUID або число. Невідомі поля й вкладені об'єкти відкидаються; це свідоме виключення payload замість спроб знайти секрети у довільному тексті.

Не передавай у логи паролі, email, JWT, токени приватних лінків, назви файлів, storage keys, signed URL, HTTP paths/query, body, cookies, headers, конфігурацію або сирі `Error`. Назви й коди помилок перетворюються на фіксовані категорії (`ACCESS_DENIED`, `NOT_FOUND`, `TIMEOUT`, `CONNECTION_FAILED`, `INVALID_IMAGE`, `ARCHIVE_INPUT_INVALID`, `UNEXPECTED_ERROR`); повідомлення, stack та cause не серіалізуються.

Для нової події додай її назву до переліку в `common/logging/app-logger.ts`; для нового поля явно задай перевірку дозволених значень. Не обходь `AppLogger` через `console.error` чи пряме логування об'єктів залежностей.

Логи ingress/CDN/APM і Redis-дані BullMQ не проходять через AppLogger. Для них потрібні окремі правила доступу, retention та redaction. Логер не змінює механізм повторних спроб, стани сутностей або відповіді API, крім заголовка кореляції.

Реалізація спирається на [NestJS JSON logging](https://docs.nestjs.com/techniques/logger) та [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html).
