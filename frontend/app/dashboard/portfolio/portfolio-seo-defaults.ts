import type { LocalizedTextDto, PortfolioSeoInputDto } from '@/lib/portfolio/contracts';

export function seoFromPage(title: LocalizedTextDto, description: LocalizedTextDto) {
  return {
    title: { uk: title.uk.slice(0, 120), en: title.en.slice(0, 120) },
    description: { uk: description.uk.slice(0, 320), en: description.en.slice(0, 320) },
  };
}

export function initialSeo<T extends { seo: PortfolioSeoInputDto }>(draft: T): T {
  if (!('title' in draft) || !('description' in draft)) return draft;
  const defaults = seoFromPage(
    draft.title as LocalizedTextDto,
    draft.description as LocalizedTextDto,
  );
  const seo = {
    ...draft.seo,
    title: { ...draft.seo.title },
    description: { ...draft.seo.description },
  };
  for (const field of ['title', 'description'] as const)
    for (const locale of ['uk', 'en'] as const)
      if (!seo[field][locale].trim()) seo[field][locale] = defaults[field][locale];
  return { ...draft, seo };
}
