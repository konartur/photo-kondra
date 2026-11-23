'use client';

import { useEffect, useRef } from 'react';
import { portfolioBookingLabel } from '@/lib/portfolio/booking-label';
import type {
  PortfolioHomePreviewDto, PortfolioServicePreviewDto, PortfolioStoryPreviewDto,
} from '@/lib/portfolio/contracts';
import { AdminImage, button, panel } from './editor-fields';

export type PortfolioPreviewData = PortfolioHomePreviewDto | PortfolioServicePreviewDto | PortfolioStoryPreviewDto;

export function PortfolioPreview({ preview, version, dirty, disabled, onLocaleChange, onClose }: {
  preview: PortfolioPreviewData;
  version: number;
  dirty: boolean;
  disabled: boolean;
  onLocaleChange: (locale: 'uk' | 'en') => void;
  onClose: () => void;
}) {
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    container.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    container.current?.focus({ preventScroll: true });
  }, [preview]);
  const page = preview.page;
  return <section ref={container} tabIndex={-1} data-editor-preview className={panel} aria-label="Приватний попередній перегляд">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Чернетка · бачите лише ви</h3>
      <button type="button" className={button} disabled={disabled && !dirty} onClick={onClose}>Закрити перегляд</button>
    </div>
    <label className="block text-sm font-medium">Мова перегляду
      <select value={preview.site.locale} disabled={disabled} onChange={event => onLocaleChange(event.target.value === 'uk' ? 'uk' : 'en')}>
        <option value="uk">Українська</option><option value="en">English</option>
      </select>
    </label>
    {dirty && <p role="status">У формі є нові правки. Цей перегляд показує останню збережену чернетку.</p>}
    {preview.draftVersion !== version && <p role="status">Перегляд застарів. Відкрийте його з панелі дій ще раз.</p>}
    {preview && page && <article className="space-y-4 rounded-lg border border-zinc-200 p-4" lang={preview.site.locale}>
      <p className="text-sm text-zinc-600">{preview.site.brand}</p>
      <h4 className="text-lg font-semibold">{'title' in page ? page.title : page.seo.title}</h4>
      {'hero' in page ? <>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminImage url={page.hero.desktop.url} alt={page.hero.desktop.alt} />
          <AdminImage url={page.hero.mobile.url} alt={page.hero.mobile.alt} />
        </div>
        <p className="font-semibold">{page.servicesSection.title}</p>
        <p>{page.servicesSection.description}</p>
        <ul className="grid gap-3 sm:grid-cols-2">{page.servicesSection.items.map(item => <li key={item.id}>
          <AdminImage url={item.cardImage.url} alt={item.cardImage.alt} />{item.title}
        </li>)}</ul>
        <p className="font-semibold">{page.storiesSection.title}</p>
        <ul className="grid gap-3 sm:grid-cols-2">{page.storiesSection.items.map(({ story, caption }) => <li key={story.id}>
          <AdminImage url={story.cover.url} alt={story.cover.alt} />{story.title} · {caption}
        </li>)}</ul>
        <AdminImage url={page.contactSection.background.url} alt={page.contactSection.background.alt} />
        <p>{page.contactSection.title} · {page.contactSection.description} · {portfolioBookingLabel[preview.site.locale]}</p>
      </> : <>
        {'subtitle' in page && <p>{page.subtitle}</p>}
        <p>{page.description}</p>
        {'photos' in page ? <>
          <AdminImage url={page.cover.url} alt={page.cover.alt} />
          <ul className="grid gap-3 sm:grid-cols-2">{page.photos.map(({ id, image }) => <li key={id}><AdminImage url={image.url} alt={image.alt} /></li>)}</ul>
        </> : <>
          <AdminImage url={page.cardImage.url} alt={page.cardImage.alt} />
          <ul className="grid gap-3 sm:grid-cols-2">{page.stories.items.map(story => <li key={story.id}><AdminImage url={story.cover.url} alt={story.cover.alt} />{story.title}</li>)}</ul>
        </>}
      </>}
      <p>{preview.site.booking.intro}</p>
      <ul>{preview.site.contacts.map(contact => <li key={contact.type}>{contact.label} · {contact.href}</li>)}</ul>
      <p>{page.seo.title} · {page.seo.description}</p>
      {page.seo.shareImage && <AdminImage url={page.seo.shareImage.url} alt={page.seo.shareImage.alt} />}
    </article>}
  </section>;
}

