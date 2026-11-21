# PERF-08 — Фінальний звіт про придатність VPS 1 ГБ / 1 vCPU

**Статус:** Backlog; не виконано. **Пріоритет:** P1.
**Залежності:** [PERF-01](01-architecture-audit.md), [PERF-02](02-resource-metrics.md), [PERF-03](03-constrained-docker.md), [PERF-04](04-k6-harness.md), [PERF-05](05-api-workloads.md), [PERF-06](06-peaks-and-leaks.md), [PERF-07](07-analysis-and-options.md), [спільні правила](README.md#межі-та-правила-виконання).

## Очікуваний результат

Самодостатній звіт, за яким власник може обґрунтовано обрати: залишити backend, погодити конкретні оптимізації або замовити дослідження міграції. Звіт не дозволяє деплой і не замінює HTTPS/security/backup приймання.

## Кроки реалізації

1. Підготувати `docs/performance/vps-readiness-report.md`: дата/commit, topology і версії, 1024 MiB/1 vCPU effective limits, ОС/Docker reserve, swap, розміщення Next.js/S3/інструментів, workload/SLO contract, команди відтворення та manifest артефактів.
2. Подати факти: idle/steady/peak RAM кожного сервісу й загальна, heap/native indicators, CPU/throttling/event-loop, latency/errors/throughput, Sharp/ZIP end-to-end, queue recovery, soak trend, OOM/restarts, disk/network. Для кожної цифри — run ID/метод; для відсутньої — «не виміряно».
3. Дати readiness verdict: **придатний у протестованих межах**, **непридатний для заданого навантаження** або **недостатньо даних**. Pass потребує виконання всіх SLO контракту під full-stack budget, резерву RAM, відсутності OOM/unexpected restarts та нез'ясованого стійкого growth і завершення jobs/recovery. Backend-only/emulator/короткий smoke не достатні для full-stack pass.
4. Окремо дати action recommendation: **залишити**, **оптимізувати**, **дослідити міграцію**, із посиланнями на PERF-07, компромісами та конкретними наступними тікетами. Якщо pass можливий лише після невиконаного tuning, поточний backend не називати ready. Перевагу іншої технології позначити неперевіреною до окремого еквівалентного benchmark.
5. Вказати operational envelope: кількість одночасних клієнтів/uploads/jobs, bytes/megapixels і розмір галереї/ZIP, очікуваний queue lag, alarms/stop thresholds, запас, вимоги до off-host build/backup та обмеження локальної симуляції VPS. Загальну production readiness не виводити лише з performance pass.
6. Зв'язати висновок з етапом 2 [hosting/deployment plan](../../hosting-and-deployment-plan.md); після виконання оцінки додати запис про отриманий звіт, середовище, commit, перевірки/блокери й наступну дію. Не позначати інші hosting stages виконаними й не запускати їх без доручення. Передати звіт власнику для вибору подальшої роботи.

## Критерії приймання

- [ ] Є явні readiness verdict і action recommendation з доказами та межами застосування.
- [ ] Загальна RAM/CPU всіх необхідних сервісів і ОС врахована; local-vs-VPS, AWS/emulator, swap та build assumptions явні.
- [ ] PERF-01–07 мають перевірювані результати; пропуски відображені у verdict, результати вимірювань не вигадані.
- [ ] Звіт можна відтворити за командами/версіями/fixtures; немає production-даних або секретів.
- [ ] Подальші оптимізації чи migration benchmark лише запропоновані; бізнес-логіку й технологію не змінено, деплой не виконано.

## Перевірка

Зіставити кожну підсумкову цифру й verdict із PERF-01 SLO, PERF-05/06 run artifacts і PERF-07 аналізом. Перевірити посилання та `git diff --check`. Тікет закривається доказовим звітом, навіть якщо чесний результат — «непридатний»; відсутність вимірювань має дати «недостатньо даних», а не pass.
