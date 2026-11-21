# PERF-06 — Пікова RAM, тривале навантаження та можливі memory leaks

**Статус:** Backlog; не виконано. **Пріоритет:** P1.
**Залежності:** [PERF-01](01-architecture-audit.md), [PERF-02](02-resource-metrics.md), [PERF-03](03-constrained-docker.md), [PERF-04](04-k6-harness.md), [PERF-05](05-api-workloads.md), [спільні правила](README.md#межі-та-правила-виконання).
**Наступний крок:** [PERF-07](07-analysis-and-options.md).

## Очікуваний результат

Підтверджені піки всього стеку й оцінка retention після повторюваного навантаження. Висновок розрізняє JS leak, native allocations/fragmentation, кеші та законне зростання БД/черг.

## Кроки реалізації

1. Провести peak-runs із PERF-02 high-frequency sampling і cgroup kernel peak: high-megapixel JPG біля file limit, 100-photo batch, many-small-file ZIP і ZIP біля фактичного size limit, одночасні Sharp+ZIP+Argon2+reads. Врахувати S3 multipart buffers і те, що compressed bytes не визначають decoded RAM. Перевірити overlap з cleanup timer, Redis AOF rewrite/PostgreSQL checkpoint; не вимикати persistence.
2. Виконати soak щонайменше 2 години з фіксованим working set і стабільним expected load, плюс мінімум 5 однакових load/drain/idle циклів. Idle після кожного циклу — щонайменше 10 хв і до спорожнення active/waiting/delayed jobs або явного timeout. Постійно записувати нові DB rows/sessions, Redis retained jobs, open sockets/FD і active resources, щоб не назвати їх JS leak.
3. Окремо тестувати зростання dataset; відділити його від fixed-working-set soak. Після warm-up порівнювати однакові точки drain/idle, heap після природного GC, RSS/external/native, slopes MiB/hour із розкидом повторів. Повторюване зростання — підозра до пояснення retaining paths; неповернення RSS одразу не доводить leak.
4. У контрольованих fault-runs лише тестового середовища відтворити malformed image, missing S3 object, slow/aborted S3 stream, upload failure і retry/timeout ZIP. Обмежити fault injection зовнішнім harness; бізнес-логіку не міняти. Перевірити закриття streams/sockets/timers/multipart, відновлення черги, відсутність накопичення lock/failed jobs поза retention та безпечне очищення run objects.
5. Heap snapshots/CPU/native profiles знімати лише для підозрілих фаз в окремому діагностичному run з достатньою RAM поза цільовим бюджетом. Snapshots можуть зупиняти процес/додатково споживати RAM і містити секрети: не включати їх overhead у baseline і не комітити. Forced GC — тільки допоміжний експеримент, без твердження, що так працює production.
6. За OOM, restart, вичерпання диска або інших stop criteria припинити генератор і зберегти зовнішні метрики/events. Зафіксувати recovery time, queue drain і цілісність даних. Не перезапускати процес між циклами для приховування trend.

## Критерії приймання

- [ ] Є aggregate peak/час/фаза, MemAvailable/headroom, cgroup peak/OOM, CPU і ресурси всіх сервісів; короткі піки не оцінюються тільки середнім `docker stats`.
- [ ] Виконані ≥2 год soak і ≥5 циклів; задані working set, idle/drain правила, sampling та finite stop conditions.
- [ ] Для зростання RAM наведено часові ряди, slope/variance і пояснення або доказово описана незнята підозра; абсолютного «leaks немає» не заявлено.
- [ ] Fault-runs мають bounded recovery і evidence cleanup/retry; failures не приховані рестартами.
- [ ] Профайлінг відокремлено від acceptance runs; секретні snapshots захищені/видалені за runbook.

## Перевірка

Відтворити найгірший peak і підозрілий trend окремим повтором. Для кожного нез’ясованого growth/failure дати мінімальний reproducer та матеріали PERF-07; невирішені ризики залишити відкритими.
