import type { AdminPortfolioEntityBaseDto } from '@/lib/portfolio/contracts';

export function deriveEditorStatus({
  record,
  dirty,
  conflict,
  readiness,
  checklist,
  pending = false,
}: {
  record?: AdminPortfolioEntityBaseDto;
  dirty: boolean;
  conflict: boolean;
  readiness: { checking: boolean };
  checklist: readonly unknown[];
  pending?: boolean;
}) {
  const publishedClean = record?.status === 'PUBLISHED' && !record.hasUnpublishedChanges && !dirty;
  const canPublish = Boolean(
    record &&
    !dirty &&
    !pending &&
    !conflict &&
    !publishedClean &&
    !readiness.checking &&
    !checklist.length,
  );
  let statusText = 'Чернетку збережено · є неопубліковані зміни';
  if (conflict) statusText = 'Потрібно звірити версії';
  else if (dirty) statusText = 'Є незбережені зміни';
  else if (!record) statusText = 'Ще не збережено';
  else if (publishedClean) statusText = 'Опубліковано · актуальна версія';
  else if (record.status === 'ARCHIVED') statusText = 'В архіві · недоступно на сайті';

  let publishReason = '';
  if (conflict) publishReason = 'Спочатку розв’яжіть конфлікт версій.';
  else if (pending) publishReason = 'Дочекайтеся завершення поточної дії.';
  else if (!record || dirty) publishReason = 'Спочатку збережіть зміни.';
  else if (readiness.checking) publishReason = 'Перевіряємо фото та пов’язані записи…';
  else if (checklist.length) publishReason = 'Виконайте підказки «До публікації залишилось».';
  else if (publishedClean) publishReason = 'На сайті вже актуальна версія.';
  return { statusText, publishReason, canPublish, publishedClean };
}

function fieldValue(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.replace(/^data\./, '').split('.')) {
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, key))
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Form callbacks return whole drafts; compare each error's own path rather than clearing all errors. */
export function retainUnchangedFieldErrors(
  errors: readonly string[],
  previous: unknown,
  next: unknown,
) {
  return errors.filter(
    (field) =>
      JSON.stringify(fieldValue(previous, field)) === JSON.stringify(fieldValue(next, field)),
  );
}
