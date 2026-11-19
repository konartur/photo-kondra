/* eslint-disable @next/next/no-img-element -- The demo URLs provide responsive image sizes. */
import styles from './portfolio.module.css';

export function demoPhoto(id: string, width: number, quality = 82) {
  return `https://images.unsplash.com/photo-${id}?auto=format&w=${width}&q=${quality}&fit=crop`;
}

export function PortfolioPhoto({ photo, alt, sizes, priority = false }: {
  photo: string;
  alt: string;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <div className={styles.media}>
      <span className={styles.imageFallback} aria-hidden="true">Фотографія</span>
      <img
        src={demoPhoto(photo, priority ? 1800 : 1000)}
        srcSet={[400, 700, 1000, 1500, 2000].map((width) => `${demoPhoto(photo, width)} ${width}w`).join(', ')}
        sizes={sizes}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
      />
    </div>
  );
}
