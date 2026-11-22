# PF-CONTENT-07 — Перевести публічне портфоліо на server DTO

**Статус:** Реалізовано й перевірено локально. **Область продукту:** лише портфоліо.
**Залежності:** PF-CONTENT-06A. Порядок і посилання — у [індексі](README.md).

## Мета та область роботи

frontend/lib/portfolio/server.ts; existing _portfolio; / і /stories/[slug]; metadata/sitemap.

## Інструкції агенту

Прочитати [спільні правила](README.md#правила-виконання), [архітектуру](../architecture.md) і [DTO-специфікацію](../dto-architecture.md).

1. Перед Next.js кодом прочитати локальні docs відповідної версії. Створити server-only loader із перевіркою відповіді, timeout і Next fetch no-store поверх обов’язкового backend Redis; не створювати інший кеш, що приховає інвалідацію.
2. Site+page використати одним loader для render/metadata; прибрати runtime hardcoded контент, positional selection і first-four rendering.
3. Зберегти чинні URL/legacy hash, теми, hero, motion, booking privacy та keyboard behavior. Новий slug має працювати без build.
4. Використати BFF media URLs і responsive variants, home contacts/price з DTO; показати весь масив до 10 фото без pagination, з lazy loading поза першим екраном.
5. Розрізняти notFound/unavailable/empty; FILE/DB лише серверний migration flag, не fallback при відмові API.

## Критерії приймання

- [x] Головна та історії працюють на DTO, metadata й sitemap узгоджені з published контентом.
- [x] Зміна опублікованого DTO і поява нового slug відображаються без rebuild. Неопублікований slug повертає 404.
- [x] Booking, menu, viewport, theme, приватні галереї й auth пройшли браузерні перевірки.

## Перевірка

Виконати цільові перевірки поведінки, зазначені вище, та lint/typecheck/build змінених частин згідно зі спільними правилами. Записати команди, результат і невиконані критерії. Залежні наступні тікети не є виконаними фактом завершення цього.

## Поза областю роботи

Новий публічний дизайн та /services сторінки. UI/UX skill застосувати лише якщо реально змінюються інтерфейси.

## Підключення та перевірка

- `PORTFOLIO_CONTENT_MODE=FILE` залишається режимом за замовчуванням до імпорту PF-CONTENT-09. У серверному середовищі Next.js `PORTFOLIO_CONTENT_MODE=DB` вмикає читання через `API_URL` та чинний BFF. Для canonical, Open Graph і sitemap потрібен дійсний HTTPS origin у `APP_URL`.
- Режим DB зберігає українські адреси `/` і `/stories/:slug` та додає адреси `/uk` і `/en`, які повертає sitemap. Старий hash `#story/:slug` переводить на сторінку історії. Нові slug обробляються під час запиту.
- Metadata та сторінка разом використовують перевірений site+page DTO в межах одного рендера. Відсутня історія повертає 404, порожня головна й тимчасова недоступність мають окремі стани та noindex. Sitemap повертає 503 при відмові API.
- У DB режимі booking використовує доступні напрями, ціну, вступ і контакти з DTO. Медіаваріанти та focal point приходять із DTO і відображаються через наявні стилі та same-origin маршрут.

`npm run lint`, `npm run typecheck` і production build в обох режимах пройшли. Playwright пройшов 3 сценарії DB із синтетичними HTTP DTO (`PHOTO_CLOUD_PORTFOLIO_DB_E2E=1 npm run test:e2e`) та 58 сценаріїв FILE (`npm run test:e2e`). DB fixture перевіряє зміну опублікованої версії без збірки, відсутність чернетки, один API read для render і metadata, 10 фото, ціни, sitemap і стани помилок. Приймання з імпортованим контентом належить PF-CONTENT-09/10.
