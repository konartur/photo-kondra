import { test, expect } from '@playwright/test';
import {
  requiredDraftFields,
  describePortfolioField,
  translationProgress,
} from '../app/dashboard/portfolio/portfolio-editor-readiness';
import {
  deriveEditorStatus,
  retainUnchangedFieldErrors,
} from '../app/dashboard/portfolio/portfolio-editor-state';
import { initialSeo, seoFromPage } from '../app/dashboard/portfolio/portfolio-seo-defaults';
import { recoveredStorySave } from '../app/dashboard/portfolio/portfolio-save-recovery';
import type { PortfolioHomeDraftInputDto } from '../lib/portfolio/contracts';

const text = { uk: 'Текст', en: 'Text' };
const image = { mediaId: 'media', alt: text, focalPoint: null };
const service = {
  slug: 'portrait',
  title: text,
  description: text,
  cardImage: image,
  price: null,
  bookingEnabled: false,
  seo: { title: text, description: text, shareImage: null },
};
const story = { ...service, serviceId: 'service', subtitle: text, cover: image };
const home: PortfolioHomeDraftInputDto = {
  brand: 'Brand',
  bookingIntro: text,
  contacts: [{ type: 'email', address: '', visible: true }],
  hero: { desktop: image, mobile: null },
  servicesSection: { title: text, description: text, serviceIds: [] },
  storiesSection: { title: text, items: [{ storyId: 'story', caption: { uk: '', en: '' } }] },
  contactSection: { title: text, description: text, buttonLabel: text, background: image },
  seo: service.seo,
};

test('readiness distinguishes draft completeness, optional images, price and photo translations', () => {
  expect(requiredDraftFields(service)).toEqual([]);
  expect(requiredDraftFields({ ...service, bookingEnabled: true })).toContain('price');
  expect(requiredDraftFields({ ...service, cardImage: null })).toContain('cardImage.mediaId');
  expect(requiredDraftFields({ ...story, subtitle: { uk: '', en: '' } })).toEqual(
    expect.arrayContaining(['subtitle.uk', 'subtitle.en', 'items']),
  );
  const photos = [{ id: 'photo', image: { ...image, alt: { uk: '', en: 'Photo' } } }];
  expect(requiredDraftFields(story, photos)).toEqual(['items.0.image.alt.uk']);
  expect(requiredDraftFields(home)).toEqual(
    expect.arrayContaining([
      'hero.mobile.mediaId',
      'servicesSection.serviceIds',
      'contacts.0.address',
    ]),
  );
  expect(requiredDraftFields(home)).not.toContain('storiesSection.items.0.caption.uk');
  const override = {
    ...home,
    storiesSection: {
      ...home.storiesSection,
      items: [
        {
          storyId: 'story',
          caption: { uk: 'Custom', en: '' },
          image: { ...image, alt: { uk: '', en: '' } },
        },
      ],
    },
  };
  expect(requiredDraftFields(override)).toEqual(
    expect.arrayContaining([
      'storiesSection.items.0.caption.en',
      'storiesSection.items.0.image.alt.uk',
    ]),
  );
  expect(
    translationProgress(override, []).find((item) => item.locale === 'en')!.filled,
  ).toBeLessThan(translationProgress(override, []).find((item) => item.locale === 'en')!.total);
});

test('all field label branches have meaningful localized labels', () => {
  for (const field of [
    'title',
    'subtitle',
    'description',
    'slug',
    'serviceId',
    'price',
    'bookingIntro',
    'items',
    'seo.title',
    'seo.description',
    'servicesSection.title',
    'servicesSection.description',
    'servicesSection.serviceIds',
    'storiesSection.title',
    'storiesSection.items',
  ])
    expect(describePortfolioField(field)).not.toContain('Поле сторінки');
  for (const field of [
    'items.0.image.alt',
    'storiesSection.items.0.caption',
    'cover.alt',
    'cardImage.alt',
    'hero.desktop.alt',
    'hero.mobile.alt',
    'contactSection.background.alt',
    'seo.shareImage.alt',
  ]) {
    expect(describePortfolioField('data.' + field + '.uk')).toContain('Українська');
    expect(describePortfolioField(field + '.en')).toContain('English');
  }
  expect(describePortfolioField('contacts.1.address')).toContain('2');
  expect(describePortfolioField('servicesSection.serviceIds.1')).toBe('Фотосесії на головній');
  expect(describePortfolioField('unknown')).toBe('Поле сторінки');
});

test('editor state covers new, dirty, clean publication, archive, conflict and pending', () => {
  const record = {
    id: 'id',
    status: 'DRAFT' as const,
    draftVersion: 1,
    publishedVersion: null,
    hasUnpublishedChanges: true,
    updatedAt: '',
    publishedAt: null,
  };
  const base = {
    record,
    dirty: false,
    conflict: false,
    readiness: { checking: false },
    checklist: [],
  };
  expect(deriveEditorStatus({ ...base, record: undefined }).canPublish).toBe(false);
  expect(deriveEditorStatus({ ...base, dirty: true }).statusText).toContain('незбережені');
  expect(deriveEditorStatus(base).canPublish).toBe(true);
  expect(
    deriveEditorStatus({ ...base, record: { ...record, status: 'ARCHIVED' } }).statusText,
  ).toContain('архіві');
  expect(
    deriveEditorStatus({
      ...base,
      record: { ...record, status: 'PUBLISHED', hasUnpublishedChanges: false },
    }).publishedClean,
  ).toBe(true);
  for (const extra of [
    { conflict: true },
    { pending: true },
    { readiness: { checking: true } },
    { checklist: ['issue'] },
  ]) {
    const status = deriveEditorStatus({ ...base, ...extra });
    expect(status.canPublish).toBe(false);
    expect(status.publishReason).not.toBe('');
  }
});

test('SEO defaults preserve manual text and recovery requires exact data and version', () => {
  const draft = { ...service, seo: { ...service.seo, title: { uk: 'Manual', en: '' } } };
  expect(initialSeo(draft).seo.title).toEqual({ uk: 'Manual', en: 'Text' });
  expect(
    seoFromPage(text, { uk: 'a'.repeat(500), en: 'b'.repeat(500) }).description.en,
  ).toHaveLength(320);
  const attempt = { version: 4, data: { title: text }, photos: [{ id: 'p', image }] };
  const server = {
    draftVersion: 5,
    draft: { title: { en: 'Text', uk: 'Текст' } },
    photos: attempt.photos,
  };
  expect(recoveredStorySave(server, attempt)).toBe(true);
  expect(recoveredStorySave({ ...server, draftVersion: 6 }, attempt)).toBe(false);
  expect(recoveredStorySave({ ...server, photos: [] }, attempt)).toBe(false);
  expect(
    retainUnchangedFieldErrors(
      ['data.title.uk', 'title.en'],
      { title: text },
      { title: { ...text, uk: 'Changed' } },
    ),
  ).toEqual(['title.en']);
});
