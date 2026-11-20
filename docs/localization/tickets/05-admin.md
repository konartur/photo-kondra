# L10N-05 — Адмінпанель і двомовні редактори

**Статус:** Backlog. **Залежності:** L10N-02, L10N-04. **Пріоритет:** P2. **Область:** frontend/admin.

## Робота

Прочитати [правила](../README.md) та [DTO](../dto-architecture.md). Перекласти login/session unavailable, dashboard, gallery CRUD, photos, upload/progress/retry/cancel, access links, confirmations та всі loading/empty/error стани. API enum-коди не змінювати — локалізувати їх у UI.

Gallery editor має поля Українською / English для title/description, заповнені з translations. Мова UI не приховує вимогу заповнити іншу версію. Показувати legacy translationReviewRequired та validation біля потрібного мовного поля. Form/API validation синхронні. Не перезаписувати unsaved дані при перемиканні.

Майбутній PF-CONTENT-08 editor використовує двомовні title/description/alt/SEO/booking тексти й перевіряє обидві мови перед publish; ціни, refs, slug та порядок спільні.

## Критерії приймання

- [ ] Create/edit передає новий DTO: обидві назви обов'язкові; опис відсутній або заповнений обома мовами.
- [ ] Старі записи доступні з marker; явне збереження перекладу прибирає його.
- [ ] Усі admin states перекладені; filenames та API keys не змінюються.
- [ ] E2E login/create/edit/private-link/upload проходить обома мовами; перемикання зберігає форми/queue.

## Перевірка

Цільові unit/Playwright та lint/typecheck/build; інтеграція з L10N-04 до ввімкнення required input. Записати результати й блокери.
