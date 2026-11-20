# PF-CONTENT-07 — Перевести публічне портфоліо на server DTO

**Статус:** Backlog; не реалізовано. **Область продукту:** лише портфоліо.
**Залежності:** PF-CONTENT-06A. Порядок і посилання — у [індексі](README.md).

## Мета та область роботи

frontend/lib/portfolio/server.ts; existing _portfolio; / і /stories/[slug]; metadata/sitemap.

## Інструкції агенту

Прочитати [спільні правила](README.md#правила-виконання), [архітектуру](../architecture.md) і [DTO-специфікацію](../dto-architecture.md).

1. Перед Next.js кодом прочитати локальні docs відповідної версії. Створити server-only loader із перевіркою відповіді, timeout і Next fetch no-store поверх обов’язкового backend Redis; не створювати інший кеш, що приховає інвалідацію.
2. Site+page використати одним loader для render/metadata; прибрати runtime hardcoded контент, positional selection і first-four rendering.
3. Зберегти чинні URL/legacy hash, теми, hero, motion, booking privacy та keyboard behavior. Новий slug має працювати без build.
4. Використати BFF media URLs і responsive variants, home contacts/price з DTO; показати весь масив до 10 фото без pagination, з lazy loading поза першим екраном.
5. Розрізняти notFound/unavailable/empty; FILE/DB лише серверний migration flag, не fallback при відмові API.

## Критерії приймання

- [ ] Головна та історії працюють на DTO, metadata й sitemap узгоджені з published контентом.
- [ ] Після зміни БД і publish зміни видно без rebuild; draft не видима.
- [ ] Booking/menu/viewport/theme E2E не регресували; приватні /g/* і auth збережені.

## Перевірка

Виконати цільові перевірки поведінки, зазначені вище, та lint/typecheck/build змінених частин згідно зі спільними правилами. Записати команди, результат і невиконані критерії. Залежні наступні тікети не є виконаними фактом завершення цього.

## Поза областю роботи

Новий публічний дизайн та /services сторінки. UI/UX skill застосувати лише якщо реально змінюються інтерфейси.
