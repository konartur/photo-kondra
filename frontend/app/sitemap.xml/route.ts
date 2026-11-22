import { connection } from 'next/server';
import { loadPortfolioSitemap, portfolioContentMode } from '@/lib/portfolio/server';
import { portfolioOrigin } from '../_portfolio/portfolio-metadata';
import { portfolioStories } from '../_portfolio/portfolio-stories';

const noStore = { 'Cache-Control': 'no-store' };

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export async function GET() {
  await connection();
  const origin = portfolioOrigin();
  const absolute = (path: string) => escapeXml(new URL(path, origin ?? undefined).href);
  let items: string[] = [];
  if (origin && portfolioContentMode() === 'DB') {
    const result = await loadPortfolioSitemap();
    if (result.kind === 'unavailable') return new Response(null, { status: 503, headers: noStore });
    if (result.kind === 'ready') {
      items = result.data.items.map(item => {
        const alternates = item.alternates.map(alternate =>
          '<xhtml:link rel="alternate" hreflang="' + alternate.locale + '" href="' + absolute(alternate.path) + '" />',
        ).join('');
        return '<url><loc>' + absolute(item.path) + '</loc><lastmod>' +
          new Date(item.updatedAt).toISOString() + '</lastmod>' + alternates + '</url>';
      });
    }
  } else if (origin) {
    const paths = ['/', ...portfolioStories.map(({ slug }) => '/stories/' + slug)];
    items = paths.map(path => '<url><loc>' + absolute(path) + '</loc></url>');
  }
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
    items.join('') + '</urlset>',
    { headers: { ...noStore, 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
