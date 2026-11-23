'use client';

import { useQueries } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import type { AdminPortfolioEntityBaseDto, AdminPortfolioMediaDto, PortfolioImageRefDto, PortfolioServiceDraftInputDto, PortfolioStoryDraftInputDto, PortfolioHomeDraftInputDto, PortfolioStoryPhotoInputDto } from '@/lib/portfolio/contracts';
import { fetchPortfolioMedia, mediaDetailKey } from './portfolio-media-data';

export type PortfolioEditorDraft = PortfolioServiceDraftInputDto | PortfolioStoryDraftInputDto | PortfolioHomeDraftInputDto;
export type ReadinessIssue = { field: string; label: string; message: string };

export function requiredDraftFields(draft: PortfolioEditorDraft, photos: readonly PortfolioStoryPhotoInputDto[] = []) {
  const missing: string[] = [];
  const text = (name: string, value: string) => { if (!value.trim()) missing.push(name); };
  const localized = (name: string, value: { uk: string; en: string }) => {
    text(name + '.uk', value.uk);
    text(name + '.en', value.en);
  };
  const image = (name: string, value: PortfolioImageRefDto | null) => {
    if (value) localized(name + '.alt', value.alt);
    else missing.push(name + '.mediaId');
  };

  localized('seo.title', draft.seo.title);
  localized('seo.description', draft.seo.description);
  if (draft.seo.shareImage) image('seo.shareImage', draft.seo.shareImage);
  if ('brand' in draft) {
    localized('bookingIntro', draft.bookingIntro);
    image('hero.desktop', draft.hero.desktop);
    image('hero.mobile', draft.hero.mobile);
    localized('servicesSection.title', draft.servicesSection.title);
    localized('servicesSection.description', draft.servicesSection.description);
    localized('storiesSection.title', draft.storiesSection.title);
    if (!draft.servicesSection.serviceIds.length) missing.push('servicesSection.serviceIds');
    if (!draft.storiesSection.items.length) missing.push('storiesSection.items');
    draft.storiesSection.items.forEach((item, index) => {
      const name = 'storiesSection.items.' + index;
      localized(name + '.caption', item.caption);
      if (item.image) image(name + '.image', item.image);
    });
    image('contactSection.background', draft.contactSection.background);
    draft.contacts.forEach((contact, index) => text('contacts.' + index + '.address', contact.address));
  } else {
    text('slug', draft.slug);
    localized('title', draft.title);
    localized('description', draft.description);
    if ('cover' in draft) {
      text('serviceId', draft.serviceId);
      localized('subtitle', draft.subtitle);
      image('cover', draft.cover);
      if (!photos.length) missing.push('items');
      photos.forEach((photo, index) => image('items.' + index + '.image', photo.image));
    } else {
      image('cardImage', draft.cardImage);
      if (draft.bookingEnabled && !draft.price) missing.push('price');
    }
  }
  return missing;
}

export function describePortfolioField(field: string) {
  const key = field.replace(/^data\./, '');
  const language = key.endsWith('.uk') ? ' · Українська' : key.endsWith('.en') ? ' · English' : '';
  const base = key.replace(/\.(uk|en)$/, '');
  const names: Record<string, string> = {
    title: 'Назва', subtitle: 'Підзаголовок', description: 'Опис', slug: 'Адреса запису', serviceId: 'Фотосесія',
    price: 'Ціна й тривалість', bookingIntro: 'Вступ форми запису', items: 'Фото історії',
    'seo.title': 'Заголовок у Google', 'seo.description': 'Опис у Google',
    'servicesSection.title': 'Заголовок фотосесій', 'servicesSection.description': 'Опис фотосесій',
    'servicesSection.serviceIds': 'Фотосесії на головній', 'storiesSection.title': 'Заголовок історій',
    'storiesSection.items': 'Добірка історій',
  };
  if (names[base]) return names[base] + language;
  if (base.startsWith('contacts.')) return 'Адреса контакту ' + (Number(base.split('.')[1]) + 1);
  const photo = base.match(/^items\.(\d+)\.image/);
  const featured = base.match(/^storiesSection\.items\.(\d+)/);
  const imageName = photo ? 'Фото ' + (Number(photo[1]) + 1) : featured ? 'Історія в добірці ' + (Number(featured[1]) + 1)
    : base.startsWith('cover.') ? 'Обкладинка' : base.startsWith('cardImage.') ? 'Фото фотосесії'
    : base.startsWith('hero.desktop.') ? 'Головне фото для комп’ютера' : base.startsWith('hero.mobile.') ? 'Головне фото для телефона'
    : base.startsWith('contactSection.background.') ? 'Фон секції запису' : base.startsWith('seo.shareImage.') ? 'Фото для соцмереж' : '';
  if (imageName) return imageName + (base.includes('.alt') ? ' · опис зображення' : base.endsWith('.caption') ? ' · підпис' : '') + language;
  if (base.startsWith('servicesSection.serviceIds.')) return 'Фотосесії на головній';
  return 'Поле сторінки' + language;
}

function mediaFields(draft: PortfolioEditorDraft, photos: readonly PortfolioStoryPhotoInputDto[]) {
  const fields: { field: string; id: string }[] = [];
  const add = (field: string, image: PortfolioImageRefDto | null) => { if (image) fields.push({ field: field + '.mediaId', id: image.mediaId }); };
  add('seo.shareImage', draft.seo.shareImage);
  if ('cardImage' in draft) add('cardImage', draft.cardImage);
  if ('cover' in draft) {
    add('cover', draft.cover);
    photos.forEach((photo, index) => add(`items.${index}.image`, photo.image));
  }
  if ('brand' in draft) {
    add('hero.desktop', draft.hero.desktop); add('hero.mobile', draft.hero.mobile);
    add('contactSection.background', draft.contactSection.background);
    draft.storiesSection.items.forEach((item, index) => add(`storiesSection.items.${index}.image`, item.image ?? null));
  }
  return fields;
}

export function usePortfolioReadiness(draft: PortfolioEditorDraft, photos: readonly PortfolioStoryPhotoInputDto[], media: readonly AdminPortfolioMediaDto[]) {
  const references = mediaFields(draft, photos);
  const ids = [...new Set(references.map(ref => ref.id))];
  const mediaQueries = useQueries({ queries: ids.map(id => ({
    queryKey: mediaDetailKey(id), queryFn: ({ signal }: { signal: AbortSignal }) => fetchPortfolioMedia(id, signal),
    initialData: () => media.find(item => item.id === id), initialDataUpdatedAt: 0, retry: false,
    refetchInterval: (query: { state: { data: AdminPortfolioMediaDto | undefined } }): number | false => query.state.data?.status === 'PROCESSING' ? 3500 : false,
  })) });
  const dependencies: { field: string; resource: 'services' | 'stories'; id: string }[] = [];
  if ('serviceId' in draft && draft.serviceId) dependencies.push({ field: 'serviceId', resource: 'services', id: draft.serviceId });
  if ('brand' in draft) {
    draft.servicesSection.serviceIds.forEach((id, index) => dependencies.push({ field: `servicesSection.serviceIds.${index}`, resource: 'services', id }));
    draft.storiesSection.items.forEach((item, index) => dependencies.push({ field: `storiesSection.items.${index}.storyId`, resource: 'stories', id: item.storyId }));
  }
  const dependencyQueries = useQueries({ queries: dependencies.map(ref => ({
    queryKey: ['portfolio-admin', ref.resource, ref.id],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiRequest<AdminPortfolioEntityBaseDto>(`/api/portfolio/${ref.resource}/${ref.id}`, { signal, cache: 'no-store' }),
    retry: false,
  })) });
  const issues = new Map<string, ReadinessIssue>();
  const add = (field: string, message: string) => issues.set(field, { field, label: describePortfolioField(field), message });
  requiredDraftFields(draft, photos).forEach(field => add(field, 'Заповніть перед публікацією'));
  if ('cover' in draft && new Set([...photos.map(photo => photo.image.mediaId), ...(draft.cover ? [draft.cover.mediaId] : [])]).size > 10)
    add('items', 'Залиште не більше 10 унікальних фото разом з обкладинкою');
  references.forEach(ref => {
    const query = mediaQueries[ids.indexOf(ref.id)];
    if (query?.isError) add(ref.field, 'Не вдалося перевірити фото. Повторіть перевірку або замініть його');
    else if (query?.data && (query.data.status !== 'READY' || !query.data.previewUrl))
      add(ref.field, query.data.status === 'PROCESSING' ? 'Фото ще обробляється' : 'Потрібне готове фото з мініатюрою');
  });
  dependencies.forEach((ref, index) => {
    const query = dependencyQueries[index];
    if (query?.isError) add(ref.field, 'Не вдалося перевірити пов’язаний запис. Повторіть перевірку');
    else if (query?.data && query.data.status !== 'PUBLISHED') add(ref.field, 'Спочатку опублікуйте пов’язаний запис');
  });
  return {
    issues: [...issues.values()],
    checking: [...mediaQueries, ...dependencyQueries].some(query => query.isPending),
    retry: () => { for (const query of [...mediaQueries, ...dependencyQueries]) void query.refetch(); },
  };
}


