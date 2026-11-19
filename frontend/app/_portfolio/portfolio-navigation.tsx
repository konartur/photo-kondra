'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './portfolio.module.css';

const sections = [
  { href: '#home', label: 'Головна' },
  { href: '#services', label: 'Послуги' },
  { href: '#stories', label: 'Історії' },
  { href: '#contact', label: 'Контакти' },
];

export function PortfolioNavigation() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [header, setHeader] = useState({ scrolled: false, hidden: false, canGoTop: false });

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 760px)');
    const hero = document.getElementById('home');
    let directionStartY = Math.max(0, window.scrollY);
    let previousY = directionStartY;
    let direction = 0;
    let frame: number | undefined;
    const viewport = window.visualViewport;
    let viewportHeight = viewport?.height;
    let viewportSettlingUntil = 0;

    function update() {
      frame = undefined;
      const y = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY);
      const viewportSettling = mobile.matches && performance.now() < viewportSettlingUntil;
      if (viewportSettling) {
        directionStartY = y;
        previousY = y;
        direction = 0;
      }
      const scrolled = y > 90;
      const canGoTop = y > 400;
      const nextDirection = Math.sign(y - previousY);
      if (nextDirection !== 0 && nextDirection !== direction) {
        directionStartY = previousY;
        direction = nextDirection;
      }
      previousY = y;
      const distance = y - directionStartY;
      const heroEnd = hero?.offsetHeight ?? 0;
      // Leave a band around the hero edge and require deliberate movement in
      // either direction, so touch jitter cannot repeatedly reverse the animation.
      const backInsideHero = mobile.matches && y < heroEnd - 24;
      const pastHero = !mobile.matches || y > heroEnd + 24;
      setHeader((current) => {
        const hidden = viewportSettling ? current.hidden
          : backInsideHero || y < 110 || distance <= -24
            ? false
            : current.hidden || (pastHero && y > 200 && distance >= 48);
        if (current.scrolled === scrolled && current.hidden === hidden && current.canGoTop === canGoTop) {
          return current;
        }
        return { scrolled, hidden, canGoTop };
      });
    }

    function scheduleUpdate() {
      frame ??= window.requestAnimationFrame(update);
    }

    function viewportChanged() {
      if (mobile.matches && viewport?.height !== viewportHeight) {
        viewportHeight = viewport?.height;
        viewportSettlingUntil = performance.now() + 180;
      }
      scheduleUpdate();
    }

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', viewportChanged);
    viewport?.addEventListener('resize', viewportChanged);
    window.addEventListener('pageshow', scheduleUpdate);
    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', viewportChanged);
      viewport?.removeEventListener('resize', viewportChanged);
      window.removeEventListener('pageshow', scheduleUpdate);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <a className={styles.skipLink} href="#services">Перейти до послуг</a>
      <header
        className={styles.header}
        data-scrolled={header.scrolled || menuOpen}
        data-hidden={header.hidden && !menuOpen}
        data-menu-open={menuOpen}
      >
        <a className={styles.brand} href="#home">
          ІМ&apos;Я ФОТОГРАФА<span>PHOTOGRAPHY</span>
        </a>
        <a className={styles.headerBook} href="#contact">
          <span>Забронювати <span className={styles.headerBookIcon} aria-hidden="true">↗&#xFE0E;</span></span>
        </a>
        <button
          className={styles.menuToggle}
          type="button"
          aria-label="Меню"
          aria-controls="portfolio-menu"
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            dialog.current?.showModal();
            setMenuOpen(true);
          }}
        >
          МЕНЮ <span className={styles.burger} aria-hidden="true" />
        </button>
      </header>

      <dialog
        id="portfolio-menu"
        className={styles.menu}
        aria-label="Навігація"
        ref={dialog}
        onClose={() => setMenuOpen(false)}
      >
        <button
          className={styles.closeMenu}
          type="button"
          aria-label="Закрити меню"
          onClick={() => dialog.current?.close()}
        >
          <span aria-hidden="true">×</span>
        </button>
        <nav aria-label="Портфоліо">
          {sections.map(({ href, label }, index) => (
            <a key={href} href={href} onClick={() => dialog.current?.close()}>
              {label}<span aria-hidden="true">0{index + 1}</span>
            </a>
          ))}
        </nav>
        <div className={styles.menuFoot}>
          <span>СТВОРЕНО ДЛЯ СПРАВЖНІХ МОМЕНТІВ</span>
          <span>INSTAGRAM · TELEGRAM · EMAIL</span>
        </div>
      </dialog>

      <button
        className={styles.backToTop}
        type="button"
        aria-label="Повернутися нагору"
        hidden={!header.canGoTop || menuOpen}
        onClick={() => {
          document.getElementById('home')?.focus({ preventScroll: true });
          window.scrollTo({ top: 0 });
        }}
      >
        <span aria-hidden="true">↑</span> <span className={styles.backLabel}>Нагору</span>
      </button>
    </>
  );
}
