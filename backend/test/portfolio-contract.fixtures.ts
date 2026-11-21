import type { Locale } from '../src/portfolio/dto/shared.dto.js';
import type {
  PortfolioHomeDraftInputDto,
  PortfolioServiceDraftInputDto,
  PortfolioStoryDraftInputDto,
} from '../src/portfolio/dto/admin-input.dto.js';
import type {
  PortfolioHomeDto,
  PortfolioServiceDto,
  PortfolioSiteDto,
  PortfolioStoryDto,
} from '../src/portfolio/dto/public.dto.js';

// Synthetic contract examples only; no production data, network or database access.
export const fixtureId = '12345678-1234-4234-8234-123456789012';
const text = { uk: ' Текст ', en: ' Text ' };
const seoInput = { title: text, description: text, shareImage: null };
export const serviceDraftFixture: PortfolioServiceDraftInputDto = {
  slug: 'portrait',
  title: text,
  description: text,
  price: null,
  cardImage: null,
  bookingEnabled: true,
  seo: seoInput,
};
export const storyDraftFixture: PortfolioStoryDraftInputDto = {
  slug: 'studio-portrait',
  title: text,
  subtitle: text,
  description: text,
  serviceId: fixtureId,
  cover: null,
  seo: seoInput,
};
export const homeDraftFixture: PortfolioHomeDraftInputDto = {
  brand: 'PhotoKondra',
  contacts: [],
  bookingIntro: text,
  hero: { desktop: null, mobile: null },
  servicesSection: { title: text, description: text, serviceIds: [fixtureId] },
  storiesSection: { title: text, items: [{ storyId: fixtureId, caption: text }] },
  contactSection: { title: text, description: text, buttonLabel: text, background: null },
  seo: seoInput,
};

export function publicFixtures(locale: Locale): {
  site: PortfolioSiteDto;
  home: PortfolioHomeDto;
  service: PortfolioServiceDto;
  story: PortfolioStoryDto;
} {
  const title = locale === 'uk' ? 'Портрет' : 'Portrait';
  const image = {
    mediaId: fixtureId,
    url: `/api/portfolio/media/${fixtureId}/variants/${fixtureId}`,
    width: 480,
    height: 720,
    sources: [
      { url: `/api/portfolio/media/${fixtureId}/variants/${fixtureId}`, width: 480, height: 720 },
    ],
    alt: title,
    focalPoint: null,
  };
  const seo = { title, description: title, canonicalPath: `/${locale}`, shareImage: null };
  const bookingService = { id: fixtureId, slug: 'portrait', title, price: null };
  const service = {
    ...bookingService,
    description: title,
    cardImage: image,
    seo,
    stories: { items: [], nextCursor: null },
  };
  const story = {
    id: fixtureId,
    slug: 'studio-portrait',
    title,
    subtitle: title,
    cover: image,
    description: title,
    service: bookingService,
    photos: [{ id: fixtureId, image }],
    nextStory: null,
    seo,
  };
  return {
    site: {
      brand: 'PhotoKondra',
      locale,
      supportedLocales: ['uk', 'en'],
      contacts: [],
      booking: { intro: title, services: [bookingService] },
    },
    home: {
      hero: { desktop: image, mobile: image },
      servicesSection: { title, description: title, items: [service] },
      storiesSection: { title, items: [{ story, caption: title }] },
      contactSection: { title, description: title, buttonLabel: title, background: image },
      seo,
    },
    service,
    story,
  };
}
