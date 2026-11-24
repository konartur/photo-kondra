# PF-UX-05 — Атомарне збереження всієї історії

**Статус:** Реалізовано, перевірки відкладено.
**Залежить від:** PF-UX-04.
**Порядок і правила:** [PF-UX-00](PF-UX-00-INDEX.md).
**Вимоги:** [UX-план](docs/portfolio-content/admin-ux-plan.md).

## Початок роботи

Прочитати індекс перед змінами. Орієнтири для огляду актуального коду: portfolio-admin.controller/service, DTO історії, BFF stories routes, portfolio-workspace.tsx.

## Обсяг

1. Додати мінімальну сумісну операцію, яка зберігає текст, обкладинку, фото та порядок однією Prisma-транзакцією.
2. Один expectedVersion перевіряє весь запис; успішне збереження збільшує версію один раз. Повернути актуальні дані історії.
3. Зберегти чинні окремі endpoints для сумісності, якщо вони використовуються іншими клієнтами; документувати новий запит у Swagger.
4. Перевести редактор історії на одну дію збереження. Оновлювати baseline і скидати dirty лише після успіху.
5. На помилці/409 зберігати введені дані, не показувати частковий успіх як завершений і не дозволяти publish старої версії як нової.

## Критерії приймання

- [ ] Текст, обкладинка й фото зберігаються разом або не змінюються.
- [ ] Конкурентна правка відхиляється без перезапису чужої версії.
- [ ] У редакторі одна дія збереження історії.

## Межі

Не перебудовувати модульну архітектуру і не додавати окрему систему версій.

## Перевірки

За вказівкою власника запуск тестів, lint, typecheck, build і браузерне QA відкладено до [PF-UX-14](PF-UX-14-final-acceptance.md). На цьому кроці — огляд коду й diff та запис сценаріїв для фіналу. Критерії вище описують цільову поведінку; їх остаточне підтвердження виконується у PF-UX-14.

## Запис виконання

### Зміни

- Зміни: додано `POST /api/v1/portfolio/stories/draft` з `{data,items}` для створення та `PUT /api/v1/portfolio/stories/:id/draft` з `{expectedVersion,data,items}` для повної заміни чернетки. DTO зберігають whitelist/nested validation, 0..10 фото й унікальність placement/media IDs. Swagger документує запити, авторизацію, response та помилки. Старі POST /stories, PUT /stories/:id і PUT /stories/:id/photos збережені.
- Атомарність: create використовує спільний createStoryWithPhotos, зокрема для чинного імпортера. Update працює всередині наявного withContentLock (Serializable + повтори): читає запис, один раз claimDraftVersion, перевіряє immutable slug, union фото/обкладинки, фотосесію, ownership невидалених медіа та зайняті placement IDs, оновлює draft і повністю замінює ordered photo placements. Помилка будь-якого кроку відкочує всю транзакцію разом із версією. Фото зі сховища не видаляються; published snapshot не змінюється.
- Frontend/BFF: додано route handlers для combined endpoints із чинними auth/JSON/body-size/no-store перевірками. Одна форма та одна кнопка «Зберегти чернетку» зберігають опис, обкладинку, фото й порядок. PhotoFields доступні й для нового запису до першого save. Dirty враховує обидві частини, baseline draft/photos оновлюється тільки повним успішним response. Для переходу new→id повні дані відповіді спершу потрапляють у query cache, тому новий редактор отримує також збережені фото.
- Конкуренція/відновлення: локальний pendingRef захищає від повторного запуску мутації до React rerender. Помилки/409 лишають draft/photos у формі; conflict блокує save/publish до явного розв’язання. Старі перевірки проти savedCover/savedPhotos та вимога послідовних save прибрані: ліміт перевіряється на цілісному поточному наборі.
### Файли

- Файли: backend `dto/admin-input.dto.ts`, `portfolio-admin.controller.ts`, `portfolio-admin.service.ts`; frontend `lib/api/portfolio-admin-server.ts`, `app/api/portfolio/stories/draft/route.ts`, `app/api/portfolio/stories/[id]/draft/route.ts`, `portfolio-workspace.tsx`, `portfolio-story-photos.tsx`.
- Контракти: на окремий запит власника перед merge виконано `npm --prefix backend run portfolio:contracts` та `npm --prefix backend run portfolio:contracts:check`; обидві команди завершилися успішно, включно з backend build. Оновлено `docs/portfolio-content/openapi.json` і `frontend/lib/portfolio/contracts.ts` для накопичених змін PF-UX-02–05. Артефакти згенеровано, вручну не змінювалися. Response залишається AdminPortfolioStoryDto.
### Відкладені перевірки

- Відкладені перевірки PF-UX-14: full create з фото й порожній create; data/items whitelist, duplicate placement/media IDs, union=10/11, чужий/видалений файл, placement ID іншої історії, неіснуюча фотосесія, immutable published slug; single version increment; stale expectedVersion; rollback після update/deleteMany/createMany failure; дві конкурентні сесії; retries Serializable; нові BFF routes, JSON/UUID/body-size/auth/no-store; регресія старих endpoints й імпортера; одна кнопка для photo-only edits; new→id без втрати фото; одночасна заміна 10 фото та cover без проміжних станів; 409 збереження правок і блок publish; timeout після commit; повторний submit; контрактна генерація, lint/typecheck/tests/build і browser QA.
- Огляд: виконано читання коду та diff. Статична перевірка TypeScript AST підтвердила, що PhotoFields вкладено у form і всі 15 кнопок picker/upload/photo controls мають type="button". hasInvalidFields перевіряє всі descendant data-portfolio-field, включно з cover/photo details; порожні alt лишаються допустимими, бо не мають required і не включені до save missing-fields. Генерація/перевірка контрактів та backend build пройшли; unit/integration/E2E, frontend build/typecheck/lint і браузерне QA не запускалися. Критерії приймання ще не підтверджені повністю.
- Блокери: на етапі огляду коду не виявлено; працездатність ще не перевірена. Міграції й зміна архітектури не потрібні.

