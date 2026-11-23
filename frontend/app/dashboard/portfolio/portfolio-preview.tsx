'use client';

import { useState } from 'react';
import { ApiError, apiRequest } from '@/lib/api/client';
import { portfolioBookingLabel } from '@/lib/portfolio/booking-label';
import type {
  PortfolioHomePreviewDto, PortfolioServicePreviewDto, PortfolioStoryPreviewDto,
} from '@/lib/portfolio/contracts';
import { AdminImage, button, panel } from './editor-fields';

type Preview = PortfolioHomePreviewDto | PortfolioServicePreviewDto | PortfolioStoryPreviewDto;

export function PortfolioPreview({ path, version, onInvalidFields }: {
  path: string; version: number; onInvalidFields?: (fields: readonly string[]) => void;
}) {
  const [locale, setLocale] = useState<'uk' | 'en'>('uk');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true); setError(''); setPreview(null);
    onInvalidFields?.([]);
    try {
      setPreview(await apiRequest<Preview>(path + '/preview?locale=' + locale, { cache: 'no-store' }));
    } catch (failure) {
      if (failure instanceof ApiError) onInvalidFields?.(failure.fields);
      setError(failure instanceof ApiError && failure.status === 409
        ? 'Чернетка ще не готова до перегляду. Перевірте готовність фото, заповнення обох мов і публікацію залежних записів.'
        : 'Попередній перегляд недоступний.');
    } finally { setBusy(false); }
  }

  const page = preview?.page;
  return <section className={panel} aria-label="Приватний попередній перегляд">
    <h3 className="font-semibold">Попередній перегляд збереженої чернетки</h3>
    <div className="flex flex-wrap items-end gap-2">
      <label className="block text-sm font-medium">Мова
        <select value={locale} disabled={busy} onChange={e => {
          setLocale(e.target.value === 'en' ? 'en' : 'uk');
          setPreview(null);
        }}>
          <option value="uk">Українська</option><option value="en">English</option>
        </select>
      </label>
      <button type="button" className={button} disabled={busy} onClick={() => void load()}>{busy ? 'Завантажуємо…' : 'Показати чернетку'}</button>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {preview && preview.draftVersion !== version && <p role="status">Ця версія відрізняється від версії редактора.</p>}
    {preview && page && <article className="space-y-4 rounded-lg border border-zinc-200 p-4" lang={preview.site.locale}>
      <p className="text-sm text-zinc-600">{preview.site.brand} · v{preview.draftVersion}</p>
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
