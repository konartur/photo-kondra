import type { Metadata, Viewport } from 'next';
import { portfolioBrand } from './_portfolio/portfolio-brand';
import { PortfolioHome } from './_portfolio/portfolio-home';
import PortfolioLayout from './_portfolio/portfolio-layout';
import { portfolioMetadata } from './_portfolio/portfolio-metadata';

export const metadata: Metadata = portfolioMetadata({
  title: `${portfolioBrand} — Photography`,
  description: `${portfolioBrand} — авторське портфоліо фотографа. Ваші історії в кадрах.`,
  path: '/',
});

export const viewport: Viewport = { themeColor: '#F7F7F4', viewportFit: 'cover' };

export default function Home() {
  return (
    <PortfolioLayout>
      <PortfolioHome />
    </PortfolioLayout>
  );
}
