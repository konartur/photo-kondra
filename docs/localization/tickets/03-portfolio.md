# L10N-03 — Портфоліо, бронювання та SEO

**Статус:** Backlog. **Залежності:** L10N-02; для DB mode — відповідні PF-CONTENT тікети. **Пріоритет:** P2. **Область:** frontend/portfolio.

## Робота

Прочитати [рішення](../README.md) і [DTO](../dto-architecture.md). Перекласти весь поточний статичний контент: home, шість історій, послуги/ціни, navigation/footer, alt/aria, booking validation і текст заявки для копіювання, loading/empty/not-found/errors. Підготувати словники в коді без машинного перекладу під час перегляду. Бренд та імена залишаються власними назвами; UAH не конвертується.

Згенерувати обидві мови story params зі спільними slug; html lang, title/description, OG locale/alternate, canonical/hreflang та sitemap відповідають мовному URL. Зберегти перевірку APP_URL і noindex для приватних сторінок/preview.

Майбутня CMS використовує локалізовані admin DTO, вибрані public strings, двомовні атомарні snapshots і locale в Redis/query/cursor context. Узгодити PF-CONTENT-01/02/04/05/06/06A/07/08/09/10; не реалізовувати CMS як передумову перекладу статичного сайту.

## Критерії приймання

- [ ] Усі вбудовані тексти та скопійована заявка мають uk/en версії; не надсилати заявки під час тестів.
- [ ] Старі шість story URL працюють; обидві мови мають правильні lang/canonical/hreflang/OG/sitemap.
- [ ] Booking data зберігаються після перемикання, UAH незмінна.
- [ ] Playwright перевіряє mobile/desktop, keyboard, clipboard та metadata обома мовами; довгі тексти не ламають layout.

## Перевірка

Цільові unit/Playwright, lint/typecheck/build. Записати результати; CMS-критерії не вважати виконаними перевіркою лише статичного сайту.
