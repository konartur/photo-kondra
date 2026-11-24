import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import { portfolioBrand } from './_portfolio/portfolio-brand';
import { PortfolioHome } from './_portfolio/portfolio-home';
import PortfolioLayout from './_portfolio/portfolio-layout';
import {
  portfolioMetadata,
  publishedPortfolioMetadata,
  unavailablePortfolioMetadata,
} from './_portfolio/portfolio-metadata';
import { loadPortfolioHome, portfolioContentMode } from '@/lib/portfolio/server';
import { PublishedHome } from './_portfolio/published-portfolio';
import { portfolioSiteSettings } from '@/lib/portfolio/site-settings';

const fileMetadata: Metadata = portfolioMetadata({
  title: `${portfolioBrand} — Photography`,
  description: `${portfolioBrand} — авторське портфоліо фотографа. Ваші історії в кадрах.`,
  path: '/',
});

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  if (portfolioContentMode() === 'FILE') return fileMetadata;
  const result = await loadPortfolioHome(portfolioSiteSettings.defaultLocale);
  return result.kind === 'ready'
    ? publishedPortfolioMetadata(result.data.site, result.data.page.seo)
    : unavailablePortfolioMetadata;
}

export const viewport: Viewport = { themeColor: '#F7F7F4', viewportFit: 'cover' };

export default async function Home() {
  await connection();
  if (portfolioContentMode() === 'DB')
    return <PublishedHome locale={portfolioSiteSettings.defaultLocale} prefix="" />;
  return (
    <PortfolioLayout>
      <PortfolioHome />
    </PortfolioLayout>
  );
}
