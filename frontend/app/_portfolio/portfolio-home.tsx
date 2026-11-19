import Link from 'next/link';
import { BookingTrigger } from './portfolio-booking';
import { LegacyStoryRedirect } from './legacy-story-redirect';
import { PortfolioFooter } from './portfolio-footer';
import { PortfolioNavigation } from './portfolio-navigation';
import { demoPhoto, PortfolioPhoto } from './portfolio-photo';
import { portfolioPrice, portfolioStories } from './portfolio-stories';
import styles from './portfolio.module.css';

const [love, portrait, family, ...otherServices] = portfolioStories;
const serviceCards = [
  { slug: love.slug, title: love.title, ...love.photos[0] },
  { slug: portrait.slug, title: portrait.title, ...portrait.photos[1] },
  { slug: family.slug, title: family.title, ...family.photos[0] },
];
const featuredStories = [
  { ...serviceCards[0], ...love.photos[3], heading: 'Двоє. Одна історія.' },
  { ...serviceCards[2], ...family.photos[2], heading: 'Найрідніші миті.' },
  { ...serviceCards[1], ...portrait.photos[2], heading: 'Бути собою.' },
];
const serviceSizes = '(max-width: 760px) calc(100vw - 40px), (max-width: 1440px) 30vw, 432px';
const storySizes = '(max-width: 760px) calc(100vw - 40px), (max-width: 1440px) 90vw, 1344px';
const pairedSizes = '(max-width: 760px) calc(100vw - 40px), (max-width: 1440px) 44vw, 635px';

function StoryCard({
  story,
  featured = false,
}: {
  story: (typeof featuredStories)[number];
  featured?: boolean;
}) {
  return (
    <Link className={featured ? styles.featuredStory : styles.storyCard} href={`/stories/${story.slug}`} prefetch={false} data-portfolio-reveal>
      <PortfolioPhoto photo={story.photo} alt={story.alt} sizes={featured ? storySizes : pairedSizes} />
      <div className={styles.storyCaption}>
        <div><h3>{story.heading}</h3><p>{story.title}</p></div>
        <span className={styles.arrow} aria-hidden="true">↗</span>
      </div>
    </Link>
  );
}

export function PortfolioHome() {
  const hero = '1519741497674-611481863552';
  return (
    <>
      <LegacyStoryRedirect slugs={portfolioStories.map(({ slug }) => slug)} />
      <PortfolioNavigation />
      <main>
        <h1 className="sr-only">Invisible Gallery — портфоліо фотографа</h1>
        <section className={styles.hero} id="home" tabIndex={-1} aria-label="Головна фотографія">
          <div className={styles.heroSticky}>
            <picture className={styles.heroImage}>
              <source media="(max-width: 760px)" srcSet={`${demoPhoto(hero, 900, 85)}&h=1200&crop=faces`} />
              <img src={demoPhoto(hero, 1900, 85)} alt="Емоційна фотографія пари" fetchPriority="high" />
            </picture>
            <div className={styles.heroInfo}>
              <span>01 / ГОЛОВНА</span>
              <a className={styles.scrollHint} href="#services">ГОРТАЙТЕ ДАЛІ <span aria-hidden="true">↓</span></a>
            </div>
          </div>
        </section>

        <section id="services" className={styles.section} aria-labelledby="services-title" tabIndex={-1}>
          <header className={`${styles.sectionHead} ${styles.serviceHead}`} data-portfolio-reveal>
            <p className={styles.eyebrow}>02 / ПОСЛУГИ</p>
            <h2 id="services-title">Кожна історія<br />особлива.</h2>
            <p className={styles.description}>Щирі моменти, до яких хочеться повертатися. Оберіть свою історію — решту створимо разом.</p>
          </header>
          <div className={styles.serviceGrid}>
            {serviceCards.map((service) => (
              <Link key={service.slug} className={styles.serviceCard} href={`/stories/${service.slug}`} prefetch={false} data-portfolio-reveal>
                <PortfolioPhoto photo={service.photo} alt={service.alt} sizes={serviceSizes} />
                <div className={styles.serviceMeta}>
                  <span className={styles.serviceTitle}>{service.title}</span>
                  <span className={styles.arrow} aria-hidden="true">↗&#xFE0E;</span>
                </div>
                <p className={styles.price}>{portfolioPrice}</p>
                <p className={styles.serviceAction}>Переглянути серію <span aria-hidden="true">↗</span></p>
              </Link>
            ))}
          </div>
          <div className={styles.otherServices}>
            {otherServices.map((service) => (
              <Link key={service.slug} href={`/stories/${service.slug}`} prefetch={false}>
                <span>
                  {service.title}
                  <small className={styles.price}>{portfolioPrice}</small>
                  <span className={styles.serviceAction}>Переглянути серію</span>
                </span>
                <span className={styles.arrow} aria-hidden="true">↗&#xFE0E;</span>
              </Link>
            ))}
          </div>
        </section>

        <section id="stories" className={`${styles.section} ${styles.stories}`} aria-labelledby="stories-title" tabIndex={-1}>
          <header className={styles.sectionHead} data-portfolio-reveal>
            <p className={styles.eyebrow}>03 / ІСТОРІЇ</p>
            <h2 id="stories-title">Історії, які<br />залишаються.</h2>
          </header>
          <StoryCard story={featuredStories[0]} featured />
          <div className={styles.storyPair}>
            {featuredStories.slice(1).map((story) => <StoryCard key={story.slug} story={story} />)}
          </div>
          <div className={styles.storiesOut}>
            <a href="#services">Дослідити всі напрямки <span className={styles.arrow} aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section id="contact" className={styles.finale} aria-labelledby="contact-title" tabIndex={-1}>
          <PortfolioPhoto photo="1592711491694-e85f60a7773a" alt="Родина гуляє залитим сонцем лугом" sizes="100vw" />
          <div className={styles.finaleContent} data-portfolio-reveal>
            <p className={styles.finaleEyebrow}>Ваша історія починається тут</p>
            <h2 id="contact-title">Найважливіше<br />варто зберегти.</h2>
            <p className={styles.finaleDescription}>Давайте створимо фотографії, до яких захочеться повертатися знову і знову.</p>
            <BookingTrigger className={styles.primaryAction}>Забронювати фотосесію <span className={styles.arrow} aria-hidden="true">↗&#xFE0E;</span></BookingTrigger>
          </div>
        </section>
      </main>
      <PortfolioFooter />
    </>
  );
}

