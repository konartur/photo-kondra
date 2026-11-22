import type {
  PortfolioHomePageDto, PortfolioImageDto, PortfolioSiteDto, PortfolioSitemapDto, PortfolioStoryPageDto,
} from './contracts';

export type PortfolioLocale = PortfolioSiteDto['locale'];
export const isPortfolioLocale = (value: unknown): value is PortfolioLocale => value === 'uk' || value === 'en';
export const isPortfolioSlug = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

const idPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuid = new RegExp('^' + idPattern + '$', 'i');
const derivative = new RegExp('^/api/public/portfolio/media/(' + idPattern + ')/variants/' + idPattern + '$', 'i');
const sitemapPath = /^\/(uk|en)(?:\/stories\/([a-z0-9]+(?:-[a-z0-9]+)*))?$/;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: Record<string, unknown>, ...keys: string[]) =>
  keys.every(key => typeof value[key] === 'string');
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const fraction = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 1;
const list = (value: unknown, check: (item: unknown) => boolean, max = Infinity) =>
  Array.isArray(value) && value.length <= max && value.every(check);

function source(value: unknown, mediaId: string) {
  return object(value) && typeof value.url === 'string' && derivative.exec(value.url)?.[1] === mediaId &&
    integer(value.width, 1, 1600) && integer(value.height, 1);
}

function image(value: unknown): value is PortfolioImageDto {
  if (!object(value) || typeof value.mediaId !== 'string' || !source(value, value.mediaId)) return false;
  const { mediaId, focalPoint, sources } = value;
  return typeof value.alt === 'string' &&
    (focalPoint === null || (object(focalPoint) && fraction(focalPoint.x) && fraction(focalPoint.y))) &&
    Array.isArray(sources) && sources.length > 0 && list(sources, item => source(item, mediaId), 3);
}

function entity(value: Record<string, unknown>) {
  return typeof value.id === 'string' && uuid.test(value.id) && isPortfolioSlug(value.slug) &&
    strings(value, 'title');
}

function bookingService(value: unknown) {
  if (!object(value) || !entity(value)) return false;
  const { price } = value;
  return price === null || (object(price) && price.currency === 'UAH' &&
    integer(price.amountMinor, 0, 100_000_000) && integer(price.durationMinutes, 1, 1440));
}

function serviceCard(value: unknown) {
  return object(value) && bookingService(value) && strings(value, 'description') && image(value.cardImage);
}

function storyCard(value: unknown) {
  return object(value) && entity(value) && strings(value, 'subtitle') && image(value.cover);
}

function contact(value: unknown) {
  if (!object(value) || !strings(value, 'label') || typeof value.href !== 'string') return false;
  if (value.type === 'email') return /^mailto:[^\s?&#]+@[^\s?&#]+$/i.test(value.href);
  if (value.type !== 'instagram' && value.type !== 'telegram') return false;
  if (!URL.canParse(value.href)) return false;
  const url = new URL(value.href);
  const hosts = value.type === 'instagram' ? ['instagram.com', 'www.instagram.com'] : ['t.me', 'telegram.me'];
  return url.protocol === 'https:' && !url.username && !url.password &&
    !url.port && !url.search && !url.hash && hosts.includes(url.hostname);
}

function site(value: unknown, locale: PortfolioLocale) {
  return object(value) && value.locale === locale && strings(value, 'brand') &&
    Array.isArray(value.supportedLocales) && value.supportedLocales.length === 2 &&
    value.supportedLocales.includes('uk') && value.supportedLocales.includes('en') &&
    list(value.contacts, contact, 3) && object(value.booking) &&
    strings(value.booking, 'intro') && list(value.booking.services, bookingService, 20);
}

function seo(value: unknown, path: string) {
  return object(value) && value.canonicalPath === path && strings(value, 'title', 'description') &&
    (value.shareImage === null || image(value.shareImage));
}

export function validPortfolioHome(value: unknown, locale: PortfolioLocale): value is PortfolioHomePageDto {
  if (!object(value) || !integer(value.contentVersion, 0) || !site(value.site, locale) || !object(value.page))
    return false;
  const { hero, servicesSection, storiesSection, contactSection } = value.page;
  return object(hero) && image(hero.desktop) && image(hero.mobile) &&
    object(servicesSection) && strings(servicesSection, 'title', 'description') &&
    list(servicesSection.items, serviceCard, 20) &&
    object(storiesSection) && strings(storiesSection, 'title') &&
    list(storiesSection.items, item => object(item) && strings(item, 'caption') && storyCard(item.story), 12) &&
    object(contactSection) && strings(contactSection, 'title', 'description', 'buttonLabel') &&
    image(contactSection.background) && seo(value.page.seo, '/' + locale);
}

export function validPortfolioStory(value: unknown, locale: PortfolioLocale, slug: string): value is PortfolioStoryPageDto {
  if (!object(value) || !integer(value.contentVersion, 0) || !site(value.site, locale) || !object(value.page))
    return false;
  const { page } = value;
  return page.slug === slug && storyCard(page) && strings(page, 'description') && bookingService(page.service) &&
    list(page.photos, item => object(item) && typeof item.id === 'string' && uuid.test(item.id) && image(item.image), 10) &&
    (page.nextStory === null || storyCard(page.nextStory)) && seo(page.seo, '/' + locale + '/stories/' + slug);
}

function alternate(value: unknown) {
  if (!object(value) || !isPortfolioLocale(value.locale) || typeof value.path !== 'string') return false;
  const match = sitemapPath.exec(value.path);
  return match?.[1] === value.locale && (match[2] === undefined || isPortfolioSlug(match[2]));
}

export function validPortfolioSitemap(value: unknown): value is PortfolioSitemapDto {
  return object(value) && integer(value.contentVersion, 0) && list(value.items, item =>
    object(item) && alternate(item) && typeof item.updatedAt === 'string' &&
    Number.isFinite(Date.parse(item.updatedAt)) && list(item.alternates, alternate, 2));
}
