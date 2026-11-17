# CORS для production

У прикладі фронтенд працює на `https://photos.example.com`. Заміни цей домен своїм — без шляху та `/` наприкінці.

1. Відкрий **AWS Console → S3 → твій bucket → Permissions → Cross-origin resource sharing (CORS) → Edit**.
2. Додай production-домен у `AllowedOrigins` наявного правила. Якщо інших правил немає, можна використати цей JSON:

   ```json
   [
     {
       "AllowedOrigins": ["https://photos.example.com"],
       "AllowedMethods": ["GET", "HEAD", "PUT"],
       "AllowedHeaders": ["content-type", "if-none-match"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 300
     }
   ]
   ```

   Якщо цей bucket також використовується локально, залиш `http://localhost:3001` другим елементом `AllowedOrigins`. Наявне `AllowedHeaders: ["*"]` теж підходить. Збережи інші потрібні правила.

3. Натисни **Save changes**. Залиш **Block all public access — On** і **Bucket owner enforced**: CORS не потребує публічного bucket.
4. У production-конфігурації бекенду встанови:

   ```dotenv
   APP_URL=https://photos.example.com
   CORS_ALLOWED_ORIGINS=https://photos.example.com
   ```

   Перезапусти або перевипусти бекенд. Якщо є інші дозволені фронтенди, додай їх у `CORS_ALLOWED_ORIGINS` через кому.

5. Відкрий сайт на production-домені: завантаж фото, відкрий preview та скачай оригінал і ZIP. У **DevTools → Network** не має бути помилок CORS; запит PUT має містити `Content-Type` та `If-None-Match: *`.

S3 CORS дозволяє браузеру звертатися до storage; CORS бекенду налаштовується окремо через `CORS_ALLOWED_ORIGINS`. Доступ до файлів і далі надається signed URL.
