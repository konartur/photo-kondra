import { AppLogger } from '../common/logging/app-logger.js';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_SERVICE } from '../storage/storage.service.js';
import type { StorageService } from '../storage/storage.service.js';

@Injectable()
export class SelectedArchiveCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new AppLogger(SelectedArchiveCleanupService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.cleanup(), 60000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async cleanup(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.prisma.archive.findMany({
        where: {
          selectedPhotoIds: { isEmpty: false },
          expiresAt: { lte: new Date() },
          OR: [{ processingLockExpiresAt: null }, { processingLockExpiresAt: { lte: new Date() } }],
        },
        take: 50,
        orderBy: { expiresAt: 'asc' },
      });
      for (const archive of expired) {
        // Idempotent object deletion permits overlapping application instances and retries.
        if (archive.storageKey) await this.storage.delete(archive.storageKey);
        await this.prisma.archive.deleteMany({
          where: {
            id: archive.id,
            expiresAt: { lte: new Date() },
            OR: [
              { processingLockExpiresAt: null },
              { processingLockExpiresAt: { lte: new Date() } },
            ],
          },
        });
      }
    } catch {
      this.logger.warn({ event: 'selected_archive_cleanup_failed' });
    } finally {
      this.running = false;
    }
  }
}
