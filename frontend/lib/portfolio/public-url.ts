import type { PortfolioSiteDto } from './contracts';

export function publicUrl(
  resource: 'services' | 'stories' | 'settings',
  slug: string | undefined,
  locale: PortfolioSiteDto['locale'],
) {
  const prefix = '/' + locale;
  if (resource === 'services') return prefix + '#services';
  if (resource === 'stories')
    return slug ? prefix + '/stories/' + encodeURIComponent(slug) : prefix + '#stories';
  return prefix;
}
