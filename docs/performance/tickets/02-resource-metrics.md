# PERF-02 — Збір RAM, CPU та event loop без зміни бізнес-логіки

**Статус:** Backlog; не реалізовано. **Пріоритет:** P1.
**Залежності:** [PERF-01](01-architecture-audit.md), [спільні правила](README.md#межі-та-правила-виконання).
**Наступний крок:** [PERF-03](03-constrained-docker.md).

## Очікуваний результат

Відтворювані часові ряди Node.js і всієї машини, які дозволяють зіставити HTTP, Sharp, ZIP, auth та черги з піками ресурсів.

## Межі змін

Вбудовані `process`/`node:perf_hooks` і зовнішні Linux/cgroup/DB/Redis засоби. Діагностика тільки за явним perf-прапорцем, вимкнена за замовчуванням; жодних нових публічних metrics endpoints або production agents. Не вмикати debug/inspector назовні.

## Кроки реалізації

1. Додати тестовий collector/preload із bounded output: `rss`, `heapUsed`, `heapTotal`, `external`, `arrayBuffers`, uptime/PID, CPU time delta, `monitorEventLoopDelay` (p50/p95/p99/max, ns → ms), delta `eventLoopUtilization`. Інтервал 1 с для стандартних runs, 100–250 мс у виділених peak-runs; histogram reset на кожен інтервал.
2. Збирати process tree разом із Prisma engine, якщо він окремий; cgroup v2 `memory.current/peak/stat/events`, swap, `cpu.stat` usage/throttling, OOMKilled/restarts. Для ОС — MemAvailable, CPU user/system/iowait/steal, disk I/O, мережа, filesystem usage. Фіксувати точну семантику інструментів: Docker working set не тотожний RSS, `arrayBuffers` входить у `external`; їх не додавати.
3. Для PostgreSQL збирати connections/active queries/locks і повільні запити без bind values; для Redis — used_memory/peak/RSS, evictions, clients, AOF rewrite. Із BullMQ — waiting/active/delayed/failed/completed, queue wait/processing duration/stalled; використати чинні безпечні job events без зміни processing behavior.
4. Синхронізувати UTC/run ID і workload phase markers. Писати bounded JSONL/CSV локально або зовні; жодних tokens/signed URLs/query strings. Не розгортати Prometheus/Grafana всередині 1 ГБ лише для тесту.
5. Порівняти idle та короткий однаковий smoke з collector on/off; записати overhead CPU/RAM/I/O і sampling gaps. Перевірити вимкнення timer/handles при завершенні, конфігураційні bounds і недоступність діагностики у звичайному запуску.

## Критерії приймання

- [ ] Є schema метрик, одиниці, команди, sampling policy, timestamp/run ID та перевірка повноти даних.
- [ ] Записуються RSS/heap/native-related memory, CPU, event loop та ресурси кожного обов'язкового сервісу й хоста.
- [ ] Видно queue lag, job duration, Redis/БД і S3 transfer phases, а не лише HTTP latency.
- [ ] Peak/OOM/throttling доступні навіть після падіння Node; PID restart не губиться у ряді.
- [ ] Overhead виміряно, collector вимкнений за замовчуванням, у даних немає секретів; подвійний підрахунок пам'яті виключено.

## Перевірка

Короткий non-production smoke зіставити з `docker stats`, cgroup та `/proc`; пояснити різницю показників. Виконати застосовні lint/typecheck, тести collector і build. Результат: metric reference, приклад знеособленого run та команди збору; це ще не навантажувальний висновок.
