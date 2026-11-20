# L10N-01 — Словники й визначення мови

**Статус:** Backlog. **Залежності:** немає. **Пріоритет:** P2. **Область:** frontend.

## Робота

Прочитати [погоджені рішення та правила](../README.md). Впровадити типізовані словники uk/en за областями common/portfolio/auth/admin/public-gallery; завантажувати тільки вибрану мову. Вибрати мінімальний сумісний з установленим Next.js механізм після читання локальної документації. Не додавати remote translation service.

Визначати мову за URL → cookie → Accept-Language → en. Cookie лише uk/en, path=/, SameSite=Lax, Secure на HTTPS; SSR читає її без спалаху іншої мови. Intl форматує uk-UA/en, UAH, дати та множини; погодити одну timezone для SSR/client без зміни UTC wire format.

## Критерії приймання

- [ ] Тести пріоритетів, malformed cookie/header, quality weights, uk-UA/en-*, q=0 і fallback en.
- [ ] Перевірка однакових ключів і параметрів словників; відсутній ключ не потрапляє в UI.
- [ ] Завантажується потрібна локалізація без серверних модулів у browser bundle.
- [ ] Перевірені 1/2/5/21/22/25 фото, UAH, дати, SSR/client consistency без hydration mismatch.

## Перевірка

Цільові unit-тести та lint/typecheck/build; записати команди, результати й блокери за спільними правилами. Створення тікета не означає виконання.
