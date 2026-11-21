# PF-CONTENT-03 — Незалежне завантаження та обробка медіа

**Статус:** У роботі — реалізація підготовлена 2026-11-21; runtime-приймання не виконано. За чинною вказівкою власника тести не запускалися. **Область продукту:** лише портфоліо.
**Залежності:** PF-CONTENT-01 → PF-CONTENT-02. Порядок і посилання — у [індексі](README.md).

## Мета та область роботи

Portfolio media service/controller/job; StorageService; внутрішні Sharp helpers.

## Інструкції агенту

Прочитати [спільні правила](README.md#правила-виконання), [архітектуру](../architecture.md) і [DTO-специфікацію](../dto-architecture.md).

1. Реалізувати request-upload, complete, status, retry та admin preview за DTO; прямий PUT з потрібними headers.
2. Використати portfolio/media ключі й окремі записи; виділити лише спільне перетворення Sharp, зберігши чинні photo jobs.
3. Приймати JPEG/PNG/WebP до 10 000 000 байтів; створювати WebP 480/960/1600 px без upscale. Перевіряти фактичний файл/MIME/pixels, очищати EXIF, забезпечити lease/retry та idempotent completion. Вхідний ліміт портфоліо не змінює приватні Photo Cloud uploads.
4. Залишити public media недоступними до PF-CONTENT-05/06. Закрити race delete/process і partial uploads; ніколи не логувати signed URL.

## Критерії приймання

- [ ] Пошкоджені та файли понад 10 МБ відхиляються; boundary 10 000 000/10 000 001 перевірений.
- [ ] READY має реальні dimensions та WebP 480/960/1600 без upscale; загальної квоти на 21 фото немає.
- [ ] Повтор upload-complete/job не створює дублів; cleanup не видаляє чужі об’єкти.
- [ ] Admin preview авторизований, no-store; gallery image-processing регресії проходять.

## Перевірка

Виконати цільові перевірки поведінки, зазначені вище, та lint/typecheck/build змінених частин згідно зі спільними правилами. Записати команди, результат і невиконані критерії. Залежні наступні тікети не є виконаними фактом завершення цього.

## Поза областю роботи

Автоматичний імпорт приватних фото та відкриття bucket.

## Реалізація — 2026-11-21

- Після push PF-CONTENT-02 (`efc9a70`) власник доручив перейти до наступного тікета. Це дозволяє підготувати PF-CONTENT-03 без приймання залежності; DB-критерії PF-CONTENT-02 лишаються відкритими.
- Додано PortfolioModule з admin upload/complete/retry/list/detail/preview/delete, JWT/ADMIN/owner checks, concrete Swagger schemas та no-store. BFF adapters зберігають наявну межу довіри; preview повертає manual redirect без передачі JWT у storage.
- Додано окремі queue/worker, streaming temp-file pipeline, MIME/bytes/pixel checks, auto-rotate/EXIF stripping, послідовні WebP variants 480/960/1600 без upscale/дублів. Попередні gallery jobs зберігають параметри; спільним є лише pure Sharp resize/encode helper.
- StorageService отримав optional signed Content-Length, AbortSignal і cache-control. Код portfolio просить presigner підписувати точний розмір, worker незалежно перевіряє фактичні bytes. Приватні Photo Cloud uploads новий length parameter не використовують.
- Plan rows записуються до upload; lease/status fence закриває delete/READY race. Maintenance відновлює PROCESSING queue admission і повторює scoped partial/tombstone cleanup; вже виданий PUT не відкликається, тому storage cleanup eventual.
- Додано unit/backend E2E/Playwright сценарії, але **жоден тест не запускався**. Actual DB/Redis/S3/browser upload та якість/ресурси ще не перевірені.
- [Pipeline, API, recovery і відомі межі](../media-pipeline.md) описують деталі та наступне приймання. Нових package dependencies, public endpoints, міграцій або деплою немає. PF-CONTENT-04 не розпочато.

## Виконані перевірки

| Команда | Результат |
| --- | --- |
| `npm --prefix backend run lint` | Пройдено |
| `npm --prefix backend run typecheck` | Пройдено, включно з новими тестовими файлами, без їх виконання |
| `npm --prefix backend run build` | Пройдено |
| `npm --prefix backend run portfolio:contracts` | Пройдено; OpenAPI містить media controller paths, frontend types оновлено |
| `node backend/scripts/generate-portfolio-contracts.mjs --check` | Пройдено |
| `npm --prefix frontend run lint` | Пройдено |
| `npm --prefix frontend run typecheck` | Пройдено |
| `npm --prefix frontend run build -- --webpack` | Пройдено; перший запуск заблоковано sandbox EPERM на .next, повтор виконано з дозволом поза sandbox |
| Unit/integration/backend E2E/Playwright | Не запускалися за вказівкою власника |
| Реальні PostgreSQL/Redis/S3, signed Content-Length PUT, recovery/races та gallery/storage regressions | Не перевірялися; Acceptance Criteria залишені відкритими |

Код не є підтвердженим runtime-прийманням. Перед використанням медіамаршрутів потрібна попередня migration; її тут не застосовували. Аварійне SIGKILL може залишити тимчасові файли ОС, а tombstone metadata зберігається для повторного cleanup; ці межі описані в pipeline runbook.
