import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { portfolioBrand } from './portfolio-brand';

export function portfolioMetadata({ title, description, path }: {
  title: string;
  description: string;
  path: '/' | `/stories/${string}`;
}): Metadata {
  const appUrl = process.env.APP_URL;
  const origin = appUrl && URL.canParse(appUrl) ? new URL(appUrl) : null;
  if (!origin || origin.protocol !== 'https:' || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash) {
    return { title, description };
  }

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
