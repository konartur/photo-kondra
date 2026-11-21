# PERF-01 — Аудит архітектури та потенційних bottlenecks

**Статус:** Backlog; виконання не розпочато. **Пріоритет:** P1.
**Залежності:** немає; прочитати [спільні правила](README.md#межі-та-правила-виконання).
**Наступний крок:** [PERF-02](02-resource-metrics.md).

## Очікуваний результат

Актуальна карта процесів і шляхів даних, гіпотези bottlenecks та числовий контракт експерименту, за яким можна прийняти або відхилити VPS 1 ГБ / 1 vCPU. [Початковий огляд](../architecture-baseline.md) є входом, а не результатом вимірювань.

## Межі змін

Тільки аудит і документація; без рефакторингу, tuning або зміни лімітів.

## Кроки реалізації

1. Зафіксувати commit/стан дерева; перевірити backend/frontend package та lock-файли, Prisma schema/client/engine, запуск production, Compose, BFF/ingress. Не плутати кореневий Prisma 7 з backend Prisma 6; фактичні версії брати з lock/runtime. Зафіксувати модулі, AuthSession та інші фактичні сутності.
2. Намалювати життєвий цикл: presigned PUT → upload-complete/перевірка storage → Redis → Sharp → READY; publish → повний prebuilt ZIP; selected ZIP → reuse/queue → status → signed GET. Позначити, де байти йдуть прямо в S3, а де через worker.
3. Звірити створення workers у тому самому NestJS-процесі, concurrency кожної черги та можливість одночасного Sharp+ZIP+auth. Проаналізувати Sharp native buffers/cache/clones, Argon2 login/refresh, multipart S3 (queueSize/partSize), ZIP store/streams/backpressure, metadata arrays, Prisma connections/запити/індекси, Redis AOF/retention, cleanup timers і rate-limit stores. Для кожної гіпотези дати посилання на код та експеримент, який її перевірить.
4. Скласти бюджет усіх процесів та ОС; бюджетні числа позначити як припущення до вимірювання. Зафіксувати 1024 MiB або суворіший еквівалент тарифу, swap policy та резерв ОС. Визначити off-host S3, k6, збірку, профайлери й обов'язковий Next.js/Nginx у full-stack оцінці.
5. Записати числовий workload contract до запусків: щонайменше одна галерея зі 100 синтетичних JPG, додаткові рівні кількості фото/галерей, діапазони bytes і megapixels, профілі compressibility, одночасні клієнти/RPS, upload batch, login/refresh rate, кількість незалежних ZIP. Окремо визначити очікуване продуктове навантаження і stress-пошук межі; відсутність погодженого навантаження обмежує фінальний висновок протестованим діапазоном.
6. До вимірювань зафіксувати SLO: p95/p99 HTTP, максимум неочікуваних errors/timeouts, час до READY фото/ZIP, допустимий queue lag, event-loop delay, резерв RAM, CPU saturation і leak trend. Визначити тривалості/repeats/stop criteria; у PERF-04–06 є мінімальні фази. Значення — цілі експерименту, не отримані результати; не послаблювати їх після невдалого запуску.

## Критерії приймання

- [ ] Карта topology і flow підтверджена файлами коду; виконане відділено від майбутніх portfolio/cache тікетів.
- [ ] Є таблиця ризик → механізм → джерело → метрика → тест; жодна гіпотеза не названа доведеним bottleneck.
- [ ] Бюджет включає NestJS/workers, БД, Redis, Next.js, Nginx, ОС/Docker; зовнішні компоненти названі.
- [ ] Workload/SLO contract містить числові значення, ресурси, фазування, критерії зупинки й джерело припущень; немає невизначених «нормально/швидко».
- [ ] Збережено невідомі параметри/блокери; немає висновку про RAM або потребу міграції без вимірювань.

## Перевірка

Звірити кожен flow з controller/service/worker/storage та кожен resource limit із фактичним конфігом. Перевірити посилання й `git diff --check`. Результат: оновлений architecture baseline і workload/SLO contract із датою та commit.
