import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { portfolioBrand } from './portfolio-brand';
import type { PortfolioSeoDto, PortfolioSiteDto } from '@/lib/portfolio/contracts';

export function portfolioOrigin() {
  const appUrl = process.env.APP_URL;
  const origin = appUrl && URL.canParse(appUrl) ? new URL(appUrl) : null;
  if (!origin || origin.protocol !== 'https:' || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash) {
    return null;
  }
  return origin;
}

export function portfolioMetadata({ title, description, path }: {
  title: string;
  description: string;
  path: '/' | `/stories/${string}`;
}): Metadata {
  const origin = portfolioOrigin();
  if (!origin) return { title, description };

  const url = new URL(path, origin);
  const previewName = path === '/' ? 'home' : path.slice('/stories/'.length);
  const previewPath = `portfolio/share/${previewName}.jpg`;
  const image = existsSync(join(process.cwd(), 'public', previewPath))
    ? new URL(`/${previewPath}`, origin)
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website', locale: 'uk_UA', siteName: portfolioBrand, url, title, description,
      images: image ? [{ url: image, alt: title }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary', title, description,
      images: image ? [{ url: image, alt: title }] : undefined,
    },
  };
}

export const unavailablePortfolioMetadata: Metadata = { robots: { index: false, follow: false } };

export function publishedPortfolioMetadata(site: PortfolioSiteDto, seo: PortfolioSeoDto): Metadata {
  const { title, description, canonicalPath, shareImage } = seo;
  const origin = portfolioOrigin();
  if (!origin) return { title, description, ...unavailablePortfolioMetadata };
  const url = new URL(canonicalPath, origin);
  const suffix = canonicalPath.slice(3);
  const images = shareImage ? [{
    url: new URL(shareImage.url, origin), alt: shareImage.alt,
    width: shareImage.width, height: shareImage.height,
  }] : undefined;
  return {
    title, description,
    alternates: { canonical: url, languages: { uk: '/uk' + suffix, en: '/en' + suffix } },
    metadataBase: origin,
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website', locale: site.locale === 'uk' ? 'uk_UA' : 'en_US', siteName: site.brand,
      url, title, description, images,
    },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description, images },
  };
}
