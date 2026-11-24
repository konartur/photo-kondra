# PF-UX-14 — Фінальні тести та наскрізне приймання

**Статус:** Частково виконано. Автоматичні локальні перевірки пройшли; повне приймання заблоковано відсутністю тестової PostgreSQL/Docker.
**Залежить від:** PF-UX-01–13.
**Порядок і правила:** [PF-UX-00](PF-UX-00-INDEX.md).
**Вимоги:** [UX-план](docs/portfolio-content/admin-ux-plan.md).

## Початок роботи

Прочитати індекс перед змінами. Орієнтири для огляду актуального коду: backend unit/integration/e2e, frontend Playwright, контрактні артефакти й звіт цього пакета.

## Обсяг

1. Зібрати записи ризиків і відкладених сценаріїв усіх тікетів. Додати/оновити змістовні тести інваріантів, потім запустити перевірки вперше для цього пакета.
2. Перевірити backend: incomplete draft проти publish, DTO whitelist/ownership, атомарність story save/rollback, expectedVersion/409, залежності, snapshots, fallback добірок, SEO й захист admin preview.
3. Перевірити UI: single/multiple picker, пошук за межами першої сторінки, upload/retry, readiness, ліміт 10, обкладинка, reorder, alt/focalPoint.
4. Пройти create → неповний save → reload → доповнення uk/en → save-and-preview → повернення → publish → public page; повторити редагування опублікованого запису, старий snapshot до publish, помилки та конкурентну сесію.
5. Перевірити головну/контакти як спільний singleton, попередження про втрату змін, URL Back/Forward, списки й фільтри, стан preview при зміні версії.
6. Виконати lint, typecheck, unit tests і build обох частин за актуальними package.json, релевантні integration/backend HTTP e2e та frontend Playwright; root test:e2e не замінює frontend suite.
7. За зміни контрактів виконати чинний portfolio:contracts workflow та --check, переглянути diff OpenAPI/generated types. За additive Prisma-міграції перевірити її на тестовій БД; не застосовувати до production.
8. Виконати браузерне приймання desktop/mobile, клавіатури, фокуса, touch targets, контрасту, нижньої панелі/safe area. Звірити реальний preview з опублікованою сторінкою.
9. Виправити знайдені дефекти та повторити відповідні перевірки. Записати команди, результати, відомі обмеження й невиконані критерії; лише після цього позначити пакет прийнятим.

## Критерії приймання

- [ ] Усі критерії PF-UX-01–13 підтверджені результатами перевірок.
- [ ] Межа draft/public, атомарність, авторизація та конкуренція покриті тестами.
- [ ] Звіт містить фактичні результати; за блокерами пакет залишається неприйнятим.

## Зауваження до PR #35, перенесені власником на фінал

- [x] Винести чисту `assertStoryPhotos` перед `this.write(...)` у `saveStoryDraft`, щоб не повторювати її у Serializable-retry. Перевірки БД/версії/ownership залишити всередині транзакції.
- [x] Додати відновлення після timeout: при повторному 409 зробити refetch; трактувати запит як успішний лише коли серверні data/items відповідають усьому відправленому стану й версія сумісна з завершеним save. Справжні конкурентні правки залишаються конфліктом.
- [ ] Мінімальні backend тести: 10 фото з обкладинкою серед них; 11 унікальних media; чужий placement ID; stale expectedVersion; rollback при падінні createMany; незмінна public відповідь після збереження чернетки опублікованої історії.
- [x] Позначити legacy story create/update/photos endpoints deprecated у Swagger; читання, preview, publish і archive залишити чинними. Після зміни metadata повторно згенерувати контракти.
- [x] Прибрати зайвий порожній рядок наприкінці portfolio-workspace.tsx та перегрупувати щільний «Запис виконання» PF-UX-05 у короткі списки змін, файлів і відкладених перевірок.

Пункти 1, 2 і 5 рев’ю виконано у PR #35: перевірено охоплення form/порожніх alt, типи 15 кнопок та успішно запущено генерацію контрактів і --check (разом із backend build). Це не замінює поведінкові тести вище.

## Приймання правок PR #36

- [x] Панель дій на 375/320 px і при text zoom 200% без обрізання підписів.
- [ ] Порахувати мережеві запити при відкритті історії з 10 фото та головної: READY-медіа й залежності з уже завантажених списків не запитуються повторно; polling лише для PROCESSING.
- [x] Save + preview неповної чернетки: save успішний, пояснення недоступного preview зрозуміле, чекліст відкрито; оновлюються лише поточний запис і медіа.
- [ ] `focusField` для медіа й залежностей: фокус/прокрутка до поля; за відсутності поля — до секції фото або форми з повідомленням.
- [x] Юніт-тести `requiredDraftFields` і `describePortfolioField`: усі гілки типів сторінок, полів, uk/en, підписів фото й залежностей.
- [x] Юніт-тести `deriveEditorStatus`: new, dirty, published, archived, conflict, pending і readiness; недоступна публікація пояснюється без запиту мутації.
- [ ] Зміна одного поля знімає лише його помилку, зберігаючи помилки інших полів, включно з вкладеними фото.
- [ ] Закриття preview доступне під час конфлікту; URL сайту враховує спільну локаль і кодування slug.

## Межі

- [ ] PF-UX-07: public regression після presentation extraction; iframe CSS/fonts, реальні media queries wide/mobile, uk/en; збереження редактора/scroll/focus; клавіатура й скринрідер; відсутність переходів/бронювання; stale version, partial draft і приватні derivatives без кешування.

Локальне приймання без деплою. Відсутність зовнішніх сервісів записати як блокер, а не успішний тест.

## Перевірки

Усі відкладені перевірки виконуються тут. Результати й блокери записати нижче; невиконані перевірки не позначати успішними.

## Запис виконання

### Реалізація й виправлення

- Перенесено assertStoryPhotos перед транзакцією; legacy story endpoints deprecated. Timeout → повторний 409 відновлюється як success лише після refetch, точного порівняння всього draft/photos та очікуваної наступної версії.
- Виправлено thumbnailMediaId у списку історій, ефекти навігації, readiness focus та доступність media picker. Preview має native modal dialog; закриття повертає фокус без стрибка прокрутки. READY фото повторно використовуються також у PhotoPreview.
- Додано зведення всієї спільної settings-публікації. Fallback добірок винесено в чисту функцію; відсутній published snapshot не трактується як валідний fallback.
- Згенеровано OpenAPI/types, задокументовано query/filter та fallback semantics. Нотатки PF-UX-05/06 згруповано.

### Успішні перевірки (2026-11-24)

- Backend: portfolio:contracts і portfolio:contracts:check (включно з build); lint; typecheck.
- Повний backend unit run: 42 suites / 298 tests passed. Після додавання filter-context case окремий portfolio-admin-cursor run: 3 passed. Нові 5 admin save tests і 2 featured defaults tests входять у повний run.
- Backend HTTP e2e: portfolio-publication — 4 passed поза sandbox; початковий EACCES loopback у sandbox не був дефектом API.
- Frontend: lint без зауважень; typecheck; production Turbopack build у .next-pfux14 і production webpack builds у Playwright. Залишається попередження Next про кілька lockfile.
- Frontend pure tests: 4 passed через portfolio-unit.config.ts (додано npm run test:unit): requiredDraftFields, labels, translation progress, editor statuses, SEO limits/preservation, timeout comparison, selective field errors.
- Playwright editor/upload: 22 passed у Chromium і WebKit. Пошук/фільтри/повернення до списку, incomplete save+preview із відкритим чеклістом, blocked publish без запиту, shared page preview/uk-en/mobile frame, conflict preservation, timeout recovery, settings navigation/history/save, 10 photos/reorder, 375/320 px та text size 200%, create→save→preview без втрати стану, English error focus, keyboard crop, direct upload retry.
- Public DB-mode fixtures (ізольований HTTP backend, без справжньої БД): 5 passed у Chromium — metadata/publication updates, uk/en та mobile menu, 10-photo story і booking, empty/unavailable. Тест зміни мови відокремлено від початкового hash auto-scroll; збереження query/hash і scroll перевіряється без гонки.
- Prettier змінених frontend/test файлів; git diff --check без помилок.

### Блокери й невиконане приймання

- PORTFOLIO_TEST_DATABASE_URL не задано; Docker daemon недоступний. Новий portfolio-story-save.integration-spec.ts запущено, але 2 сценарії зупинилися на захисній перевірці тестової БД. Реальний rollback createMany та незмінна public card після draft save НЕ підтверджені; unit-мок не підміняє ці перевірки.
- Для завершення потрібна мігрована окрема локальна *_test PostgreSQL та запуск portfolio persistence/story-save integration suites; не використовувати production URL.
- Наскрізний реальний upload→processing→publish із S3/Redis, конкурентні DB-сесії, усі off-page picker/media failure cases, touch/safe-area/мобільна клавіатура й повне ручне screen reader приймання ще не виконані. Загальні критерії пакета лишаються відкритими.
- EditorToolbar залишається відкладеним окремим рефакторингом за попереднім рішенням власника.
