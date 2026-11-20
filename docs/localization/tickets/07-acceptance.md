# L10N-07 — Наскрізне приймання локалізації

**Статус:** Backlog. **Залежності:** L10N-03, L10N-05, L10N-06. **Пріоритет:** P2. **Область:** testing/documentation.

## Робота

Прочитати [спільні правила](../README.md). Матриця uk/en: portfolio/booking/login/admin/public-gallery × перший вхід/ручний вибір/явний locale URL/старий URL. Оновити fixtures/selectors поточних тестів зі збереженням перевірок поведінки. Перевірити metadata/SEO/noindex, accessibility, українські множини й відсутність неперекладених системних текстів.

Двомовний сценарій: login → gallery uk/en → direct upload → processing → private link → public view → original → async ZIP. Перемикати мову посеред upload, booking та fullscreen; invalid/expired/revoked token перевірити обома мовами. Для реалізованої CMS додатково перевірити атомарний publish, locale isolation Redis/cursors та інвалідацію; статичний сайт не закриває ці критерії.

Оновити основний README: мовні маршрути, cookie/fallback, додавання словникових ключів та content translations, backfill/legacy marker, команди перевірок. Невиконані залежності записати явно. Hosting лишається відкладеним.

## Критерії приймання

- [ ] Lint/typecheck/unit/build та релевантні backend/frontend E2E пройдені; фактичні команди/результати записані.
- [ ] Немає hydration mismatch, flash іншої мови, втрати стану чи перезапуску uploads.
- [ ] Старі public/private URL доступні; немає redirect loops/open redirects.
- [ ] Словники повні, новий контент двомовний; legacy fallback перевірений і документований.
- [ ] CMS-критерії перевірені або явно залишені відкритими з залежностями; жодного deployment/production schema change.
