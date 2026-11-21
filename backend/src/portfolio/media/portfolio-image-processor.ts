import { Inject, Injectable } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { webpTransform } from '../../image-processing/webp-transform.js';
import { STORAGE_SERVICE, StorageObjectNotFoundError } from '../../storage/storage.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import { PORTFOLIO_MAX_UPLOAD_BYTES, PORTFOLIO_WEBP_WIDTHS } from '../dto/shared.dto.js';
import {
  PORTFOLIO_MEDIA_CONFIG,
  TerminalPortfolioMediaError,
  assertPortfolioKey,
} from './portfolio-media.config.js';
import type { PortfolioMediaConfig } from './portfolio-media.config.js';

export interface PreparedPortfolioImage {
  width: number;
  height: number;
  variants: { width: number; height: number; path: string }[];
  cleanup(): Promise<void>;
}

export function imageMime(header: Buffer): string | null {
  if (header.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

/** Originals are spooled to a bounded temporary file, never a full in-memory buffer. */
@Injectable()
export class PortfolioImageProcessor {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(PORTFOLIO_MEDIA_CONFIG) private readonly config: PortfolioMediaConfig,
  ) {}

  async prepare(
    media: { id: string; originalKey: string | null; mimeType: string; sizeBytes: bigint },
    signal: AbortSignal,
  ): Promise<PreparedPortfolioImage> {
    if (!media.originalKey) throw new TerminalPortfolioMediaError('Original is missing');
    assertPortfolioKey(media.id, media.originalKey);
    const directory = await mkdtemp(join(tmpdir(), 'photokondra-portfolio-'));
    const cleanup = () => rm(directory, { recursive: true, force: true });
    try {
      const originalPath = join(directory, 'source');
      let size = 0;
      let header = Buffer.alloc(0);
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          if (header.length < 12)
            header = Buffer.concat([header, chunk.subarray(0, 12 - header.length)]);
          callback(
            size > PORTFOLIO_MAX_UPLOAD_BYTES
              ? new TerminalPortfolioMediaError('Original exceeds 10 MB')
              : null,
            chunk,
          );
        },
      });
      try {
        const original = await this.storage.download(media.originalKey, signal);
        await pipeline(original, limit, createWriteStream(originalPath, { flags: 'wx' }), {
          signal,
        });
      } catch (error) {
        if (error instanceof StorageObjectNotFoundError)
          throw new TerminalPortfolioMediaError('Original is missing');
        throw error;
      }
      if (!size || BigInt(size) !== media.sizeBytes || imageMime(header) !== media.mimeType)
        throw new TerminalPortfolioMediaError('Original metadata does not match upload');
      signal.throwIfAborted();
      try {
        const image = sharp(originalPath, {
          limitInputPixels: this.config.maxPixels,
          failOn: 'warning',
          animated: false,
        }).rotate();
        const metadata = await image.metadata();
        const formats: Record<string, string> = {
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
        };
        if (
          !metadata.width ||
          !metadata.height ||
          metadata.width * metadata.height > this.config.maxPixels ||
          !metadata.format ||
          formats[metadata.format] !== media.mimeType ||
          (metadata.pages ?? 1) !== 1
        )
          throw new TerminalPortfolioMediaError('Unsupported image');
        const { width, height } = metadata.autoOrient;
        const widths = [...new Set(PORTFOLIO_WEBP_WIDTHS.map((target) => Math.min(target, width)))];
        const variants: PreparedPortfolioImage['variants'] = [];
        for (const target of widths) {
          signal.throwIfAborted();
          const path = join(directory, `${target}.webp`);
          // Default Sharp output strips EXIF and other source metadata.
          const info = await webpTransform(image, target, this.config.quality)
            .timeout({ seconds: this.config.processingTimeoutSeconds })
            .toFile(path);
          variants.push({ width: info.width, height: info.height, path });
        }
        signal.throwIfAborted();
        return { width, height, variants, cleanup };
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof TerminalPortfolioMediaError) throw error;
        throw new TerminalPortfolioMediaError('Original cannot be decoded or encoded');
      }
    } catch (error) {
      await cleanup();
      throw error;
    }
  }
}
