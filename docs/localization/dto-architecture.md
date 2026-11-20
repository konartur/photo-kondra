# Підготовка DTO до локалізації

**Стан:** контракт до реалізації. [Галереї](dto-contracts.ts); [портфоліо](../portfolio-content/dto-contracts.ts). Чинні runtime DTO/API не змінені цим документом.

## Контент і читання

Locale — закритий enum `uk | en`. Для locale-aware public reads передавати явний `?locale=uk|en`; API-шляхи не префіксувати. Відсутність параметра в старого клієнта означає `en`, непідтримуване значення — 400. Frontend завжди передає мову URL. Media/download/upload routes не потребують locale; імена файлів незмінні.

Admin write DTO використовують `{uk, en}` на перекладних полях. Public DTO містять тільки вибраний текст як string, плюс locale у page/site envelope. Не надсилати весь admin draft публічно. Ціни, ID, slug, refs, порядок, focal points та contacts address спільні для мов. Alt, label, title, subtitle, description, caption, SEO й booking intro перекладні; brand залишається власною назвою. Settings не має єдиної мови контенту: підтримуються обидві.

Одна публікація портфоліо атомарно фіксує обидві мови з одним contentVersion. Draft дозволяє порожні переклади, але обидва ключі присутні. Publish/preview вимагають повноту обох мов для обов'язкових текстів. Alt може бути порожнім в обох мовах лише для явно декоративного розміщення; інакше обидва описи обов'язкові. Не копіювати український текст в англійський snapshot і не публікувати мовчазний fallback. Legacy fallback погоджений саме для наявних клієнтських галерей.

Locale входить у Redis keys, query keys, cursor context і server loader memoization. Cursor з іншої мови відхилити як stale/invalid; не змішувати сторінки. Публікація інвалідує обидві мови; DB version fence зберігається. Sitemap повертає обидві мовні адреси та hreflang; canonicalPath server-derived і містить locale prefix. Авторизований preview отримує locale query, залишається no-store.

## Галереї

L10N-04 замінює create title/description на `translations`; PATCH допускає лише повне заміщення пари або відсутність translations. Обидві назви trim 1..120; description = null або два непорожні рядки 1..1000. Очищення опису — явний null. Зберегти всі інші операції gallery/status та чинні owner checks. DTO не дозволяють ownerId, translationReviewRequired чи raw storage keys.

Наявний title копіюється в uk/en без втрати тексту; відсутній/порожній description переходить у null, непорожній копіюється в обидві мови. Server-derived translationReviewRequired=true для таких записів; false після явного збереження повних перекладів. Нові записи одразу false. У фінальній схемі не мати двох незалежно змінюваних джерел title. Конкретну additive Prisma-схему та перехід обрати в L10N-04; ніяких production migrations у цьому плані.

Поточний фронтенд і тестові fixtures надсилають title/description. Не активувати обов'язковий новий input окремо від форми: спочатку additive DB/backfill та нові read-поля; фінальний write contract увімкнути разом з L10N-05. Тимчасовий legacy input, якщо потрібний для переходу, повинен мати явну дату/етап видалення та не залишитися способом створення нових одномовних галерей. Перевірити вміст ZIP/імена завантажень, щоб обрання мови не змінювало originals або archive identity.

## Validation, Swagger та помилки

Реалізація створює concrete decorated класи з ValidateNested/Type для кожної uk/en пари. Вимагати обидва ключі, відхиляти невідомі мови, null замість об'єкта, масиви та неправильні типи; зберегти whitelist/forbidNonWhitelisted. Optional PATCH поле дозволяє omission, але не null. Ліміти кожного поля портфоліо беруться з його DTO-специфікації, а не з ліміту gallery description.

Зберегти `{statusCode, code, message}`. ApiError у frontend має зберігати code; API/BFF повертають стабільні предметні коди. Validation errors за потреби отримують backward-compatible errors[] з field/code/дозволеними params для локалізації полів. Не показувати raw backend message користувачу й не зіставляти англійські речення з перекладами; невідомий code показує локалізовану загальну помилку. Логи та Swagger можуть лишатися англійською; backend не потребує словників UI.

У Swagger документувати enum/default locale, nested uk/en schemas, null/omission, приклади обох мов, validation та коди помилок. Генеровані frontend типи мають відтворювати ці схеми без NestJS/Prisma runtime imports.
