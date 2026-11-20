# L10N-02 — Маршрути, перемикач і збереження стану

**Статус:** Backlog. **Залежності:** L10N-01. **Пріоритет:** P2. **Область:** frontend/auth.

## Робота

Прочитати [рішення та правила](../README.md). Додати /uk і /en для портфоліо, login/dashboard і /g/[token]. Старі URL перенаправляти зі збереженням шляху/query/hash без loops. Залежний від cookie/header redirect не повинен бути незмінним cached permanent redirect. API/BFF, refresh/callback routes, assets, health та storage URLs не префіксувати. Auth returnTo зберігає locale та захист від open redirect.

UK / EN доступний на desktop/mobile в усіх shells, із keyboard/screen-reader підтримкою. Ручний вибір записує cookie. Router transition зберігає форму бронювання, editor state, відкритий photo ID й upload queue. Розмістити власників стану вище мовного сегмента або застосувати мінімальний еквівалент; не додавати глобальний store без потреби. Unsaved авторський текст не перекладати й не перезаписувати. Ізолювати застарілі reads після переключення.

## Критерії приймання

- [ ] Старі /, /stories/*, /login, /dashboard/*, /g/* працюють; API/refresh/assets не перенаправляються як сторінки.
- [ ] URL має пріоритет над cookie; перший вхід без prefix використовує browser preference.
- [ ] Playwright перемикає мову під час upload: PUT не abort/restart, progress/retry не губляться.
- [ ] Booking/editor/viewer/query/hash збережені; приватні дані не переносяться в URL або persistent storage.
- [ ] Auth login/refresh/logout та noindex приватних сторінок перевірені обома мовами.

## Перевірка

Цільові routing/auth unit та Playwright, lint/typecheck/build. Записати результати й блокери; hosting не входить до обсягу.
