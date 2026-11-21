# Runtime-контракти портфоліо

PF-CONTENT-01 реалізує DTO та схеми, без БД, controllers або публікації контенту. Джерело runtime-контракту — [decorated NestJS DTO](../../backend/src/portfolio/dto/index.ts); [довідковий дизайн](dto-contracts.ts) зберігається як погоджена специфікація.

## Генерація

З кореня репозиторію, після встановлення чинних backend devDependencies:

```sh
npm --prefix backend run portfolio:contracts
npm --prefix backend run portfolio:contracts:check
```

Перша команда збирає backend і запускає мінімальний schema-only Nest application без AppModule, БД, Redis, `.env` та S3. Вона створює [OpenAPI snapshot](openapi.json) і [frontend types](../../frontend/lib/portfolio/contracts.ts). Друга повторює збірку та завершується помилкою при drift. Генератор використовує вже наявні Swagger і Prettier, без нових залежностей. Підтримує тільки конструкції поточних DTO (refs, allOf, enums, objects, arrays, nullable, primitive types), на невідомих конструкціях відмовляє замість генерації неточного типу.

Не редагувати generated files вручну. Після зміни DTO виконати генерацію, переглянути diff і закомітити обидва артефакти разом із DTO. Frontend отримує лише TypeScript declarations; NestJS/Prisma не імпортуються до browser runtime. [Compile-only перевірки](../../frontend/tests/portfolio-contracts.typecheck.ts) звіряють concrete generated wrappers з погодженими generic wire interfaces під час frontend typecheck.

## Swagger і майбутні маршрути

`setupApp` реєструє всі DTO як `extraModels` у `/api/docs`. Окремий snapshot навмисно містить `paths: {}`: це бібліотека схем, а не обіцянка вже робочих endpoints. Query DTO, admin/media lists, publication і preview мають конкретні schemas. Робочі routes та їхні `ApiResponse`/auth/помилки додаються у PF-CONTENT-03–06; при підключенні controllers використовувати ці самі класи, а не копії.

`PortfolioApiErrorDto` розширює чинний `{statusCode, code, message}` лише необов'язковими деталями `errors[]`. Глобальний filter/validation response не змінювався: він поки повертає чинні три поля. Предметні коди, включно з `PORTFOLIO_UNAVAILABLE`, і повернення безпечних field errors потрібно підключати разом із відповідними операціями; наявний filter приховує специфічні 5xx codes. Schema документація цього контракту не означає, що коди вже повертаються реалізованими маршрутами.

## Межі валідації

- Admin editorial fields — об'єкти з обов'язковими `uk` та `en`, без інших ключів. Draft дозволяє порожні переклади, trim і ліміти перевіряються на вході. Повнота обох мов перевірятиметься publish/preview service.
- Nullable поля обов'язково присутні; `null` дозволений лише там, де погоджено. Unknown fields, URL, storage keys, status та server-generated values у write DTO відхиляються глобальним whitelist policy.
- Фото списку мають унікальні placement/media IDs, максимум 10. `storyPhotoLimitSatisfied` перевіряє union з cover без подвоєння; PF-CONTENT-04/05 повинні викликати її атомарно із version check, бо один DTO не знає збереженого cover. Це не готова транзакційна операція.
- Upload metadata: safe integer 1..10 000 000 bytes, JPEG/PNG/WebP; декодування/header/pixel checks залишаються медіатікету. MIME з DTO не доводить фактичний тип файла.
- Читання locale: omission → `en`, `uk/en` дозволені, інші/null відхиляються. Списки: default 24/max 50; перевірка cursor context/version — відповідальність майбутнього reader.
- Контакти: email або HTTPS profile на instagram.com/www.instagram.com чи t.me/telegram.me, без credentials, port, query або fragment. Public href генерує mapper; arbitrary URL не приймається.

Тести контракту використовують синтетичні bilingual fixtures і реальний ValidationPipe/Swagger metadata. Вони не замінюють acceptance на PostgreSQL/S3 та інтеграцію майбутнього PortfolioModule.
