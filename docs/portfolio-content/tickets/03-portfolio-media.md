# PF-CONTENT-03 — Незалежне завантаження та обробка медіа

**Статус:** Backlog; не реалізовано. **Область продукту:** лише портфоліо.
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
