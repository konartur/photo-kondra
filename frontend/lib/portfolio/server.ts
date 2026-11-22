import 'server-only';

import { cache } from 'react';
import { connection } from 'next/server';
import { backendUrl } from '@/lib/auth/server';
import { backendClientHeaders } from '@/lib/api/backend-client';
import type { PortfolioHomePageDto, PortfolioSitemapDto, PortfolioStoryPageDto } from './contracts';
import {
  isPortfolioSlug, validPortfolioHome, validPortfolioSitemap, validPortfolioStory, type PortfolioLocale,
} from './validate-public';

export function portfolioContentMode() {
  const mode = process.env.PORTFOLIO_CONTENT_MODE ?? 'FILE';
  if (mode !== 'FILE' && mode !== 'DB') throw new Error('Invalid PORTFOLIO_CONTENT_MODE');
  return mode;
}

type PortfolioResult<T> = { kind: 'ready'; data: T } | { kind: 'missing' } | { kind: 'unavailable' };

async function load<T>(path: string, validate: (value: unknown) => value is T): Promise<PortfolioResult<T>> {
  await connection();
  try {
    const url = backendUrl('/public/portfolio/' + path);
    const response = await fetch(url, {
      headers: await backendClientHeaders(url),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
    });
    if (response.status === 404) return { kind: 'missing' };
    if (!response.ok) return { kind: 'unavailable' };
    const data: unknown = await response.json();
    return validate(data) ? { kind: 'ready', data } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

export const loadPortfolioHome = cache((locale: PortfolioLocale) =>
  load<PortfolioHomePageDto>('home?locale=' + locale, (value): value is PortfolioHomePageDto => validPortfolioHome(value, locale)));

export const loadPortfolioStory = cache((locale: PortfolioLocale, slug: string) =>
  isPortfolioSlug(slug)
    ? load<PortfolioStoryPageDto>('stories/' + slug + '?locale=' + locale, (value): value is PortfolioStoryPageDto => validPortfolioStory(value, locale, slug))
    : Promise.resolve({ kind: 'missing' } as const));

export function loadPortfolioSitemap() {
  return load<PortfolioSitemapDto>('sitemap', validPortfolioSitemap);
}
