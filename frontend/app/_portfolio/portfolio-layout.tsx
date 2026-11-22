import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { PortfolioBooking } from './portfolio-booking';
import { PortfolioMotion } from './portfolio-motion';
import { portfolioPrice, portfolioStories } from './portfolio-stories';
import styles from './portfolio.module.css';
import type { PortfolioSiteDto } from '@/lib/portfolio/contracts';
import { formatPortfolioPrice } from '@/lib/portfolio/price';

const inter = localFont({
  src: './InterVariable.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--portfolio-font',
});

export default function PortfolioLayout({ children, site }: { children: ReactNode; site?: PortfolioSiteDto }) {
  const shootTypes = site
    ? site.booking.services.map(({ slug, title, price }) => ({ slug, title, price: formatPortfolioPrice(price, site.locale) }))
    : portfolioStories.map(({ slug, title }) => ({ slug, title }));
  return (
    <PortfolioMotion className={`${styles.portfolio} ${inter.variable}`} locale={site?.locale}>
      <PortfolioBooking shootTypes={shootTypes} price={site ? '' : portfolioPrice}
        intro={site?.booking.intro} contacts={site?.contacts} locale={site?.locale}>
        {children}
      </PortfolioBooking>
    </PortfolioMotion>
  );
}
