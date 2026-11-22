/* eslint-disable @next/next/no-img-element -- The demo URLs provide responsive image sizes. */
import styles from './portfolio.module.css';
import type { PortfolioImageDto } from '@/lib/portfolio/contracts';

export const portfolioSrcSet = (image: PortfolioImageDto) =>
  image.sources.map(({ url, width }) => `${url} ${width}w`).join(', ');

export const portfolioFocalPosition = ({ focalPoint }: PortfolioImageDto) =>
  focalPoint ? `${focalPoint.x * 100}% ${focalPoint.y * 100}%` : undefined;

export function PublishedPhoto({ image, sizes, priority = false }: {
  image: PortfolioImageDto;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <div className={styles.media}>
      <img src={image.url} srcSet={portfolioSrcSet(image)} sizes={sizes} alt={image.alt}
        width={image.width} height={image.height} style={{ objectPosition: portfolioFocalPosition(image) }}
        decoding="async" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined}
      />
    </div>
  );
}

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
