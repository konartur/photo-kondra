import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingTrigger } from '../../_portfolio/portfolio-booking';
import { PortfolioFooter } from '../../_portfolio/portfolio-footer';
import PortfolioLayout from '../../_portfolio/portfolio-layout';
import { PortfolioNavigation } from '../../_portfolio/portfolio-navigation';
import { PortfolioPhoto } from '../../_portfolio/portfolio-photo';
import { portfolioPrice, portfolioStories } from '../../_portfolio/portfolio-stories';
import styles from '../../_portfolio/portfolio.module.css';

type StoryPageProps = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return portfolioStories.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: StoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const story = portfolioStories.find((item) => item.slug === slug);
  if (!story) return {};
  return { title: `${story.title} — Invisible Gallery`, description: story.subtitle };
}

export default async function StoryPage({ params }: StoryPageProps) {
  const { slug } = await params;
  const index = portfolioStories.findIndex((story) => story.slug === slug);
  if (index === -1) notFound();

  const story = portfolioStories[index];
  const next = portfolioStories[(index + 1) % portfolioStories.length];
  const [cover, first, second, third = cover] = story.photos;

  return (
    <PortfolioLayout>
      <PortfolioNavigation storySlug={slug} />
      <main className={styles.storyPage}>
        <div className={styles.storyContainer}>
          <Link className={styles.storyBack} href="/">← ПОВЕРНУТИСЯ НА ГОЛОВНУ</Link>
          <header className={styles.storyHeading} id="home" tabIndex={-1}>
            <p className={styles.eyebrow}>ІСТОРІЯ / {String(index + 1).padStart(2, '0')}</p>
            <h1>{story.title}</h1>
            <p className={styles.storySubtitle}>{story.subtitle}</p>
          </header>
        </div>

        <div className={styles.storyHero}>
          <PortfolioPhoto {...cover} sizes="100vw" priority />
        </div>

        <div className={`${styles.storyContainer} ${styles.storyEditorial}`}>
          <PortfolioPhoto {...first} sizes="(max-width: 760px) 45vw, 42vw" />
          <PortfolioPhoto {...second} sizes="(max-width: 760px) 45vw, 34vw" />
          <PortfolioPhoto {...third} sizes="(max-width: 760px) calc(100vw - 40px), 94vw" />
        </div>

        <section className={styles.storyBooking} id="story-booking" aria-labelledby="story-booking-title">
          <p className={styles.eyebrow}>ПРОДОВЖИМО ВАШОЮ ІСТОРІЄЮ</p>
          <h2 id="story-booking-title">Наступна історія може бути вашою.</h2>
          <p className={styles.storyPrice}>{portfolioPrice}</p>
          <BookingTrigger className={styles.primaryAction} slug={slug}>
            Забронювати фотосесію <span className={styles.arrow} aria-hidden="true">↗&#xFE0E;</span>
          </BookingTrigger>
        </section>

        <section className={`${styles.storyContainer} ${styles.nextStory}`} aria-labelledby="next-story-title">
          <h2 className={styles.eyebrow} id="next-story-title">НАСТУПНА ІСТОРІЯ →</h2>
          <Link href={`/stories/${next.slug}`}>
            <PortfolioPhoto {...next.photos[0]} sizes="(max-width: 760px) calc(100vw - 40px), 94vw" />
            <div className={styles.storyCaption}>
              <h3>{next.title}</h3><span className={styles.arrow} aria-hidden="true">↗</span>
            </div>
          </Link>
        </section>
      </main>
      <PortfolioFooter />
    </PortfolioLayout>
  );
}
