'use client';

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import styles from './portfolio.module.css';
import type { PortfolioContactDto } from '@/lib/portfolio/contracts';

const dialogId = 'portfolio-booking';
const requiredFields = {
  name: 'Вкажіть ваше ім’я.',
  contact: 'Вкажіть email або контакт у месенджері.',
  type: 'Оберіть тип фотосесії.',
};
type RequiredField = keyof typeof requiredFields;
type ShootType = { slug: string; title: string; price?: string };
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

export function PortfolioBooking({ children, shootTypes, price, intro, contacts, locale = 'uk' }: {
  children: ReactNode;
  shootTypes: ShootType[];
  price: string;
  intro?: string;
  contacts?: PortfolioContactDto[];
  locale?: 'uk' | 'en';
}) {
  const en = locale === 'en';
  const labels = en ? { name: 'Enter your name.', contact: 'Enter an email or messenger contact.', type: 'Select a session type.' } : requiredFields;
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const scrollPanel = useRef<HTMLDivElement>(null);
  const unlockPage = useRef<(() => void) | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const typeSelect = useRef<HTMLSelectElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const messagePreview = useRef<HTMLTextAreaElement>(null);
  const [errors, setErrors] = useState<RequiredField[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const preparedText = preview?.text;

  useEffect(() => () => unlockPage.current?.(), []);

  useEffect(() => {
    const panel = scrollPanel.current;
    const viewport = window.visualViewport;
    if (!panel || !viewport) return;
    let frame: number | undefined;

    function keepFieldVisible() {
      frame = undefined;
      if (!panel || !dialog.current?.open || viewport?.scale !== 1 || !window.matchMedia('(max-width: 760px)').matches) return;
      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !panel.contains(field) || !field.matches('input, select, textarea')) return;
      const bounds = panel.getBoundingClientRect();
      const head = panel.querySelector(`.${styles.bookingHead}`)?.getBoundingClientRect();
      const top = Math.max(bounds.top + 16, (head?.bottom ?? bounds.top) + 16);
      const bottom = bounds.bottom - 16;
      const input = field.getBoundingClientRect();
      // Scroll only the panel, so Safari's keyboard pan cannot move the page.
      // A textarea taller than the available space is aligned at its top.
      if (input.top < top || input.height > bottom - top) {
        panel.scrollTop += input.top - top;
      } else if (input.bottom > bottom) {
        panel.scrollTop += input.bottom - bottom;
      }
    }

    function schedule() {
      if (frame === undefined) frame = window.requestAnimationFrame(keepFieldVisible);
    }

    panel.addEventListener('focusin', schedule);
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule, { passive: true });
    return () => {
      panel.removeEventListener('focusin', schedule);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (preparedText) messagePreview.current?.scrollIntoView({ block: 'nearest' });
  }, [preparedText]);

  function openBooking(trigger: HTMLButtonElement, slug?: string) {
    if (!dialog.current || !form.current || !typeSelect.current || dialog.current.open) return;
    opener.current = trigger;
    form.current.reset();
    typeSelect.current.value = shootTypes.some(type => type.slug === slug) ? slug ?? '' : '';
    if (scrollPanel.current) scrollPanel.current.scrollTop = 0;
    setErrors([]);
    setPreview(null);
    if (window.matchMedia('(max-width: 760px)').matches) {
      const body = document.body;
      const root = document.documentElement;
      const x = window.scrollX;
      const y = window.scrollY;
      const previous = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        width: body.style.width,
        scrollBehavior: root.style.scrollBehavior,
      };
      root.style.scrollBehavior = 'auto';
      body.style.position = 'fixed';
      body.style.top = `${-y}px`;
      body.style.left = `${-x}px`;
      body.style.width = '100%';
      unlockPage.current = () => {
        body.style.position = previous.position;
        body.style.top = previous.top;
        body.style.left = previous.left;
        body.style.width = previous.width;
        window.scrollTo(x, y);
        root.style.scrollBehavior = previous.scrollBehavior;
        unlockPage.current = null;
      };
    }
    dialog.current.showModal();
    closeButton.current?.focus({ preventScroll: true });
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
        en ? 'Hello! I would like to discuss a photo session.' : 'Вітаю! Хочу обговорити фотосесію.',
        `${en ? 'Name' : 'Ім’я'}: ${name}`,
        `${en ? 'Contact' : 'Контакт'}: ${contact}`,
        `${en ? 'Session type' : 'Тип зйомки'}: ${type.title}`,
        `${en ? 'Price' : 'Вартість'}: ${type.price ?? price}`,
        `${en ? 'Preferred date' : 'Бажана дата'}: ${value('date') || (en ? 'Undecided' : 'Поки не визначено')}`,
        `${en ? 'Notes' : 'Побажання'}: ${value('note') || '—'}`,
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
    return errors.includes(field) ? <p id={`booking-${field}-error`} className={styles.bookingError}>{labels[field]}</p> : null;
  }

  function validation(field: RequiredField) {
    const invalid = errors.includes(field);
    return { required: true, 'aria-invalid': invalid, 'aria-describedby': invalid ? `booking-${field}-error` : undefined };
  }

  return (
    <BookingContext.Provider value={openBooking}>
      {children}
      <dialog id={dialogId} ref={dialog} className={styles.booking} aria-labelledby="booking-title"
        onClose={() => {
          unlockPage.current?.();
          opener.current?.focus({ preventScroll: true });
        }}
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
        <div ref={scrollPanel} className={styles.bookingPanel}>
          <div className={styles.bookingHead}>
            <span className={styles.eyebrow}>{en ? 'PHOTO SESSION REQUEST' : 'ЗАПИТ НА ФОТОСЕСІЮ'}</span>
            <button ref={closeButton} className={styles.bookingClose} type="button" aria-label={en ? 'Close form' : 'Закрити форму'} onClick={() => dialog.current?.close()}>×</button>
          </div>
          <h2 id="booking-title">{en ? <>Tell me<br />your story.</> : <>Розкажіть<br />свою історію.</>}</h2>
          <p>{intro ?? 'Кілька деталей про вашу ідею, щоб обговорити фотосесію.'}</p>
          <form ref={form} noValidate onSubmit={prepareMessage} onChange={(event) => {
            setPreview(null);
            const field = event.target;
            if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement) && field.value.trim()) {
              setErrors((current) => current.filter((key) => key !== field.name));
            }
          }}>
            <div className={styles.bookingField}>
              <label htmlFor="booking-name">{en ? 'Your name *' : 'Ваше ім’я *'}</label>
              <input id="booking-name" name="name" autoComplete="name" placeholder={en ? 'How should I address you?' : 'Як до вас звертатися?'} {...validation('name')} />
              {error('name')}
            </div>
            <div className={styles.bookingField}>
              <label htmlFor="booking-contact">{en ? 'Email or messenger *' : 'Email або месенджер *'}</label>
              <input id="booking-contact" name="contact" placeholder={en ? 'How can I reach you?' : 'Контакт для відповіді'} {...validation('contact')} />
              {error('contact')}
            </div>
            <div className={styles.bookingField}>
              <label htmlFor="booking-type">{en ? 'Session type *' : 'Тип фотосесії *'}</label>
              <select ref={typeSelect} id="booking-type" name="type" defaultValue="" {...validation('type')}>
                <option value="" disabled>{en ? 'Select a session' : 'Оберіть напрямок'}</option>
                {shootTypes.map(({ slug, title }) => <option key={slug} value={slug}>{title}</option>)}
              </select>
              {error('type')}
            </div>
            <div className={styles.bookingField}>
              <label htmlFor="booking-date">{en ? 'Preferred date (optional)' : 'Бажана дата (необов’язково)'}</label>
              <input id="booking-date" name="date" type="date" />
            </div>
            <div className={styles.bookingField}>
              <label htmlFor="booking-note">{en ? 'Notes (optional)' : 'Ваші побажання (необов’язково)'}</label>
              <textarea id="booking-note" name="note" placeholder={en ? 'What story would you like to capture?' : 'Яку історію ви хочете зберегти?'} />
            </div>
            <p id="booking-hint">{en ? 'Prepare a message to copy and send to the photographer yourself.' : 'Підготуємо текст для копіювання. Ви зможете самостійно надіслати його фотографу.'}</p>
            <button className={styles.bookingSubmit} type="submit" aria-describedby="booking-hint">
              {en ? 'PREPARE MESSAGE' : 'ПІДГОТУВАТИ ЗАЯВКУ'} <span aria-hidden="true">↗</span>
            </button>
            {preview && (
              <div className={styles.bookingPreview}>
                <p role="status">{preview.status === 'copied' ? (en ? 'Message copied. Send it to the photographer.' : 'Текст скопійовано. Перешліть його фотографу.')
                  : preview.status === 'manual' ? (en ? 'Message selected. Copy it from your device menu or with Ctrl/Cmd+C.' : 'Текст виділено. Скопіюйте його вручну через меню пристрою або Ctrl/Cmd+C.')
                    : (en ? 'Your message is ready to copy and send.' : 'Текст заявки готовий. Скопіюйте його для самостійного надсилання.')}</p>
                <label htmlFor="booking-message">{en ? 'Your message' : 'Текст вашої заявки'}</label>
                <textarea id="booking-message" ref={messagePreview} value={preview.text} readOnly />
                <button type="button" onClick={() => void copyMessage(preview.text)}>{en ? 'Copy message' : 'Скопіювати текст заявки'}</button>
              </div>
            )}
          </form>
          <p className={styles.bookingContacts}>{contacts
            ? contacts.map(contact => <a key={contact.type} href={contact.href}>{contact.label} ↗ </a>)
            : 'Канали зв’язку після запуску · Instagram · Telegram · Email'}</p>
        </div>
      </dialog>
    </BookingContext.Provider>
  );
}
