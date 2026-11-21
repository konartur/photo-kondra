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

`setupApp` реєструє всі DTO як `extraModels` у `/api/docs`. Із PF-CONTENT-03/04/05 snapshot включає реалізовані media, admin draft, publication/archive та preview paths з auth/response/error schemas; раніше paths були порожніми. Наявність маршруту в артефакті не означає пройдене DB/S3 приймання. Query DTO, admin/media lists, publication і preview мають конкретні schemas. Public routes додаються у PF-CONTENT-06 з використанням тих самих класів.

`PortfolioApiErrorDto` розширює чинний `{statusCode, code, message}` лише необов'язковими деталями `errors[]`. Глобальний filter/validation response не змінювався: він поки повертає чинні три поля. Предметні коди, включно з `PORTFOLIO_UNAVAILABLE`, і повернення безпечних field errors потрібно підключати разом із відповідними операціями; наявний filter приховує специфічні 5xx codes. Schema документація цього контракту не означає, що коди вже повертаються реалізованими маршрутами.

## Межі валідації

- Admin editorial fields — об'єкти з обов'язковими `uk` та `en`, без інших ключів. Draft дозволяє порожні переклади, trim і ліміти перевіряються на вході. Повнота обох мов перевірятиметься publish/preview service.
- Nullable поля обов'язково присутні; `null` дозволений лише там, де погоджено. Unknown fields, URL, storage keys, status та server-generated values у write DTO відхиляються глобальним whitelist policy.
- Фото списку мають унікальні placement/media IDs, 1..10 при повній заміні. `storyPhotoLimitSatisfied` перевіряє union з cover без подвоєння; PF-CONTENT-04/05 викликають її атомарно із version check, бо один DTO не знає збереженого cover.
- Upload metadata: safe integer 1..10 000 000 bytes, JPEG/PNG/WebP; PF-CONTENT-03 додає незалежні streaming byte/header/decode/pixel checks. MIME з DTO не доводить фактичний тип файла.
- Читання locale: omission → `en`, `uk/en` дозволені, інші/null відхиляються. Списки: default 24/max 50; перевірка cursor context/version — відповідальність майбутнього reader.
- Контакти: email або HTTPS profile на instagram.com/www.instagram.com чи t.me/telegram.me, без credentials, port, query або fragment. Public href генерує mapper; arbitrary URL не приймається.

Тести контракту використовують синтетичні bilingual fixtures і реальний ValidationPipe/Swagger metadata. Вони не замінюють runtime-приймання PortfolioModule на PostgreSQL/Redis/S3.
