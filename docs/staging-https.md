# Передрелізний запуск PhotoKondra і Photo Cloud через HTTPS

Схема для окремого Linux-хоста з Docker Engine, Compose 2.24.4 або новішим і Node.js 24+. Nginx приймає HTTPS на TCP 443. Next.js і NestJS слухають `127.0.0.1` на портах 3001 і 3000 відповідно. PostgreSQL і Redis доступні на loopback. Фаєрвол має дозволяти зовнішні підключення лише до HTTPS і керованого оператором SSH. Використовуй тестову БД, окремий приватний S3 bucket і контрольні фото.

Перед стартом зафіксуй передрелізний hostname, хто керує DNS/TLS і S3, та чи видавалися публічні посилання до перемикання. Для цієї конфігурації потрібні DNS-запис `A` на IPv4 хоста й чинний сертифікат для цього імені. Приклад нижче використовує `staging.example.com`. Публічний домен обирається під час фінального деплою.

## Підготовка та запуск

1. Створи `.env` із `.env.example` у корені репозиторію на стенді. Налаштуй доступ до БД, Redis і S3, JWT та облікові дані тестового адміністратора. Серед імен, потрібних для ingress і NestJS, заповни такі значення:

   ```dotenv
   STAGING_HOST=staging.example.com
   STAGING_TLS_DIR=/srv/photo-cloud/staging-tls
   APP_URL=https://staging.example.com
   CORS_ALLOWED_ORIGINS=https://staging.example.com
   API_URL=http://127.0.0.1:3000
   API_HOST=127.0.0.1
   PORT=3000
   ```

   Задай однаковий випадковий `BFF_TRUST_SECRET` для Nginx, NestJS і процесу Next.js. Використовуй 64 шістнадцяткові символи. Цей стенд приймає HTTPS без балансувальника, тому `TRUSTED_PROXY_CIDRS` лишай порожнім. Збережи `.env` і ключ сертифіката з доступом лише для оператора або сервісу, якому вони потрібні.

2. Помісти `fullchain.pem` і `privkey.pem` до каталогу `STAGING_TLS_DIR`. Каталог монтується лише для читання. Після оновлення файлів перевір `nginx -t` і перезавантаж конфігурацію командою `nginx -s reload` через `docker compose exec ingress` із тими самими файлами Compose.

3. З кореня репозиторію підготуй PostgreSQL, Redis і застосунки.

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.staging.yml config --quiet
   docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --wait postgres redis
   npm ci --prefix backend
   npm ci --prefix frontend
   npm --prefix backend run prisma:generate
   npm --prefix backend run prisma:deploy
   npm --prefix backend run build
   APP_URL=https://staging.example.com npm --prefix frontend run build
   ```

   Під час першого запуску створи тестового адміністратора командою `npm --prefix backend run prisma:seed`.

4. Використай менеджер процесів хоста, щоб запустити команди нижче як два окремі сервіси. У середовищі **Next.js** задай `APP_URL`, `API_URL` і `BFF_TRUST_SECRET`. NestJS читає конфігурацію з кореневого `.env`. Виконуй команди з кореня репозиторію.

   ```sh
   NODE_ENV=production npm --prefix backend run start:prod
   npm --prefix frontend run start -- --hostname 127.0.0.1 --port 3001
   ```

5. Перевір доступність NestJS через loopback, синтаксис ingress і запусти Nginx.

   ```sh
   curl --fail --silent --show-error http://127.0.0.1:3000/api/v1/health
   docker compose -f docker-compose.yml -f docker-compose.staging.yml run --rm --no-deps ingress nginx -t
   docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d ingress
   curl --fail --silent --show-error --output /dev/null https://staging.example.com/
   ```

## S3 і ручне приймання

У S3 додай точний `https://staging.example.com` до потрібного правила CORS за [інструкцією](production-cors.md). Переконайся, що правило PUT дозволяє `Content-Type` і `If-None-Match`. Збережи чинні правила для інших активних середовищ. Запусти `npm --prefix backend run storage:audit` із доступом до метаданих тестового bucket і перевір результати. Тримай усі параметри S3 Block Public Access увімкненими.

1. У чистому браузері відкрий `/`, `/login`, `/dashboard` і перевір одну публічну історію. Увійди в адмінку через HTTPS і перезавантаж `/dashboard`. У DevTools перевір, що запити `/api/*` ідуть на той самий hostname, а сесійні cookie мають `Secure` і `HttpOnly`.
2. Створи контрольний альбом і завантаж одне фото. У Network перевір відповідь S3 на preflight та успішний прямий PUT із `Content-Type` і `If-None-Match: *`. Дочекайся статусу `READY`.
3. Створи приватне посилання, відкрий його в окремій чистій сесії й перевір `/g/*`, мініатюру, повноекранне прев’ю, завантаження оригіналу та ZIP. Відклич посилання й повтори відкриття в чистій сесії.
4. Запиши дату, hostname, перевірені типи маршрутів і результати. Уникай збереження приватних URL, токенів, підписаних URL, cookie та секретів. Журнали Nginx для запитів вимкнено, оскільки приватні токени входять до шляху. Для діагностики використовуй знеособлені журнали застосунку й ідентифікатори запитів.

## Перемикання і відкат

Перед фінальним перемиканням збережи чинні DNS-записи, конфігурацію ingress, ідентифікатор розгорнутого релізу та попередні значення origin для застосунків і S3 CORS. Підготуй сертифікат для погодженого домену, додай новий origin до S3 CORS і залиш попередній, поки ним користуються. Збери Next.js із новим `APP_URL`, вистав його для обох застосунків, узгодь `CORS_ALLOWED_ORIGINS`, перевір ingress і перемкни DNS. Виконай [перевірки фінального запуску](tickets/08-launch-and-smoke-check.md).

Якщо зламався вхід, доступ за раніше виданими посиланнями, завантаження або видача фото, поверни попередні DNS-записи, ingress, реліз і параметри origin. Віднови попередні правила S3 CORS після повернення трафіку. Після поширення DNS повтори smoke-тести на попередньому hostname. Якщо попереднього публічного релізу ще немає, зупини новий ingress і поверни попередній стан DNS. Передрелізне середовище можна використати для повторного приймання.
