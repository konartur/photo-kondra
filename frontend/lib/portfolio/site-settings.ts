import type { PortfolioSiteDto } from './contracts';

/** Shared default for the public root page and links opened from the editor. */
export const portfolioSiteSettings = {
  defaultLocale: 'uk',
} satisfies { defaultLocale: PortfolioSiteDto['locale'] };
