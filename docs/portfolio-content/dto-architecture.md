# DTO-архітектура портфоліо

**Стан:** специфікація. Точні wire-поля — у [dto-contracts.ts](dto-contracts.ts); lifecycle — у [architecture.md](architecture.md).

## Шари та розміщення

```text
backend/src/portfolio/
  dto/shared/             price, image, focal-point, seo, cursor
  dto/public/             site, home, service, story, page, sitemap
  dto/admin/              draft inputs, updates, media, publication, preview
  portfolio-admin.controller.ts
  portfolio-public.controller.ts
  portfolio-media.controller.ts
  portfolio.service.ts
  portfolio-public-reader.ts
  portfolio-public-cache.service.ts
  portfolio-cache-invalidation.service.ts
  portfolio-public.mapper.ts
  portfolio-publication.service.ts
  portfolio-media.service.ts
  portfolio.module.ts
frontend/lib/portfolio/
  contracts.ts            generated from OpenAPI, no Nest/Prisma runtime imports
  server.ts               server-only loader and response validation
frontend/app/_portfolio/  existing rendering, consuming public contracts
```

Невеликі внутрішні модулі можна об’єднати, якщо це зберігає читабельність; головне — відокремити запис чернетки, публікацію й public projection. Не створювати універсальну CMS.

## Публічні DTO

| DTO | Призначення |
| --- | --- |
| PortfolioSiteDto | Brand, locale, погоджені контакти й доступні типи зйомки |
| PortfolioHomeDto | Hero mobile/desktop, тексти секцій, розгорнуті service cards і featured story cards, contact background, SEO |
| PortfolioServiceDto | Напрям, ціна, card image, SEO і сторінка історій |
| PortfolioStoryDto | Серія, обкладинка, напрям, масив до 10 кадрів, nextStory, SEO |
| PortfolioPageDto<T> | site + page + contentVersion з одного узгодженого читання |
| PortfolioSitemapDto | Лише чинні public paths і час їх зміни |

PortfolioImageDto є спільним контрактом: mediaId, url, width/height, variants з width/height, alt, focalPoint. Width/height — реальні розміри відповідного файла після обробки. Focal point належить розміщенню, а не глобальному файлу.

На відміну від початкових прикладів, home одразу отримує service cards, а не serviceIds. Сайт не потребує додаткового запиту для їх відображення. Бронювання і ціна service detail походять з однієї опублікованої версії напряму.

## Admin DTO

Вхідні поля містять mediaId, а не довільні URL/ключі сховища. Поля id, статус, publishedAt, storageKey, ownerId і revision обчислює backend. Послідовність масиву визначає sortOrder; клієнт не передає обидва механізми.

- Create service/story: відповідний DraftInputDto; результат AdminPortfolioEntityDto з draftVersion=1.
- Replace draft: DraftUpdateDto<T> з expectedVersion і повним data. PUT замість неоднозначного часткового PATCH.
- Home/site draft: PortfolioHomeDraftInputDto, settings singleton.
- Story photos: ReplaceStoryPhotosDto — атомарне повне заміщення впорядкованого списку, максимум 10 унікальних фото на історію, враховуючи cover. Воно збільшує версію історії.
- Publish/archive/delete: PublicationCommandDto. Оптимістична конкуренція, а не last-write-wins.
- Admin entity response: draftVersion, publishedVersion, hasUnpublishedChanges та draft; без public snapshot як mutable входу.
- Media: RequestPortfolioUploadDto, PortfolioUploadResponseDto, AdminPortfolioMediaDto.
- Preview: PortfolioPreviewDto<T>. Чернетка має пройти перевірку повноти; інакше 409. Авторизований preview використовує приватні media routes і ніколи public cache.

Поле status не передається при редагуванні контенту: publish/archive — окремі операції. Archived entity можна публікувати повторно після перевірки повноти.

## API-маршрути

У таблиці шляхи NestJS відносні до /api/v1. Same-origin BFF frontend використовує поточні правила проєкту; це не дозвіл виставити внутрішній NestJS напряму назовні.

| Метод і шлях | Контракт |
| --- | --- |
| GET /public/portfolio/site | { data: PortfolioSiteDto, contentVersion } |
| GET /public/portfolio/home | PortfolioPageDto<PortfolioHomeDto> |
| GET /public/portfolio/services?limit&cursor | CursorPageDto<PortfolioServiceCardDto> + contentVersion |
| GET /public/portfolio/services/:slug?limit&cursor | PortfolioPageDto<PortfolioServiceDto> |
| GET /public/portfolio/stories/:slug | PortfolioPageDto<PortfolioStoryDto> |
| GET /public/portfolio/sitemap | PortfolioSitemapDto |
| GET /public/portfolio/media/:mediaId/variants/:variantId | 302 signed derivative redirect, no-store; 404 якщо не опубліковано |
| GET /portfolio/services або /stories?limit&cursor | Захищений список admin summary з id/title/slug/status/версіями; без усіх фото |
| POST /portfolio/services або /stories | DraftInputDto → 201 Admin entity |
| GET /portfolio/services/:id або /stories/:id | Admin entity; story photos одним масивом до 10 |
| PUT /portfolio/services/:id або /stories/:id | DraftUpdateDto<T> → 200 Admin entity |
| GET/PUT /portfolio/settings | Admin entity / DraftUpdateDto<PortfolioHomeDraftInputDto> |
| PUT /portfolio/stories/:id/photos | ReplaceStoryPhotosDto → 200 AdminPortfolioStoryDto |
| POST /portfolio/{services,stories}/:id/{publish,archive} | PublicationCommandDto → PortfolioPublicationResponseDto |
| POST /portfolio/settings/{publish,archive} | Той самий lifecycle singleton |
| DELETE /portfolio/{services,stories}/:id | PublicationCommandDto → 204, лише якщо не опубліковано й немає посилань |
| GET /portfolio/{services,stories}/:id/preview або /portfolio/settings/preview | Авторизований preview відповідної page projection |
| POST /portfolio/media/upload-url | RequestPortfolioUploadDto → 201 PortfolioUploadResponseDto |
| POST /portfolio/media/:id/upload-complete | 202 AdminPortfolioMediaDto; повторне завершення — чинний стан |
| GET /portfolio/media?limit&cursor та /portfolio/media/:id | Admin media list/detail |
| GET /portfolio/media/:id/variants/:variantId | Авторизований preview redirect, no-store |
| DELETE /portfolio/media/:id | 204; лише якщо немає draft/published посилань |

Створити конкретні класи для всіх response wrappers, admin summaries, media list і query DTO у першому тікеті. Довідкові generic interfaces не повинні потрапити в OpenAPI як порожні schemas. Параметри limit/cursor стосуються списків історій/медіа, а не кадрів однієї історії. StoryDto.photos і admin story.photos — масиви до 10 без pagination; обкладинка врахована у ліміті. Site/metadata не змінюються через сторінку списку.

## Валідація та серіалізація

- UUID — реальний UUID; slug — lowercase ASCII [a-z0-9]+(-[a-z0-9]+)*, 1..80. Напрями та історії мають окремі простори унікальності.
- Trim текстів. Title/brand/label максимум 120 символів; subtitle максимум 200; description максимум 4000; SEO title максимум 120, SEO description максимум 320; alt максимум 500. Поля, потрібні для публікації, можуть бути порожніми у draft, але publish відхиляє їх.
- Arrays: home services максимум 20, featured stories максимум 12, contacts максимум 3 (type unique), story photos максимум 10 унікальних mediaId разом із cover; бібліотека портфоліо загального ліміту не має. При перевищенні повернути 400, не обрізати мовчки.
- Вкладені DTO: ValidateNested/Type та явні Swagger schemas; глобальний whitelist/forbidNonWhitelisted зберегти. Не використовувати IsOptional для полів, де null заборонений; розрізняти omitted/null.
- Response fields присутні завжди; nullable позначений явно. price=null означає індивідуальну ціну. Share image та nextStory можуть бути null.
- amountMinor і durationMinutes — цілі числа в межах контракту; focal x/y — finite 0..1; versions — додатні safe integers (contentVersion починається з 0 до першої публікації).
- Контакти: Instagram/Telegram — HTTPS на дозволених хостах цих каналів без credentials; email перевірити як email, href mailto побудувати сервером. Текст заявки не додавати до URL.
- Дати в JSON — ISO 8601 UTC; BigInt size — десятковий рядок; гроші не float.
- Default pagination limit=24, max=50; стабільне сортування (sortOrder, id). Opaque cursor містить контекст і contentVersion/draftVersion: при зміні версії повернути 409 PORTFOLIO_CURSOR_STALE й почати список заново.
- Input sizeBytes — safe integer 1..10 000 000 (10 МБ), формати JPEG/PNG/WebP. Worker створює WebP 480/960/1600 px без upscale; це ліміти саме портфоліо, а не чинних приватних галерей. File header/decode/pixel limit перевіряються worker, незалежно від DTO MIME.
- CanonicalPath, url, sizes, hasUnpublishedChanges, contentVersion та publishedAt створюються backend, а не довіряються входу.
- Public JSON не містить draft, uploadUrl, keys, оригіналів, processing lock, user/session або службових failure details.

## Помилки та коди

Зберегти чинний формат ApiErrorDto {statusCode, code, message}, без нового exception envelope:
400 VALIDATION_FAILED; 401/403 чинної auth; 404 PORTFOLIO_CONTENT_NOT_FOUND; 409 PORTFOLIO_VERSION_CONFLICT, PORTFOLIO_NOT_READY, PORTFOLIO_CONTENT_REFERENCED, PORTFOLIO_SLUG_IMMUTABLE, PORTFOLIO_CURSOR_STALE; 503 PORTFOLIO_UNAVAILABLE. Розрізняти 404 та 503 у frontend. Swagger описує всі маршрути, вкладені schemas, nullability та помилки.

## Зміни щодо прикладів обговорення

1. Введено агрегат site+page для узгодженого читання.
2. Розгорнуті home service cards замість залежності від другого запиту.
3. Фото історії отримали cursor pagination; жодних прихованих first-four обмежень.
4. Вхідні references відокремлено від вихідних URL.
5. Чернетки, publication commands і concurrency описані окремо.
6. Public DTO обов’язково кешуються backend Redis; Next/HTTP no-store запобігає незалежному другому кешу. Admin/preview — тільки DB. Cache keys містять contentVersion із DB, publish/archive інвалідує Redis з надійним retry; Redis outage → DB fallback.
7. Фото історії — один масив до 10, без зайвої pagination; upload до 10 МБ, похідні 480/960/1600 px. MVP імпортує всі 21 початкових фото без загального ліміту медіабібліотеки.



## Доповнення: локалізація від 2026-11-20

Власник погодив двомовний сайт. [План L10N](../localization/README.md) та [DTO-правила](../localization/dto-architecture.md) доповнюють цю специфікацію та мають пріоритет над попередніми одномовними прикладами. Admin editorial texts (title, description, subtitle, alt, caption, label, SEO, booking intro) — LocalizedTextDto {uk,en}; brand, price, slug, refs, filenames та порядок спільні. Home settings більше не задає єдину мову контенту. Public strings лишаються string, вибраними за locale; PortfolioSiteDto повідомляє locale і supportedLocales.

Public/preview readers приймають locale query uk|en (legacy omission → en; unsupported → 400). PortfolioServiceListDto — конкретний locale/contentVersion envelope списку; sitemap містить обидві мовні адреси та alternates. Canonical/hreflang server-derived, шість slug незмінні, старі URL перенаправляються.

Обидві мови публікуються одним snapshot/contentVersion. Draft допускає порожні переклади зі збереженням обох ключів; publish/preview перевіряють повноту обох мов. Для декоративного alt дозволена порожня пара за явним правилом розміщення. Locale входить у Redis/query/cursor/server-loader context; publish/archive інвалідують обидві версії, version fence не змінюється. Нові snapshot schemas мають версію; не читати старий одномовний snapshot як двомовний без контрольованого імпорту.

PF-CONTENT-01/02/04/05/06/06A/07/08/09/10 включають ці вимоги до реалізації й приймання. Статичне портфоліо локалізується окремо в L10N-03; жодної CMS або runtime API зміни цим документом не виконано.
