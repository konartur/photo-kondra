# PERF-07 — Аналіз вимірювань та рекомендації щодо оптимізації

**Статус:** Backlog; не виконано. **Пріоритет:** P1.
**Залежності:** [PERF-01](01-architecture-audit.md), [PERF-02](02-resource-metrics.md), [PERF-03](03-constrained-docker.md), [PERF-04](04-k6-harness.md), [PERF-05](05-api-workloads.md), [PERF-06](06-peaks-and-leaks.md), [спільні правила](README.md#межі-та-правила-виконання).
**Наступний крок:** [PERF-08](08-vps-readiness-report.md).

## Очікуваний результат

Доказовий аналіз capacity, bottlenecks та варіантів дій без імплементації tuning або переписування backend.

## Кроки реалізації

1. Перевірити валідність runs: той самий commit/config/dataset, effective shared limits, генератор не saturated, фактичний RPS досягнуто, повна telemetry. Invalid/partial runs позначити й визначити потрібні повтори; не усереднювати невдалий/OOM запуск із pass так, щоб приховати проблему.
2. Побудувати компактні таблиці/графіки throughput → HTTP latency/errors/loop/queue lag і timeline aggregate RAM/CPU разом із job phases. Показати три repeats/розкид, idle/steady/peak/recovery/soak, swap policy, resource headroom. Відділити page cache/shared memory, не складати некоректно RSS PostgreSQL і cgroup usage.
3. Зіставити кожну гіпотезу PERF-01 з доказами: Sharp native RAM/CPU, auth Argon2, multipart/backpressure, metadata/Prisma queries/pool, Redis retention/AOF, Next.js/BFF, S3/network. Кореляцію не називати доведеною причиною; за потреби запропонувати один контрольований додатковий експеримент, не змінюючи acceptance baseline.
4. Визначити максимальний **виміряний** sustainable workload у межах SLO та точку деградації. Окремо описати runtime/build/maintenance і local Linux vs реальний VPS обмеження. Якщо очікуване продуктове навантаження невідоме, не екстраполювати до «працюватиме стабільно завжди».
5. Скласти ранжований список рекомендацій із доказом, очікуваним механізмом, trade-off, вартістю, ризиком, способом перевірки та rollback. Розглянути лише релевантні вимірам варіанти: pool/concurrency/cache/retention/config, streaming/native-memory контроль, дорожчий VPS або винесення сервісів. Зменшення concurrency може збільшити queue wait; зміни Argon2 не мають послаблювати безпеку. Очікувану економію без A/B позначити як невиміряну.
6. Порівняти «залишити», «оптимізувати поточний стек», «дослідити міграцію» з огляду на частку Node framework проти PostgreSQL/Redis/Sharp/S3/Next.js. Оцінити migration cost/ризик регресії/супровід. Міграцію рекомендувати досліджувати лише за доказом невідповідності бюджету після розумних альтернатив; нова технологія не має виміряної переваги без еквівалентного benchmark.

## Критерії приймання

- [ ] Кожний висновок посилається на run/метрику; unknown/invalid/blocked позначені.
- [ ] Є таблиця SLO pass/fail, ресурсний бюджет усього стеку, запас і виміряний діапазон місткості.
- [ ] Рекомендації мають пріоритет, effort/risk/trade-off та план перевірки, без вигаданих відсотків економії.
- [ ] Доцільність rewrite розглянута за атрибуцією витрат, а не idle RSS NestJS або перевагою мови.
- [ ] Реальні оптимізації/міграція винесені у пропозиції окремих тікетів і не реалізовані в цьому етапі.

## Перевірка

Звірити summary з raw artifacts та всіма failure runs. За відсутності достатніх вимірювань результат — список evidence gaps/повторів, а не позитивний висновок.
