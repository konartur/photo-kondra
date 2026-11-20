# PF-CONTENT-05 — Атомарна публікація, архівація та preview

**Статус:** Backlog; не реалізовано. **Область продукту:** лише портфоліо.
**Залежності:** PF-CONTENT-04. Порядок і посилання — у [індексі](README.md).

## Мета та область роботи

Portfolio publication service; snapshots; contentVersion; protected preview.

## Інструкції агенту

Прочитати [спільні правила](README.md#правила-виконання), [архітектуру](../architecture.md) і [DTO-специфікацію](../dto-architecture.md).

1. Перевірити completeness, ліміт 10 unique cover+photos та активні references; зберегти snapshot, contentVersion та PortfolioCacheInvalidation в одній DB transaction.
2. Забезпечити конкурентну безпеку publish/archive/delete; блокувати архівацію залежностей, на які посилаються активні snapshots.
3. Зафіксувати immutable slug після першої публікації; підтримати idempotent publish/archive і перевірку expectedVersion.
4. Реалізувати private preview повної чернетки з admin media routes; public projection ніколи не читає draft. Підготувати DB outbox replay; Redis-поведінку завершити в PF-CONTENT-06A без відкладення кешу після MVP.

## Критерії приймання

- [ ] Нова редакція не видима до publish; невдалий publish не частково оновлює сайт.
- [ ] Draft/published відрізняються і правильно показують hasUnpublishedChanges.
- [ ] Concurrency tests доводять відсутність dangling published refs; архівація/видалення перевіряють snapshots.

## Перевірка

Виконати цільові перевірки поведінки, зазначені вище, та lint/typecheck/build змінених частин згідно зі спільними правилами. Записати команди, результат і невиконані критерії. Залежні наступні тікети не є виконаними фактом завершення цього.

## Поза областю роботи

Довга історія ревізій, scheduling і distributed event bus.
