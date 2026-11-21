# PERF-03 — Локальне Docker-середовище із загальним бюджетом 1 ГБ / 1 vCPU

**Статус:** Backlog; не реалізовано. **Пріоритет:** P1.
**Залежності:** [PERF-01](01-architecture-audit.md), [PERF-02](02-resource-metrics.md), [спільні правила](README.md#межі-та-правила-виконання).
**Наступний крок:** [PERF-04](04-k6-harness.md).

## Очікуваний результат

Ізольований Linux-стенд, де обмеження поширюються на весь цільовий стек, а не по 1 ГБ і 1 CPU на кожен контейнер.

## Межі змін

Окремий perf Compose/образи/runbook, без зміни стандартного dev/staging запуску та бізнес-логіки. Поточний Compose містить тільки PostgreSQL/Redis; NestJS і Next.js для perf запускати production builds, без watch/ts-node/dev servers.

## Кроки реалізації

1. Описати один перевірений Linux/cgroup v2 шлях. Бажано окрема VM з 1024 MiB/1 vCPU, де враховані ОС/Docker; k6 працює на іншому хості. Альтернатива — спільний parent cgroup для всіх workload services із RAM менше 1024 MiB на задокументований резерв ОС та aggregate CPU cap 1. Не вважати суму незалежних `cpus: 1` симуляцією однієї vCPU.
2. Підняти NestJS з обома workers, PostgreSQL 16, Redis 7 AOF, Next.js BFF, Nginx зі збереженою межею довіри. Налаштувати тільки локальні/test адреси, healthchecks, volumes і явну perf-env. Версії зафіксувати; тестову схему створити чинними migrations/seed з явними тестовими credentials.
3. Виставити й задокументувати aggregate/per-service memory/CPU/swap limits, restart policy, disk/log bounds. Базовий run — без swap; додатковий зі swap маркувати окремо. `--max-old-space-size` не трактувати як RSS limit. Не підлаштовувати DB/worker/security конфіг перед baseline.
4. Перевірити effective limits через inspect/cgroup файли, CPU quota і memory/swap policy. Не покладатися тільки на YAML `deploy.resources`. На Windows запускати всередині Linux VM/WSL2 із зафіксованими ресурсами та описати похибку Docker Desktop/shared kernel; не оголошувати повну VPS-еквівалентність.
5. Використати окремий приватний тестовий AWS S3, якщо доступ уже наданий. Якщо його немає, описати blocker; emulator smoke не закриває S3 acceptance. Розміщення S3 emulator поза бюджетом і його latency відзначити окремо.
6. Дати команди build outside target → start → migrations → fixtures → collect → stop → scoped cleanup. Перевірити cold startup, idle, штатний restart і збереження тестових даних; будь-який OOM/restart фіксувати, не маскувати автоматичним restart.

## Критерії приймання

- [ ] Весь production runtime stack працює під підтвердженим спільним CPU/RAM бюджетом з явним обліком ОС/Docker.
- [ ] Effective limits, swap, topology, образи та зовнішні інструменти записані; немає прихованого додаткового worker-процесу чи frontend поза обліком.
- [ ] Окремі test DB/Redis/S3/volumes, fail-closed guard і scoped cleanup не дозволяють зачепити production.
- [ ] Cold/idle telemetry з PERF-02, restart/OOM evidence та точні повторювані команди збережені.
- [ ] Збірку виключено з runtime вимірювання; on-server build/backup потреба або окремо вимірюється, або явно виключена з висновку.

## Перевірка

Compose config validation, effective cgroup inspection, startup/health/auth/S3 smoke і безпечний повторний запуск з чистим perf project. Виконати релевантні перевірки образів/збірки. Не переходити до навантаження, доки невідомі фактичні aggregate limits.
