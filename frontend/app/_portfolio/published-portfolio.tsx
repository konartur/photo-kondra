import { notFound } from 'next/navigation';
import { loadPortfolioHome, loadPortfolioStory } from '@/lib/portfolio/server';
import type { PortfolioLocale } from '@/lib/portfolio/validate-public';
import { HomePageContent, StoryPageContent } from './portfolio-page-content';
import styles from './portfolio.module.css';
function PortfolioNotice({ locale, empty }: { locale: PortfolioLocale; empty?: boolean }) {
  const en = locale === 'en';
  return (
    <main className={styles.portfolio} lang={locale}>
      <section className={styles.section}>
        <h1>
          {empty
            ? en
              ? 'Portfolio is coming soon'
              : 'Портфоліо готується до публікації'
            : en
              ? 'Portfolio temporarily unavailable'
              : 'Портфоліо тимчасово недоступне'}
        </h1>
      </section>
    </main>
  );
}

export async function PublishedHome({
  locale,
  prefix,
}: {
  locale: PortfolioLocale;
  prefix: string;
}) {
  const result = await loadPortfolioHome(locale);
  if (result.kind !== 'ready')
    return <PortfolioNotice locale={locale} empty={result.kind === 'missing'} />;
  return <HomePageContent site={result.data.site} page={result.data.page} prefix={prefix} />;
}
export async function PublishedStory({
  locale,
  prefix,
  slug,
}: {
  locale: PortfolioLocale;
  prefix: string;
  slug: string;
}) {
  const result = await loadPortfolioStory(locale, slug);
  if (result.kind === 'missing') notFound();
  if (result.kind === 'unavailable') return <PortfolioNotice locale={locale} />;
  return <StoryPageContent site={result.data.site} story={result.data.page} prefix={prefix} />;
}
