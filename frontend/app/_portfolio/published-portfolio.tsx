import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPortfolioPrice } from '@/lib/portfolio/price';
import type { PortfolioSiteDto } from '@/lib/portfolio/contracts';
import { loadPortfolioHome, loadPortfolioStory } from '@/lib/portfolio/server';
import type { PortfolioLocale } from '@/lib/portfolio/validate-public';
import { BookingTrigger } from './portfolio-booking';
import { LegacyStoryRedirect } from './legacy-story-redirect';
import PortfolioLayout from './portfolio-layout';
import { PortfolioNavigation } from './portfolio-navigation';
import { PortfolioFooter } from './portfolio-footer';
import { portfolioFocalPosition, portfolioSrcSet, PublishedPhoto } from './portfolio-photo';
import styles from './portfolio.module.css';

const cardSizes = '(max-width: 760px) calc(100vw - 40px), 33vw';

function PortfolioNotice({ locale, empty }: { locale: PortfolioLocale; empty?: boolean }) {
  const en = locale === 'en';
  return (
    <main className={styles.portfolio} lang={locale}>
      <section className={styles.section}>
        <h1>{empty
          ? en ? 'Portfolio is coming soon' : 'Портфоліо готується до публікації'
          : en ? 'Portfolio temporarily unavailable' : 'Портфоліо тимчасово недоступне'}</h1>
      </section>
    </main>
  );
}

function navigation(site: PortfolioSiteDto, prefix: string, storySlug?: string, bookingSlug?: string) {
  return <PortfolioNavigation storySlug={storySlug} bookingSlug={bookingSlug} brand={site.brand}
    homeHref={prefix || '/'} locale={site.locale} bookingEnabled={site.booking.services.length > 0} />;
}

export async function PublishedHome({ locale, prefix }: { locale: PortfolioLocale; prefix: string }) {
  const result = await loadPortfolioHome(locale);
  if (result.kind !== 'ready') return <PortfolioNotice locale={locale} empty={result.kind === 'missing'} />;
  const { site, page } = result.data;
  const { hero, servicesSection, storiesSection, contactSection } = page;
  const en = locale === 'en';
  const focal = { '--desktop-focus': portfolioFocalPosition(hero.desktop), '--mobile-focus': portfolioFocalPosition(hero.mobile) };
  return (
    <PortfolioLayout site={site}>
      <LegacyStoryRedirect prefix={prefix} />
      {navigation(site, prefix)}
      <main lang={locale}>
        <h1 className="sr-only">{site.brand}</h1>
        <section className={styles.hero} id="home" tabIndex={-1} aria-label={en ? 'Featured photograph' : 'Головна фотографія'}>
          <div className={styles.heroSticky}>
            <picture className={`${styles.heroImage} ${styles.publishedHero}`} style={focal as React.CSSProperties}>
              <source media="(max-width: 760px)" srcSet={portfolioSrcSet(hero.mobile)} sizes="100vw" />
              <img src={hero.desktop.url} srcSet={portfolioSrcSet(hero.desktop)} sizes="100vw"
                alt={hero.desktop.alt} width={hero.desktop.width} height={hero.desktop.height} fetchPriority="high" />
            </picture>
            <div className={styles.heroInfo}>
              <span>{en ? '01 / HOME' : '01 / ГОЛОВНА'}</span>
              <a className={styles.scrollHint} href="#services">{en ? 'SCROLL DOWN' : 'ГОРТАЙТЕ ДАЛІ'} <span aria-hidden="true">↓</span></a>
            </div>
          </div>
        </section>

        <section id="services" className={styles.section} aria-labelledby="services-title" tabIndex={-1}>
          <header className={`${styles.sectionHead} ${styles.serviceHead}`} data-portfolio-reveal>
            <h2 id="services-title">{servicesSection.title}</h2>
            <p className={styles.description}>{servicesSection.description}</p>
          </header>
          <div className={styles.serviceGrid}>
            {servicesSection.items.map(service => (
              <article className={styles.serviceCard} key={service.id} data-portfolio-reveal>
                <PublishedPhoto image={service.cardImage} sizes={cardSizes} />
                <h3 className={styles.serviceTitle}>{service.title}</h3>
                <p className={styles.description}>{service.description}</p>
                <p className={styles.price}>{formatPortfolioPrice(service.price, locale)}</p>
                {site.booking.services.some(item => item.id === service.id) &&
                  <BookingTrigger className={styles.serviceAction} slug={service.slug}>{en ? 'Book this session' : 'Забронювати зйомку'}</BookingTrigger>}
              </article>
            ))}
          </div>
        </section>

        <section id="stories" className={`${styles.section} ${styles.stories}`} aria-labelledby="stories-title" tabIndex={-1}>
          <header className={styles.sectionHead} data-portfolio-reveal><h2 id="stories-title">{storiesSection.title}</h2></header>
          <div className={styles.storyPair}>
            {storiesSection.items.map(({ story, caption }) => (
              <Link key={story.id} className={styles.storyCard} href={`${prefix}/stories/${story.slug}`} prefetch={false} data-portfolio-reveal>
                <PublishedPhoto image={story.cover} sizes="(max-width: 760px) 100vw, 44vw" />
                <div className={styles.storyCaption}><div><h3>{story.title}</h3><p>{caption}</p></div><span aria-hidden="true">↗</span></div>
              </Link>
            ))}
          </div>
        </section>

        <section id="contact" className={styles.finale} aria-labelledby="contact-title" tabIndex={-1}>
          <PublishedPhoto image={contactSection.background} sizes="100vw" />
          <div className={styles.finaleContent} data-portfolio-reveal>
            <h2 id="contact-title">{contactSection.title}</h2>
            <p className={styles.finaleDescription}>{contactSection.description}</p>
            {site.booking.services.length > 0 && <BookingTrigger className={styles.primaryAction}>{contactSection.buttonLabel} <span aria-hidden="true">↗</span></BookingTrigger>}
          </div>
        </section>
      </main>
      <PortfolioFooter site={site} />
    </PortfolioLayout>
  );
}

export async function PublishedStory({ locale, prefix, slug }: { locale: PortfolioLocale; prefix: string; slug: string }) {
  const result = await loadPortfolioStory(locale, slug);
  if (result.kind === 'missing') notFound();
  if (result.kind === 'unavailable') return <PortfolioNotice locale={locale} />;
  const { site, page: story } = result.data;
  const en = locale === 'en';
  const booking = site.booking.services.find(service => service.id === story.service.id);
  const next = story.nextStory;
  return (
    <PortfolioLayout site={site}>
      {navigation(site, prefix, slug, booking?.slug ?? '')}
      <main className={styles.storyPage} lang={locale}>
        <div className={styles.storyContainer}>
          <Link className={styles.storyBack} href={prefix || '/'} prefetch={false}>{en ? '← BACK TO HOME' : '← ПОВЕРНУТИСЯ НА ГОЛОВНУ'}</Link>
          <header className={styles.storyHeading} id="home" tabIndex={-1}>
            <p className={styles.eyebrow}>{story.service.title}</p>
            <h1>{story.title}</h1>
            <p className={styles.storySubtitle}>{story.subtitle}</p>
            <p className={styles.description}>{story.description}</p>
          </header>
        </div>
        <div className={styles.storyHero}><PublishedPhoto image={story.cover} sizes="100vw" priority /></div>
        {story.photos.length > 0 && <div className={`${styles.storyContainer} ${styles.storyEditorial}`}>
          {story.photos.map(photo => <PublishedPhoto key={photo.id} image={photo.image} sizes="(max-width: 760px) 100vw, 94vw" />)}
        </div>}
        {booking && <section className={styles.storyBooking} id="story-booking" aria-labelledby="story-booking-title">
          <h2 id="story-booking-title">{booking.title}</h2>
          <p className={styles.storyPrice}>{formatPortfolioPrice(booking.price, locale)}</p>
          <BookingTrigger className={styles.primaryAction} slug={booking.slug}>{en ? 'Book a photo session' : 'Забронювати фотосесію'} <span aria-hidden="true">↗</span></BookingTrigger>
        </section>}
        {next && <section className={`${styles.storyContainer} ${styles.nextStory}`} aria-labelledby="next-story-title">
          <h2 className={styles.eyebrow} id="next-story-title">{en ? 'NEXT STORY →' : 'НАСТУПНА ІСТОРІЯ →'}</h2>
          <Link href={`${prefix}/stories/${next.slug}`} prefetch={false}>
            <PublishedPhoto image={next.cover} sizes="(max-width: 760px) 100vw, 94vw" />
            <div className={styles.storyCaption}><h3>{next.title}</h3><span aria-hidden="true">↗</span></div>
          </Link>
        </section>}
      </main>
      <PortfolioFooter site={site} />
    </PortfolioLayout>
  );
}
