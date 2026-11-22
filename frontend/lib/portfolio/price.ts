import type { PortfolioPriceDto } from './contracts';
import type { PortfolioLocale } from './validate-public';

export function formatPortfolioPrice(price: PortfolioPriceDto | null, locale: PortfolioLocale) {
  if (!price) return locale === 'uk' ? 'Вартість за домовленістю' : 'Price on request';
  const amount = new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency }).format(price.amountMinor / 100);
  const duration = new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(price.durationMinutes);
  return amount + ' / ' + duration;
}
