import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { loadPortfolioHome, loadPortfolioStory, portfolioContentMode } from '@/lib/portfolio/server';
import type { PortfolioLocale } from '@/lib/portfolio/validate-public';
import { PublishedHome, PublishedStory } from './published-portfolio';
import { publishedPortfolioMetadata, unavailablePortfolioMetadata } from './portfolio-metadata';

export async function localizedHomeMetadata(locale: PortfolioLocale): Promise<Metadata> {
  await connection();
  if (portfolioContentMode() !== 'DB') notFound();
  const result = await loadPortfolioHome(locale);
  return result.kind === 'ready'
    ? publishedPortfolioMetadata(result.data.site, result.data.page.seo)
    : unavailablePortfolioMetadata;
}

export async function localizedHome(locale: PortfolioLocale) {
  await connection();
  if (portfolioContentMode() !== 'DB') notFound();
  return <PublishedHome locale={locale} prefix={'/' + locale} />;
}

export async function localizedStoryMetadata(locale: PortfolioLocale, slug: string): Promise<Metadata> {
  if (portfolioContentMode() !== 'DB') notFound();
  const result = await loadPortfolioStory(locale, slug);
  if (result.kind === 'missing') notFound();
  return result.kind === 'ready'
    ? publishedPortfolioMetadata(result.data.site, result.data.page.seo)
    : unavailablePortfolioMetadata;
}

export function localizedStory(locale: PortfolioLocale, slug: string) {
  if (portfolioContentMode() !== 'DB') notFound();
  return <PublishedStory locale={locale} prefix={'/' + locale} slug={slug} />;
}
