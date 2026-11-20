# L10N-06 — Помилки та клієнтські галереї

**Статус:** Backlog. **Залежності:** L10N-02, L10N-04. **Пріоритет:** P2. **Область:** frontend/backend/BFF.

## Робота

Прочитати [правила](../README.md) та [помилки DTO](../dto-architecture.md). ApiError зберігає code/status/message. Уточнити API/BFF коди, де загальний BAD_REQUEST/CONFLICT неоднозначний; validation errors за потреби отримують backward-compatible errors[] з field/code/дозволеними params. Не перекладати зіставленням англійських речень; raw backend message не показувати. Unknown code → локалізований загальний fallback, без внутрішніх деталей.

Перекласти private-gallery grid/viewer/navigation, кількість фото, download/archive controls, pending/processing/ready/failed, expired/revoked/invalid link, loading/empty/retry. Контент приходить з locale-selected API. Locale в query keys ізолює обидва кеші; пізня відповідь попередньої мови не перезаписує поточну.

Мова не змінює original/ZIP identity, filenames чи access validation; переключення не створює повторний archive job. Зберігати photo ID та поточний archive request.

## Критерії приймання

- [ ] Auth/gallery/upload/archive/rate-limit/validation codes та network/unknown fallback мають uk/en повідомлення.
- [ ] BFF не губить code; raw DB errors, tokens/signed URLs не з'являються в UI/логах.
- [ ] Playwright перевіряє invalid/revoked/expired link, fullscreen keyboard/mobile, single original download й async ZIP обома мовами.
- [ ] Перемикання зберігає photo ID/archive job; filenames та вміст ZIP не змінюються.

## Перевірка

Цільові error-contract unit/integration та Playwright, lint/typecheck/build. Записати результати й блокери.
