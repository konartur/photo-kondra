import { Inject, Injectable } from '@nestjs/common';
import { PortfolioPersistenceService } from '../persistence/portfolio-persistence.service.js';
import { STORAGE_SERVICE } from '../../storage/storage.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import { assertPortfolioKey } from './portfolio-media.config.js';

@Injectable()
export class PortfolioMediaCleanupService {
  constructor(
    private readonly persistence: PortfolioPersistenceService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}
  async clean(mediaId: string, signal = AbortSignal.timeout(10_000)): Promise<void> {
    // Capture status and variant journal under the same fence as retries/deletion;
    // separate unfenced relation queries could otherwise observe a newer attempt.
    const media = await this.persistence.withContentLock((tx) =>
      tx.portfolioMedia.findFirst({
        where: { id: mediaId, status: { in: ['DELETED', 'FAILED'] } },
        include: { variants: true },
      }),
    );
    if (!media) return;
    const keys = media.variants.map((variant) => variant.key);
    if (media.status === 'DELETED' && media.originalKey) keys.push(media.originalKey);
    for (const key of keys) {
      signal.throwIfAborted();
      assertPortfolioKey(mediaId, key);
      await this.storage.delete(key, signal);
    }
    // Keep tombstones and planned keys: an in-flight presigned PUT/worker can
    // finish after deletion. Subsequent maintenance passes delete late objects.
  }
}
