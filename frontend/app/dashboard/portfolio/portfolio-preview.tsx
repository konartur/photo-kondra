'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  PortfolioHomePreviewDto,
  PortfolioServicePreviewDto,
  PortfolioStoryPreviewDto,
} from '@/lib/portfolio/contracts';
import {
  HomePageContent,
  StoryPageContent,
  ServiceCard,
} from '@/app/_portfolio/portfolio-page-content';
import { PublishedPhoto } from '@/app/_portfolio/portfolio-photo';
import PortfolioLayout from '@/app/_portfolio/portfolio-layout';
import publicStyles from '@/app/_portfolio/portfolio.module.css';
import { button } from './editor-fields';

export type PortfolioPreviewData =
  PortfolioHomePreviewDto | PortfolioServicePreviewDto | PortfolioStoryPreviewDto;

export function PortfolioPreview({
  preview,
  version,
  dirty,
  disabled,
  closeDisabled,
  onLocaleChange,
  onClose,
}: {
  preview: PortfolioPreviewData;
  version: number;
  dirty: boolean;
  disabled: boolean;
  closeDisabled: boolean;
  onLocaleChange: (locale: 'uk' | 'en') => void;
  onClose: () => void;
}) {
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState<'mobile' | 'wide'>('wide');
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const position = window.scrollY;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    container.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      window.scrollTo({ top: position, behavior: 'instant' });
    };
  }, []);
  const stale = dirty || preview.draftVersion !== version;
  const { site, page } = preview;
  return createPortal(
    <section
      ref={container}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Приватний попередній перегляд"
      className="fixed inset-0 z-50 flex flex-col bg-white text-zinc-900"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zinc-200 p-3">
        <h2 className="font-semibold">Чернетка · бачите лише ви</h2>
        <label>
          Мова{' '}
          <select
            value={site.locale}
            disabled={disabled}
            onChange={(event) => onLocaleChange(event.target.value === 'en' ? 'en' : 'uk')}
          >
            <option value="uk">Українська</option>
            <option value="en">English</option>
          </select>
        </label>
        <fieldset className="flex gap-2">
          <legend className="sr-only">Ширина перегляду</legend>
          {(['wide', 'mobile'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={button}
              aria-pressed={width === value}
              onClick={() => setWidth(value)}
            >
              {value === 'wide' ? 'Широкий екран' : 'Телефон'}
            </button>
          ))}
        </fieldset>
        <button type="button" className={button} disabled={closeDisabled} onClick={onClose}>
          Повернутися до редагування
        </button>
        <p className="w-full text-sm">Перегляд оформлення. Переходи й бронювання недоступні.</p>
      </header>
      {stale ? (
        <p role="status" className="p-6">
          Перегляд застарів. Поверніться до редагування, збережіть зміни й відкрийте перегляд знову.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto bg-zinc-100 p-2">
          <iframe
            sandbox="allow-same-origin"
            title="Сторінка чернетки"
            className="mx-auto h-full max-w-full border border-zinc-200 bg-white"
            style={{ width: width === 'mobile' ? 375 : '100%' }}
            srcDoc={
              '<!doctype html><html><head><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"></head><body><div id="preview-root"></div></body></html>'
            }
            onLoad={(event) => {
              const doc = event.currentTarget.contentDocument;
              if (!doc) return;
              document
                .querySelectorAll('link[rel="stylesheet"],style')
                .forEach((style) => doc.head.appendChild(style.cloneNode(true)));
              doc.documentElement.lang = site.locale;
              setTarget(doc.getElementById('preview-root'));
            }}
          />
          {target &&
            createPortal(
              'hero' in page ? (
                <HomePageContent site={site} page={page} prefix="" preview />
              ) : 'photos' in page ? (
                <StoryPageContent site={site} story={page} prefix="" preview />
              ) : (
                <PortfolioLayout site={site} staticPreview>
                  <main lang={site.locale} className={publicStyles.section}>
                    <ServiceCard site={site} service={page} />
                    <div className={publicStyles.storyPair}>
                      {page.stories.items.map((story) => (
                        <article key={story.id}>
                          <PublishedPhoto image={story.cover} sizes="100vw" />
                          <h2>{story.title}</h2>
                        </article>
                      ))}
                    </div>
                  </main>
                </PortfolioLayout>
              ),
              target,
            )}
        </div>
      )}
    </section>,
    document.body,
  );
}
