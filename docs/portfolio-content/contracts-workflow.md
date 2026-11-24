# Runtime-контракти портфоліо

Джерело runtime-контракту — [decorated NestJS DTO](../../backend/src/portfolio/dto/index.ts); [довідковий дизайн](dto-contracts.ts) зберігається як погоджена специфікація. PF-CONTENT-03/04 додають media та admin draft routes до OpenAPI без оголошення runtime-приймання завершеним.

## Генерація

З кореня репозиторію, після встановлення чинних backend devDependencies:

```sh
npm --prefix backend run portfolio:contracts
npm --prefix backend run portfolio:contracts:check
```

Перша команда збирає backend і запускає мінімальний documentation-only Nest application без AppModule, БД, Redis, `.env`, workers та S3. Генератор читає metadata реального media controller з inert service provider, не викликає handler methods і не слухає HTTP-порт. Він створює [OpenAPI snapshot](openapi.json) і [frontend types](../../frontend/lib/portfolio/contracts.ts). Друга повторює збірку та завершується помилкою при drift. Використовуються вже наявні Swagger/Passport/Prettier, без нових залежностей. Конвертер підтримує тільки конструкції поточних DTO (refs, allOf, enums, objects, arrays, nullable, primitive types), на невідомих конструкціях відмовляє замість генерації неточного типу.

Не редагувати generated files вручну. Після зміни DTO виконати генерацію, переглянути diff і закомітити обидва артефакти разом із DTO. Frontend отримує лише TypeScript declarations; NestJS/Prisma не імпортуються до browser runtime. [Compile-only перевірки](../../frontend/tests/portfolio-contracts.typecheck.ts) звіряють concrete generated wrappers з погодженими generic wire interfaces під час frontend typecheck.

## Swagger і майбутні маршрути

PF-UX-05 додає atomic story draft endpoints: `POST /portfolio/stories/draft` (`{data,items}`) і `PUT /portfolio/stories/:id/draft` (`{expectedVersion,data,items}`). `items` — обов’язковий повний ordered список із 0..10 унікальних placements/media; cover+items union обмежено 10. Створення та update записують текст, cover й items у спільній транзакції; update збільшує draftVersion один раз. Response — чинний AdminPortfolioStoryDto. Старі story CRUD/photos endpoints залишаються сумісними. Генерацію артефактів і перевірки відкладено до PF-UX-14.

`setupApp` реєструє всі DTO як `extraModels` у `/api/docs`. Із PF-CONTENT-03/04/05 snapshot включає реалізовані media, admin draft, publication/archive та preview paths з auth/response/error schemas; раніше paths були порожніми. Наявність маршруту в артефакті не означає пройдене DB/S3 приймання. Query DTO, admin/media lists, publication і preview мають конкретні schemas. Public routes додаються у PF-CONTENT-06 з використанням тих самих класів.

`PortfolioApiErrorDto` розширює чинний `{statusCode, code, message}` лише необов'язковими деталями `errors[]`. Глобальний filter/validation response не змінювався: він поки повертає чинні три поля. Предметні коди, включно з `PORTFOLIO_UNAVAILABLE`, і повернення безпечних field errors потрібно підключати разом із відповідними операціями; наявний filter приховує специфічні 5xx codes. Schema документація цього контракту не означає, що коди вже повертаються реалізованими маршрутами.

## Межі валідації

- PF-UX-04: чернетку дозволено зберігати з порожніми текстами/перекладами, nullable зображеннями та порожнім списком фото; порожня адреса контакту теж означає незавершене налаштування. Непорожні значення проходять чинну перевірку типів, довжин, MIME/UUID/URL та whitelist. Slug і наявний serviceId історії залишаються обов’язковими ключами. Publish/preview перевіряють повноту окремо; 409 може містити безпечні `errors[{field,code}]`. Draft media refs перевіряються за ownership і невидаленим станом, publish вимагає READY з похідними. Генерація артефактів і перевірки цього пакета відкладені до PF-UX-14.
- Admin editorial fields — об'єкти з обов'язковими `uk` та `en`, без інших ключів. Draft дозволяє порожні переклади, trim і ліміти перевіряються на вході. Повнота обох мов перевірятиметься publish/preview service.
- Nullable поля обов'язково присутні; `null` дозволений лише там, де погоджено. Unknown fields, URL, storage keys, status та server-generated values у write DTO відхиляються глобальним whitelist policy.
- Фото списку мають унікальні placement/media IDs, 0..10 при заміні чернетки; публікація вимагає хоча б одне фото. `storyPhotoLimitSatisfied` перевіряє union з cover без подвоєння; PF-CONTENT-04/05 викликають її атомарно із version check, бо один DTO не знає збереженого cover.
- Upload metadata: safe integer 1..20 000 000 bytes, JPEG/PNG/WebP; PF-CONTENT-03 додає незалежні streaming byte/header/decode/pixel checks. MIME з DTO не доводить фактичний тип файла.
- Читання locale: omission → `en`, `uk/en` дозволені, інші/null відхиляються. Списки: default 24/max 50; перевірка cursor context/version — відповідальність майбутнього reader.
- Контакти: email або HTTPS profile на instagram.com/www.instagram.com чи t.me/telegram.me, без credentials, port, query або fragment. Public href генерує mapper; arbitrary URL не приймається.

Тести контракту використовують синтетичні bilingual fixtures і реальний ValidationPipe/Swagger metadata. Вони не замінюють runtime-приймання PortfolioModule на PostgreSQL/Redis/S3.

## PF-UX-09/11/14

Admin lists підтримують server-side search (title uk/en/slug) та status; cursor підписаний разом із цими фільтрами. Summary має nullable thumbnailMediaId для захищеного admin derivative. Public list query не змінено.

Порожні обидва caption у storiesSection.items означають fallback з description опублікованої історії; відсутній image — cover. Settings publish матеріалізує значення у snapshot, preview читає тільки publishedDocument STORY. Непорожній caption лишається override і потребує обох мов. Public snapshot не змінюється від story draft edit.

Legacy POST /stories, PUT /stories/:id та PUT /stories/:id/photos позначені deprecated; atomic /stories/draft та /stories/:id/draft — чинний UI write path. PF-UX-14 повторно згенерував OpenAPI/types і підтвердив --check.
