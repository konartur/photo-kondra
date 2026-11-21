import type { Sharp } from 'sharp';

/** Shared encoding only; each domain retains its own validation and lifecycle. */
export function webpTransform(image: Sharp, width: number, quality?: number): Sharp {
  return image
    .clone()
    .resize({ width, withoutEnlargement: true })
    .webp(quality === undefined ? undefined : { quality });
}
