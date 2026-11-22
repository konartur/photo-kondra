import { describe, expect, it, jest } from '@jest/globals';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { StorageService } from '../../storage/storage.service.js';
import { PortfolioImageProcessor } from './portfolio-image-processor.js';
import { TerminalPortfolioMediaError } from './portfolio-media.config.js';
import type { PortfolioMediaConfig } from './portfolio-media.config.js';

const id = '12345678-1234-4234-8234-123456789012';
const config: PortfolioMediaConfig = {
  maxPixels: 40_000_000,
  quality: 82,
  lockTtlSeconds: 900,
  processingTimeoutSeconds: 120,
  maintenanceIntervalSeconds: 30,
};
function fixture(
  buffer: Buffer,
  mimeType = 'image/png',
  overrides: Partial<PortfolioMediaConfig> = {},
) {
  const download = jest
    .fn<StorageService['download']>()
    .mockImplementation(async () => Readable.from([buffer]));
  const storage = { download } as unknown as StorageService;
  return {
    processor: new PortfolioImageProcessor(storage, { ...config, ...overrides }),
    media: {
      id,
      originalKey: `portfolio/media/${id}/original.png`,
      mimeType,
      sizeBytes: BigInt(buffer.length),
    },
  };
}

describe('Portfolio bounded image processing', () => {
  it.each([
    [320, [320]],
    [650, [480, 650]],
    [2200, [480, 960, 1600]],
  ] as const)(
    'generates real non-upscaled, deduplicated WebP widths for a %i px source',
    async (width, expected) => {
      const original = await sharp({
        create: { width, height: 200, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer();
      const { processor, media } = fixture(original);
      const prepared = await processor.prepare(media, new AbortController().signal);
      try {
        expect(prepared.width).toBe(width);
        expect(prepared.variants.map((variant) => variant.width)).toEqual(expected);
        for (const variant of prepared.variants) {
          const metadata = await sharp(await readFile(variant.path)).metadata();
          expect(metadata.format).toBe('webp');
          expect(metadata.width).toBe(variant.width);
          expect(metadata.height).toBe(variant.height);
          expect(metadata.exif).toBeUndefined();
        }
      } finally {
        await prepared.cleanup();
      }
    },
  );

  it('rotates EXIF orientation and strips metadata without changing source bytes', async () => {
    const original = await sharp({
      create: { width: 40, height: 20, channels: 3, background: 'blue' },
    })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: { IFD0: { ImageDescription: 'private fixture metadata' } },
      })
      .toBuffer();
    const before = Buffer.from(original);
    const { processor, media } = fixture(original, 'image/jpeg');
    const prepared = await processor.prepare(media, new AbortController().signal);
    try {
      expect([prepared.width, prepared.height]).toEqual([20, 40]);
      expect((await sharp(await readFile(prepared.variants[0].path)).metadata()).exif).toBeUndefined();
      expect(original).toEqual(before);
    } finally {
      await prepared.cleanup();
    }
  });

  it('accepts the 10,000,000 byte boundary and rejects byte 10,000,001 while streaming', async () => {
    const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    const exact = Buffer.concat([image, Buffer.alloc(10_000_000 - image.length)]);
    const { processor, media } = fixture(exact);
    const prepared = await processor.prepare(media, new AbortController().signal);
    await prepared.cleanup();
    const oversized = fixture(Buffer.concat([exact, Buffer.from([0])]));
    await expect(
      oversized.processor.prepare(oversized.media, new AbortController().signal),
    ).rejects.toBeInstanceOf(TerminalPortfolioMediaError);
  });

  it('rejects corrupt content, mismatched MIME/size and excessive pixel count', async () => {
    const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    for (const test of [
      fixture(Buffer.from('not an image')),
      fixture(image, 'image/jpeg'),
      fixture(image, 'image/png', { maxPixels: 100 }),
    ])
      await expect(
        test.processor.prepare(test.media, new AbortController().signal),
      ).rejects.toBeInstanceOf(TerminalPortfolioMediaError);
    const test = fixture(image);
    await expect(
      test.processor.prepare({ ...test.media, sizeBytes: 1n }, new AbortController().signal),
    ).rejects.toBeInstanceOf(TerminalPortfolioMediaError);
  });
});
