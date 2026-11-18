/* eslint-disable @next/next/no-img-element -- The supplied demo URLs already provide responsive crops. */
import Link from 'next/link';
import { PortfolioNavigation } from './portfolio-navigation';
import styles from './portfolio.module.css';

const price = '3 000 грн / 1 год';
const serviceCards = [
  { slug: 'love', title: 'Love Story', photo: '1529636798458-92182e662485', alt: 'Квітковий букет у руках' },
  { slug: 'portrait', title: 'Portrait', photo: '1524504388940-b1c1722653e1', alt: 'Жіночий портрет у м’якому світлі' },
  { slug: 'family', title: 'Family', photo: '1511895426328-dc8714191300', alt: 'Родина проводить час разом на природі' },
];
const otherServices = [
  { slug: 'events', title: 'Events / Lifestyle' },
  { slug: 'brand', title: 'Brand / Commercial' },
  { slug: 'pets', title: 'Фотосесія з улюбленцем' },
];
const featuredStories = [
  { ...serviceCards[0], photo: '1537633552985-df8429e8048b', alt: 'Емоційний момент пари', heading: 'Двоє. Одна історія.' },
  { ...serviceCards[2], photo: '1503454537195-1dcabb73ffb9', alt: 'Дитина на прогулянці', heading: 'Найрідніші миті.' },
  { ...serviceCards[1], photo: '1544005313-94ddf0286df2', alt: 'Крупний план жіночого портрета', heading: 'Бути собою.' },
];
const serviceSizes = '(max-width: 760px) calc(100vw - 40px), (max-width: 1440px) 30vw, 432px';
const storySizes = '(max-width: 760px) calc(100vw - 40px), (max-width: 1440px) 90vw, 1344px';
const pairedSizes = '(max-width: 760px) calc(100vw - 40px), (max-width: 1440px) 44vw, 635px';

function demoPhoto(id: string, width: number, quality = 82) {
  return `https://images.unsplash.com/photo-${id}?auto=format&w=${width}&q=${quality}&fit=crop`;
}

function PortfolioPhoto({ photo, alt, sizes }: { photo: string; alt: string; sizes: string }) {
  const widths = [400, 700, 1000, 1500, 2000];
  return (
    <div className={styles.media}>
      <span className={styles.imageFallback} aria-hidden="true">Фотографія</span>
      <img
        src={demoPhoto(photo, 1000)}
        srcSet={widths.map((width) => `${demoPhoto(photo, width)} ${width}w`).join(', ')}
        sizes={sizes}
        alt={alt}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

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
                <p className={styles.price}>{price}</p>
                <p className={styles.serviceAction}>Переглянути серію <span aria-hidden="true">↗</span></p>
              </Link>
            ))}
          </div>
          <div className={styles.otherServices}>
            {otherServices.map((service) => (
              <Link key={service.slug} href={`/stories/${service.slug}`} prefetch={false}>
                <span>
                  {service.title}
                  <small className={styles.price}>{price}</small>
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
            <a className={styles.primaryAction} href="#contacts">Забронювати фотосесію <span className={styles.arrow} aria-hidden="true">↗&#xFE0E;</span></a>
          </div>
        </section>
      </main>
      <footer className={styles.footer} id="contacts" tabIndex={-1}>
        <div className={styles.footerRow}>
          <div className={styles.brand}>ІМ&apos;Я ФОТОГРАФА<span>PHOTOGRAPHY</span></div>
          <div className={styles.footerContacts}><span>EMAIL ↗</span><span>INSTAGRAM ↗</span><span>TELEGRAM ↗</span></div>
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerRow}>
          <p>© {new Date().getUTCFullYear()} INVISIBLE GALLERY · КОНЦЕПТ ДИЗАЙНУ</p>
          <p>ДЕМО-ФОТО / ДЕМО-КОНТАКТИ · ПОТРІБНА ЗАМІНА</p>
        </div>
      </footer>
    </>
  );
}
