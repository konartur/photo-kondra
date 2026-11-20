# PF-CONTENT-06 — Публічні агрегати, sitemap і безпечні медіамаршрути

**Статус:** Backlog; не реалізовано. **Область продукту:** лише портфоліо.
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

- [ ] Сайт отримує повні screen DTO без додаткових lookup ID і без витоку draft/keys/originals.
- [ ] Публічний media endpoint не видає чернетки й довільні keys; TTL відкликання задокументований.
- [ ] Pagination, ETag/version за потреби та consistent read перевірені; Swagger відповідає JSON.

## Перевірка

Виконати цільові перевірки поведінки, зазначені вище, та lint/typecheck/build змінених частин згідно зі спільними правилами. Записати команди, результат і невиконані критерії. Залежні наступні тікети не є виконаними фактом завершення цього.

## Поза областю роботи

Впровадження Redis виконується в наступному обов’язковому PF-CONTENT-06A; деплой поза планом.
