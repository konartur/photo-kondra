// Synthetic published DTOs for the production-build Playwright checks.
let revision = 1;
let mode = 'published';
let reads = 0;
const id = '12345678-1234-4234-8234-123456789012';
const second = '12345678-1234-4234-8234-123456789013';
const slug = 'new-story-from-db';
const derivative = variantId => '/api/public/portfolio/media/' + id + '/variants/' + variantId;
const image = (alt) => ({
  mediaId: id, url: derivative(id), width: 960, height: 640, alt, focalPoint: { x: 0.3, y: 0.4 },
  sources: [{ url: derivative(second), width: 480, height: 320 }, { url: derivative(id), width: 960, height: 640 }],
});

export function handlePortfolioFixture(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/__portfolio_test') {
    if (request.method === 'POST') {
      mode = url.searchParams.get('mode') ?? 'published';
      revision = Number(url.searchParams.get('revision') ?? 1);
      reads = 0;
    }
    response.end(JSON.stringify({ reads }));
    return true;
  }
  const base = '/api/v1/public/portfolio/';
  if (!url.pathname.startsWith(base)) return false;
  const route = url.pathname.slice(base.length);
  const locale = url.searchParams.get('locale') === 'uk' ? 'uk' : 'en';
  const en = locale === 'en';
  const t = (uk, english) => en ? english : uk;
  const send = (data, status = 200) => {
    response.statusCode = status;
    response.end(JSON.stringify(data));
    return true;
  };
  reads++;
  if (mode === 'down') return send({}, 503);
  if (mode === 'invalid') return send({ site: {} });
  if (route === 'sitemap') {
    const paths = mode === 'empty' ? [] : ['', '/stories/' + slug];
    return send({ contentVersion: revision, items: paths.flatMap(path => {
      const alternates = ['uk', 'en'].map(language => ({ locale: language, path: '/' + language + path }));
      return alternates.map(item => ({ ...item, alternates, updatedAt: '2026-11-22T12:00:00Z' }));
    }) });
  }
  if (mode === 'empty' || (mode === 'draft' && route.startsWith('stories/')) ||
    (route !== 'home' && route !== 'stories/' + slug)) return send({}, 404);
  const seo = (path, title) => ({ title, description: t('Опис сайту', 'Published description'), canonicalPath: '/' + locale + path, shareImage: image('Share') });
  const service = { id: second, slug: 'portrait', title: t('Портрет', 'Portrait'), price: { amountMinor: 240000, currency: 'UAH', durationMinutes: 45 } };
  const story = { id, slug, title: t('Опублікована історія', 'Published story') + ' ' + revision, subtitle: t('Підзаголовок', 'Subtitle'), cover: image('Cover') };
  const site = {
    brand: 'Synthetic Portfolio', locale, supportedLocales: ['uk', 'en'],
    contacts: [{ type: 'email', href: 'mailto:demo@example.invalid', label: 'Send email' }],
    booking: { intro: t('Опублікований вступ', 'Published booking intro'), services: mode === 'no-booking' ? [] : [service] },
  };
  const page = route === 'home'
    ? {
      hero: { desktop: image('Desktop hero'), mobile: image('Mobile hero') },
      servicesSection: { title: t('Послуги', 'Published services') + ' ' + revision, description: 'Description', items: [{ ...service, description: 'Portrait description', cardImage: image('Service') }] },
      storiesSection: { title: t('Історії', 'Stories'), items: [{ story, caption: t('Добірка', 'Featured story') }] },
      contactSection: { title: t('Контакт', 'Contact'), description: 'Description', buttonLabel: t('Написати мені', 'Get in touch'), background: image('Background') },
      seo: seo('', t('Опубліковане портфоліо', 'Published portfolio') + ' ' + revision),
    }
    : {
      ...story, service, description: 'Story description', nextStory: null,
      photos: Array.from({ length: 10 }, (_, index) => ({ id: id.slice(0, -2) + String(index).padStart(2, '0'), image: image('Frame ' + index) })),
      seo: seo('/stories/' + slug, story.title),
    };
  return send({ site, page, contentVersion: revision });
}
