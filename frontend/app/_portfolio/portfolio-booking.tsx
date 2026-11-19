'use client';

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import styles from './portfolio.module.css';

const dialogId = 'portfolio-booking';
const requiredFields = {
  name: 'Вкажіть ваше ім’я.',
  contact: 'Вкажіть email або контакт у месенджері.',
  type: 'Оберіть тип фотосесії.',
};
type RequiredField = keyof typeof requiredFields;
type ShootType = { slug: string; title: string };
type Preview = { text: string; status: 'ready' | 'copied' | 'manual' };

const BookingContext = createContext<(trigger: HTMLButtonElement, slug?: string) => void>(() => {});

export function BookingTrigger({ className, children, slug }: {
  className: string;
  children: ReactNode;
  slug?: string;
}) {
  const openBooking = useContext(BookingContext);
  return (
    <button type="button" className={className} aria-haspopup="dialog" aria-controls={dialogId}
      onClick={(event) => openBooking(event.currentTarget, slug)}>
      {children}
    </button>
  );
}

export function PortfolioBooking({ children, shootTypes, price }: {
  children: ReactNode;
  shootTypes: ShootType[];
  price: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const typeSelect = useRef<HTMLSelectElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const messagePreview = useRef<HTMLTextAreaElement>(null);
  const [errors, setErrors] = useState<RequiredField[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const preparedText = preview?.text;

  useEffect(() => {
    if (preparedText) messagePreview.current?.scrollIntoView({ block: 'nearest' });
  }, [preparedText]);

  function openBooking(trigger: HTMLButtonElement, slug?: string) {
    if (!dialog.current || !form.current || !typeSelect.current || dialog.current.open) return;
    opener.current = trigger;
    form.current.reset();
    typeSelect.current.value = slug ?? '';
    dialog.current.scrollTop = 0;
    setErrors([]);
    setPreview(null);
    dialog.current.showModal();
  }

  function prepareMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bookingForm = event.currentTarget;
    const data = new FormData(bookingForm);
    const value = (key: string) => String(data.get(key) ?? '').trim();
    const name = value('name');
    const contact = value('contact');
    const type = shootTypes.find(({ slug }) => slug === value('type'));
    const invalid: RequiredField[] = [];
    if (!name) invalid.push('name');
    if (!contact) invalid.push('contact');
    if (!type) invalid.push('type');
    setErrors(invalid);

    if (!type || invalid.length) {
      setPreview(null);
      const first = bookingForm.elements.namedItem(invalid[0]);
      if (first instanceof HTMLElement) first.focus();
      return;
    }

    setPreview({
      status: 'ready',
      text: [
        'Вітаю! Хочу обговорити фотосесію.',
        `Ім’я: ${name}`,
        `Контакт: ${contact}`,
        `Тип зйомки: ${type.title}`,
        `Вартість: ${price}`,
        `Бажана дата: ${value('date') || 'Поки не визначено'}`,
        `Побажання: ${value('note') || '—'}`,
      ].join('\n'),
    });
  }

  async function copyMessage(text: string) {
    let status: Preview['status'] = 'copied';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      status = 'manual';
      const field = messagePreview.current;
      if (field?.value === text) {
        field.focus();
        field.setSelectionRange(0, text.length);
      }
    }
    setPreview((current) => current?.text === text ? { ...current, status } : current);
  }

  function error(field: RequiredField) {
    return errors.includes(field) ? <p id={`booking-${field}-error`} className={styles.bookingError}>{requiredFields[field]}</p> : null;
  }

  function validation(field: RequiredField) {
    const invalid = errors.includes(field);
    return { required: true, 'aria-invalid': invalid, 'aria-describedby': invalid ? `booking-${field}-error` : undefined };
  }

  return (
    <BookingContext.Provider value={openBooking}>
      {children}
      <dialog id={dialogId} ref={dialog} className={styles.booking} aria-labelledby="booking-title"
        onClose={() => opener.current?.focus({ preventScroll: true })}
        onClick={(event) => {
          const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
          if (event.target === event.currentTarget && (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom)) {
            event.currentTarget.close();
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea');
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && event.target === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && event.target === last) {
            event.preventDefault();
            first.focus();
          }
        }}>
        <div className={styles.bookingHead}>
          <span className={styles.eyebrow}>ЗАПИТ НА ФОТОСЕСІЮ</span>
          <button className={styles.bookingClose} type="button" aria-label="Закрити форму" onClick={() => dialog.current?.close()}>×</button>
        </div>
        <h2 id="booking-title">Розкажіть<br />свою історію.</h2>
        <p>Кілька деталей про вашу ідею, щоб обговорити фотосесію.</p>
        <form ref={form} noValidate onSubmit={prepareMessage} onChange={(event) => {
          setPreview(null);
          const field = event.target;
          if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement) && field.value.trim()) {
            setErrors((current) => current.filter((key) => key !== field.name));
          }
        }}>
          <div className={styles.bookingField}>
            <label htmlFor="booking-name">Ваше ім’я *</label>
            <input id="booking-name" name="name" autoComplete="name" placeholder="Як до вас звертатися?" {...validation('name')} />
            {error('name')}
          </div>
          <div className={styles.bookingField}>
            <label htmlFor="booking-contact">Email або месенджер *</label>
            <input id="booking-contact" name="contact" placeholder="Контакт для відповіді" {...validation('contact')} />
            {error('contact')}
          </div>
          <div className={styles.bookingField}>
            <label htmlFor="booking-type">Тип фотосесії *</label>
            <select ref={typeSelect} id="booking-type" name="type" defaultValue="" {...validation('type')}>
              <option value="" disabled>Оберіть напрямок</option>
              {shootTypes.map(({ slug, title }) => <option key={slug} value={slug}>{title}</option>)}
            </select>
            {error('type')}
          </div>
          <div className={styles.bookingField}>
            <label htmlFor="booking-date">Бажана дата (необов’язково)</label>
            <input id="booking-date" name="date" type="date" />
          </div>
          <div className={styles.bookingField}>
            <label htmlFor="booking-note">Ваші побажання (необов’язково)</label>
            <textarea id="booking-note" name="note" placeholder="Яку історію ви хочете зберегти?" />
          </div>
          <p id="booking-hint">Підготуємо текст для копіювання. Ви зможете самостійно надіслати його фотографу.</p>
          <button className={styles.bookingSubmit} type="submit" aria-describedby="booking-hint">
            ПІДГОТУВАТИ ЗАЯВКУ <span aria-hidden="true">↗</span>
          </button>
          {preview && (
            <div className={styles.bookingPreview}>
              <p role="status">{preview.status === 'copied' ? 'Текст скопійовано. Перешліть його фотографу.'
                : preview.status === 'manual' ? 'Текст виділено. Скопіюйте його вручну через меню пристрою або Ctrl/Cmd+C.'
                  : 'Текст заявки готовий. Скопіюйте його для самостійного надсилання.'}</p>
              <label htmlFor="booking-message">Текст вашої заявки</label>
              <textarea id="booking-message" ref={messagePreview} value={preview.text} readOnly />
              <button type="button" onClick={() => void copyMessage(preview.text)}>Скопіювати текст заявки</button>
            </div>
          )}
        </form>
        <p className={styles.bookingContacts}>Канали зв’язку після запуску · Instagram · Telegram · Email</p>
      </dialog>
    </BookingContext.Provider>
  );
}
