'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AdminPortfolioMediaDto } from '@/lib/portfolio/contracts';
import { AdminImage, button, primary } from './editor-fields';
import styles from './portfolio-photo-picker.module.css';

type MediaSource = {
  items: readonly AdminPortfolioMediaDto[];
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onLoadMore?: () => void;
};

type Selection = {
  mode: 'single';
  value: string | null;
  onConfirm: (mediaId: string) => void;
} | {
  mode: 'multiple';
  value: readonly string[];
  /** Maximum total selection in this dialog, excluding `used` photos. */
  limit: number;
  onConfirm: (mediaIds: string[]) => void;
};

export type PortfolioPhotoPickerProps = MediaSource & Selection & {
  label: string;
  used?: readonly string[];
  disabled?: boolean;
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
  const selected = values.map(id => props.items.find(item => item.id === id));

  return <div className="space-y-3">
    {values.length > 0 && <div className="flex flex-wrap gap-3" aria-label="Поточний вибір">
      {selected.slice(0, 3).map((item, index) => <div key={values[index]} className="w-28 min-w-0 space-y-1">
        {item?.previewUrl ? <AdminImage url={item.previewUrl} alt={item.filename} />
          : <div className={styles.placeholder}>Фото недоступне</div>}
        <p className="break-words text-sm text-zinc-700">{item?.filename ?? 'Поточне фото'}</p>
      </div>)}
      {values.length > 3 && <p className="text-sm text-zinc-700">Ще {values.length - 3} фото</p>}
    </div>}
    <button
      id={props.id}
      type="button"
      className={button}
      disabled={props.disabled}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? dialogId : undefined}
      aria-invalid={props['aria-invalid']}
      aria-describedby={props['aria-describedby']}
      data-portfolio-field={props['data-portfolio-field']}
      onClick={() => setOpen(true)}
    >{values.length ? 'Замінити' : 'Обрати фото'} · {props.label}</button>
    {open && createPortal(<PhotoPickerDialog
      {...props}
      dialogId={dialogId}
      initialSelection={values}
      onDismiss={() => setOpen(false)}
    />, document.body)}
  </div>;
}

function PhotoPickerDialog(props: PortfolioPhotoPickerProps & {
  dialogId: string;
  initialSelection: readonly string[];
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = props.dialogId + '-title';
  const helpId = props.dialogId + '-help';
  const used = props.used ?? [];
  const limit = props.mode === 'single' ? 1 : Number.isFinite(props.limit) ? Math.max(0, Math.floor(props.limit)) : 0;
  const [selection, setSelection] = useState(() => [...new Set(props.initialSelection)].filter(id => !used.includes(id)));
  const items = [...new Map(props.items.map(item => [item.id, item])).values()];
  const validSelection = selection.filter(id => items.some(item => item.id === id && item.status === 'READY') && !used.includes(id));
  const invalidSelection = validSelection.length !== selection.length;
  const overLimit = selection.length > limit;
  const canConfirm = !props.disabled && !props.isLoading && selection.length > 0 && !invalidSelection && !overLimit;

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
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function toggle(item: AdminPortfolioMediaDto) {
    if (props.disabled) return;
    setSelection(current => {
      if (current.includes(item.id)) return current.filter(id => id !== item.id);
      if (item.status !== 'READY' || used.includes(item.id) || limit === 0) return current;
      if (props.mode === 'single') return [item.id];
      return current.length < limit ? [...current, item.id] : current;
    });
  }

  function confirm() {
    if (!canConfirm) return;
    if (props.mode === 'single') props.onConfirm(selection[0]);
    else props.onConfirm([...selection]);
    props.onDismiss();
  }

  return <dialog
    ref={dialog}
    id={props.dialogId}
    className={styles.dialog}
    aria-labelledby={titleId}
    aria-describedby={helpId}
    onCancel={event => { event.preventDefault(); props.onDismiss(); }}
    onClose={event => { if (!event.currentTarget.open) props.onDismiss(); }}
  >
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="break-words text-xl font-semibold">{props.label}</h2>
          <p id={helpId} className="text-sm text-zinc-700">
            {props.mode === 'single' ? 'Оберіть одне фото та підтвердьте вибір.' : `Оберіть до ${limit} фото та підтвердьте вибір.`}
          </p>
        </div>
        <button ref={cancelButton} type="button" className={button} onClick={props.onDismiss}>Скасувати</button>
      </header>
      <div className={styles.content} aria-busy={props.isLoading || props.isLoadingMore || undefined}>
        {props.isLoading && <p role="status">Завантажуємо фотографії…</p>}
        {props.isError && <div className="space-y-2">
          <p role="alert" className="text-red-700">Не вдалося завантажити фотографії. Ваш вибір збережено в діалозі.</p>
          {props.onRetry && <button type="button" className={button} disabled={props.isLoading || props.isLoadingMore} onClick={props.onRetry}>Повторити</button>}
        </div>}
        {!props.isLoading && !props.isError && !items.length && <p>Тут ще немає фото. Додайте їх у фотобібліотеку.</p>}
        {items.length > 0 && <ul className={styles.grid} aria-label="Фотографії для вибору">
          {items.map(item => {
            const checked = selection.includes(item.id);
            const alreadyUsed = used.includes(item.id);
            const unavailable = item.status !== 'READY' || alreadyUsed;
            const full = props.mode === 'multiple' && selection.length >= limit;
            const blocked = props.disabled || !checked && (unavailable || full || limit === 0);
            const status = alreadyUsed ? 'Уже додано' : checked ? (unavailable ? statuses[item.status] : 'Вибрано')
              : unavailable ? statuses[item.status] : full || limit === 0 ? 'Досягнуто ліміту' : 'Готове';
            return <li key={item.id} className="min-w-0">
              <button
                type="button"
                className={styles.tile}
                aria-pressed={checked}
                aria-disabled={blocked || undefined}
                aria-label={item.filename + ' · ' + status}
                onClick={() => { if (!blocked) toggle(item); }}
              >
                <span className={styles.image} aria-hidden="true">
                  {item.previewUrl ? <AdminImage url={item.previewUrl} alt="" /> : <span className={styles.placeholder}>Немає мініатюри</span>}
                </span>
                <span className="block break-words text-sm text-zinc-700">{item.filename}</span>
                <span className="block text-sm font-medium">{checked && <span aria-hidden="true">✓ </span>}{status}</span>
              </button>
            </li>;
          })}
        </ul>}
        {props.hasMore && props.onLoadMore && <button type="button" className={button}
          disabled={props.isLoading || props.isLoadingMore} onClick={props.onLoadMore}>
          {props.isLoadingMore ? 'Завантажуємо…' : 'Показати ще фото'}
        </button>}
      </div>
      <footer className={styles.footer}>
        <div className="min-w-0 space-y-1">
          <p role="status" aria-atomic="true" className="text-sm text-zinc-700">Обрано фото: {selection.length} з {limit}</p>
          {invalidSelection && <p role="alert" className="text-sm text-red-700">Деякі фото недоступні. Дозавантажте список або змініть вибір.</p>}
          {overLimit && <p role="alert" className="text-sm text-red-700">Зменште вибір до {limit} фото.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {selection.length > 0 && <button type="button" className={button} disabled={props.disabled} onClick={() => setSelection([])}>Скинути вибір</button>}
          <button type="button" className={primary} disabled={!canConfirm} onClick={confirm}>
            {props.mode === 'single' ? 'Обрати фото' : `Додати ${selection.length} фото`}
          </button>
        </div>
      </footer>
    </div>
  </dialog>;
}
