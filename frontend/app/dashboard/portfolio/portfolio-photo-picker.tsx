'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AdminPortfolioMediaDto } from '@/lib/portfolio/contracts';
import { AdminImage, button, input, primary } from './editor-ui';
import styles from './portfolio-photo-picker.module.css';

export type MediaSource = {
  items: readonly AdminPortfolioMediaDto[];
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onLoadMore?: () => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  isSearching?: boolean;
  upload?: ReactNode;
  isUploading?: boolean;
  onRetryMedia?: (media: AdminPortfolioMediaDto) => void;
  retryingMediaId?: string;
  onOpenChange?: (open: boolean) => void;
  onSelectionChange?: (ids: string[]) => void;
  allowedIds?: readonly string[];
};

type Selection =
  | {
      mode: 'single';
      value: string | null;
      onConfirm: (mediaId: string) => void;
    }
  | {
      mode: 'multiple';
      value: readonly string[];
      /** Maximum total selection in this dialog, excluding `used` photos. */
      limit: number;
      onConfirm: (mediaIds: string[]) => void;
    };

export type PortfolioPhotoPickerProps = MediaSource &
  Selection & {
    label: string;
    used?: readonly string[];
    disabled?: boolean;
    showCurrentPreview?: boolean;
    /** Existing assets that can be added without consuming a new unique-photo slot. */
    uncountedIds?: readonly string[];
    id?: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
    'data-portfolio-field'?: string;
  };

const statuses: Record<AdminPortfolioMediaDto['status'], string> = {
  UPLOADING: 'Очікує завантаження',
  PROCESSING: 'Обробляється — ще не можна обрати',
  READY: 'Готове',
  FAILED: 'Помилка обробки — не можна обрати',
  DELETED: 'Видалене — не можна обрати',
};

/** The caller owns fetching and committed values; closing only discards dialog edits. */
export function PortfolioPhotoPicker(props: PortfolioPhotoPickerProps) {
  const [open, setOpen] = useState(false);
  const generatedId = useId();
  const dialogId = generatedId + '-dialog';
  const values = props.mode === 'single' ? (props.value ? [props.value] : []) : props.value;
  const selected = values.map((id) => props.items.find((item) => item.id === id));

  return (
    <div className="space-y-3">
      {props.showCurrentPreview !== false && values.length > 0 && (
        <div className="flex flex-wrap gap-3" aria-label="Поточний вибір">
          {selected.slice(0, 3).map((item, index) => (
            <div key={values[index]} className="w-28 min-w-0 space-y-1">
              {item?.previewUrl ? (
                <AdminImage url={item.previewUrl} alt={item.filename} />
              ) : (
                <div className={styles.placeholder}>Фото недоступне</div>
              )}
              <p className="break-words text-sm text-zinc-700">
                {item?.filename ?? 'Поточне фото'}
              </p>
            </div>
          ))}
          {values.length > 3 && (
            <p className="text-sm text-zinc-700">Ще {values.length - 3} фото</p>
          )}
        </div>
      )}
      <button
        id={props.id}
        type="button"
        disabled={props.disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        data-invalid={props['aria-invalid']}
        className={button + (props['aria-invalid'] ? ' outline-2 outline-red-700' : '')}
        aria-describedby={props['aria-describedby']}
        data-portfolio-field={props['data-portfolio-field']}
        onClick={() => {
          setOpen(true);
          props.onOpenChange?.(true);
        }}
      >
        {values.length ? 'Замінити' : 'Обрати фото'} · {props.label}
      </button>
      {open &&
        createPortal(
          <PhotoPickerDialog
            {...props}
            dialogId={dialogId}
            initialSelection={values}
            onDismiss={() => {
              if (props.isUploading) return;
              setOpen(false);
              props.onOpenChange?.(false);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

function PhotoPickerDialog(
  props: PortfolioPhotoPickerProps & {
    dialogId: string;
    initialSelection: readonly string[];
    onDismiss: () => void;
  },
) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = props.dialogId + '-title';
  const helpId = props.dialogId + '-help';
  const used = props.used ?? [];
  const limit =
    props.mode === 'single'
      ? 1
      : Number.isFinite(props.limit)
        ? Math.max(0, Math.floor(props.limit))
        : 0;
  const [selection, setSelection] = useState(() =>
    [...new Set(props.initialSelection)].filter((id) => !used.includes(id)),
  );
  const items = [...new Map(props.items.map((item) => [item.id, item])).values()];
  const validSelection = selection.filter(
    (id) =>
      items.some((item) => item.id === id && item.status === 'READY') &&
      !used.includes(id) &&
      (!props.allowedIds || props.allowedIds.includes(id)),
  );
  const invalidSelection = validSelection.length !== selection.length;
  const uncounted = props.mode === 'multiple' ? (props.uncountedIds ?? []) : [];
  const countedSelection = selection.filter((id) => !uncounted.includes(id)).length;
  const overLimit = countedSelection > limit;
  const canConfirm =
    !props.disabled &&
    !props.isLoading &&
    !props.isUploading &&
    selection.length > 0 &&
    !invalidSelection &&
    !overLimit;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement;
    const page = document.documentElement;
    const previousOverflow = page.style.overflow;
    element.showModal();
    cancelButton.current?.focus({ preventScroll: true });
    page.style.overflow = 'hidden';
    return () => {
      element.close();
      page.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);

  function toggle(item: AdminPortfolioMediaDto) {
    if (props.disabled) return;
    let next: string[];
    if (selection.includes(item.id)) next = selection.filter((id) => id !== item.id);
    else {
      if (
        item.status !== 'READY' ||
        used.includes(item.id) ||
        (limit === 0 && !uncounted.includes(item.id)) ||
        (props.allowedIds && !props.allowedIds.includes(item.id))
      )
        return;
      if (props.mode === 'single') next = [item.id];
      else if (countedSelection < limit || uncounted.includes(item.id))
        next = [...selection, item.id];
      else return;
    }
    setSelection(next);
    props.onSelectionChange?.(next);
  }

  function confirm() {
    if (!canConfirm) return;
    if (props.mode === 'single') props.onConfirm(selection[0]);
    else props.onConfirm([...selection]);
    props.onDismiss();
  }

  return (
    <dialog
      ref={dialog}
      id={props.dialogId}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={helpId}
      onCancel={(event) => {
        event.preventDefault();
        props.onDismiss();
      }}
      onClose={(event) => {
        if (!event.currentTarget.open) props.onDismiss();
      }}
    >
      <div className={styles.layout}>
        <header className={styles.header}>
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="break-words text-xl font-semibold">
              {props.label}
            </h2>
            <p id={helpId} className="text-sm text-zinc-700">
              {props.mode === 'single'
                ? 'Оберіть одне фото та підтвердьте вибір.'
                : uncounted.length
                  ? `Можна додати ${limit} нових фото. Наявна обкладинка не займає додаткове місце.`
                  : `Оберіть до ${limit} фото та підтвердьте вибір.`}
            </p>
          </div>
          <button
            ref={cancelButton}
            type="button"
            className={button}
            disabled={props.isUploading}
            onClick={props.onDismiss}
          >
            Скасувати
          </button>
        </header>
        <div
          className={styles.content}
          aria-busy={props.isLoading || props.isLoadingMore || undefined}
        >
          {props.upload}
          {props.isUploading && (
            <p role="status">Дочекайтеся завершення завантаження перед закриттям.</p>
          )}
          {props.onSearchChange && (
            <label className="block space-y-1 text-sm font-medium">
              Пошук фото за назвою
              <input
                className={input}
                type="search"
                value={props.search ?? ''}
                maxLength={120}
                onChange={(event) => props.onSearchChange?.(event.target.value)}
              />
            </label>
          )}
          {props.isSearching && <p role="status">Шукаємо фотографії…</p>}
          {props.search && (
            <p className="text-sm text-zinc-700">
              Вибрані та щойно завантажені фото залишаються видимими під час пошуку.
            </p>
          )}
          {props.isLoading && <p role="status">Завантажуємо фотографії…</p>}
          {props.isError && (
            <div className="space-y-2">
              <p role="alert" className="text-red-700">
                Не вдалося завантажити фотографії. Ваш вибір збережено в діалозі.
              </p>
              {props.onRetry && (
                <button
                  type="button"
                  className={button}
                  disabled={props.isLoading || props.isLoadingMore}
                  onClick={props.onRetry}
                >
                  Повторити
                </button>
              )}
            </div>
          )}
          {!props.isLoading && !props.isError && !items.length && (
            <p>
              {props.search
                ? 'За цією назвою фото не знайдено.'
                : 'Тут ще немає фото. Завантажте перше зображення.'}
            </p>
          )}
          {items.length > 0 && (
            <ul className={styles.grid} aria-label="Фотографії для вибору">
              {items.map((item) => {
                const checked = selection.includes(item.id);
                const alreadyUsed = used.includes(item.id);
                const outsideAllowed =
                  props.allowedIds !== undefined && !props.allowedIds.includes(item.id);
                const unavailable = item.status !== 'READY' || alreadyUsed || outsideAllowed;
                const full =
                  props.mode === 'multiple' &&
                  countedSelection >= limit &&
                  !uncounted.includes(item.id);
                const blocked =
                  props.disabled ||
                  (!checked &&
                    (unavailable || full || (limit === 0 && !uncounted.includes(item.id))));
                const status = alreadyUsed
                  ? 'Уже додано'
                  : outsideAllowed
                    ? 'Недоступне через ліміт історії'
                    : checked
                      ? unavailable
                        ? statuses[item.status]
                        : 'Вибрано'
                      : unavailable
                        ? statuses[item.status]
                        : full
                          ? 'Досягнуто ліміту'
                          : 'Готове';
                return (
                  <li key={item.id} className="min-w-0">
                    <button
                      type="button"
                      className={styles.tile}
                      aria-pressed={checked}
                      aria-disabled={blocked || undefined}
                      aria-label={item.filename + ' · ' + status}
                      onClick={() => {
                        if (!blocked) toggle(item);
                      }}
                    >
                      <span className={styles.image} aria-hidden="true">
                        {item.previewUrl ? (
                          <AdminImage url={item.previewUrl} alt="" />
                        ) : (
                          <span className={styles.placeholder}>Немає мініатюри</span>
                        )}
                      </span>
                      <span className="block break-words text-sm text-zinc-700">
                        {item.filename}
                      </span>
                      <span className="block text-sm font-medium">
                        {checked && <span aria-hidden="true">✓ </span>}
                        {status}
                      </span>
                    </button>
                    {item.status === 'FAILED' && props.onRetryMedia && (
                      <button
                        type="button"
                        className={button}
                        disabled={props.disabled || props.retryingMediaId !== undefined}
                        onClick={() => props.onRetryMedia?.(item)}
                      >
                        Повторити обробку
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {props.hasMore && props.onLoadMore && (
            <button
              type="button"
              className={button}
              disabled={props.isLoading || props.isLoadingMore || props.isSearching}
              onClick={props.onLoadMore}
            >
              {props.isLoadingMore ? 'Завантажуємо…' : 'Показати ще фото'}
            </button>
          )}
        </div>
        <footer className={styles.footer}>
          <div className="min-w-0 space-y-1">
            <p role="status" aria-atomic="true" className="text-sm text-zinc-700">
              {uncounted.length
                ? `Обрано фото: ${selection.length}. Нових місць: ${countedSelection} з ${limit}.`
                : `Обрано фото: ${selection.length} з ${limit}`}
            </p>
            {invalidSelection && (
              <p role="alert" className="text-sm text-red-700">
                Деякі фото недоступні. Дозавантажте список або змініть вибір.
              </p>
            )}
            {overLimit && (
              <p role="alert" className="text-sm text-red-700">
                {uncounted.length
                  ? `Залиште не більше ${limit} нових фото.`
                  : `Зменште вибір до ${limit} фото.`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {selection.length > 0 && (
              <button
                type="button"
                className={button}
                disabled={props.disabled}
                onClick={() => {
                  setSelection([]);
                  props.onSelectionChange?.([]);
                }}
              >
                Скинути вибір
              </button>
            )}
            <button type="button" className={primary} disabled={!canConfirm} onClick={confirm}>
              {props.mode === 'single' ? 'Обрати фото' : `Додати ${selection.length} фото`}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
