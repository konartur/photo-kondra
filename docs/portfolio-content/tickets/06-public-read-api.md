# PF-CONTENT-06 — Публічні агрегати, sitemap і безпечні медіамаршрути

**Статус:** Реалізовано локально. **Область продукту:** лише портфоліо.
**Залежності:** PF-CONTENT-05. Порядок і посилання — у [індексі](README.md).

## Мета та область роботи

Public reader/mapper/controllers; same-origin BFF media adapters; OpenAPI.

## Інструкції агенту

Прочитати [спільні правила](README.md#правила-виконання), [архітектуру](../architecture.md) і [DTO-специфікацію](../dto-architecture.md).

1. Реалізувати всі public endpoints за dto-architecture.md через published snapshots, READY variants і один узгоджений read для site+page.
2. Додати cursor/version validation для списків, predictable nextStory, homepage ordering, лише enabled booking services; limit=24/max=50. Фото окремої історії — масив до 10 без cursor.
3. Public media route перевіряє активне published використання й дозволений variant; 302 no-store веде лише на signed derivative.
4. Повернути 404 для draft/archived, 503 для інфраструктурної відмови; HTTP JSON no-store: це не відмова від backend Redis. Готовність MVP потребує наступного PF-CONTENT-06A. Sitemap має лише фактичні публічні URL, без нових /services сторінок.

## Критерії приймання

- [x] API повертає повні screen DTO без додаткових lookup ID і без витоку draft/keys/originals.
- [x] Публічний media endpoint не видає чернетки й довільні keys. TTL відкликання задокументований.
- [x] Пагінація використовує contentVersion і стабільне сортування. Swagger відповідає JSON.

## Перевірка

Виконати цільові перевірки поведінки, зазначені вище, та lint/typecheck/build змінених частин згідно зі спільними правилами. Записати команди, результат і невиконані критерії. Залежні наступні тікети не є виконаними фактом завершення цього.

## Реалізація

- Публічні агрегати читають опубліковані snapshots у транзакції PostgreSQL з рівнем ізоляції Repeatable Read. Версія, site і page походять з одного читання. Курсор прив’язаний до мови, версії та списку. Наступна історія визначається порядком `sortOrder, id`.
- Sitemap формує мовні адреси головної та історій і їхні альтернативи. JSON і медіаредиректи мають `Cache-Control: no-store`.
- Медіамаршрут перевіряє активне опубліковане посилання, статус READY і належність WebP варіанта. Після архівації останнього посилання маршрут повертає 404. Уже видана URL може працювати до завершення `SIGNED_URL_PREVIEW_TTL` (щонайбільше 3600 секунд). Підписаний GET також запитує `private, no-store`.

Backend lint, typecheck, build і `portfolio:contracts:check` пройшли. Пройшли 6 інтеграційних тестів `portfolio-persistence` на локальній `photo_cloud_test` і 3 HTTP e2e у `portfolio-publication`. Підписання перевірено через тестовий StorageService. Frontend lint, typecheck і `build -- --webpack` пройшли. Next.js попередив про два lockfile.

## Поза областю роботи

Впровадження Redis виконується в наступному обов’язковому PF-CONTENT-06A; деплой поза планом.
