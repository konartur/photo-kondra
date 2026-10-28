import {
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Archive } from '@prisma/client';
import { ArchivesService } from '../archives/archives.service.js';
import { GalleryAccessService } from '../gallery-access/gallery-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_SERVICE } from '../storage/storage.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { PublicArchiveResponseDto } from './dto/public-archive.dto.js';

@Injectable()
export class PublicArchivesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GalleryAccessService,
    private readonly archives: ArchivesService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async request(token: string): Promise<PublicArchiveResponseDto> {
    const galleryId = await this.authorize(token);
    const archive = await this.archives.current(galleryId);
    if (!archive || archive.status !== 'READY')
      throw new ConflictException('ZIP is not prepared; contact the photographer');
    return this.toResponse(archive);
  }

  async status(token: string, archiveId: string): Promise<PublicArchiveResponseDto> {
    const galleryId = await this.authorize(token);
    const archive = await this.prisma.archive.findFirst({ where: { id: archiveId, galleryId } });
    if (!archive) throw new NotFoundException('Archive not found');
    if (
      archive.status === 'READY' &&
      (!archive.expiresAt || archive.expiresAt.getTime() > Date.now())
    ) {
      const current = await this.archives.current(galleryId);
      if (current?.id !== archive.id) throw new NotFoundException('Archive is no longer current');
    }
    return this.toResponse(archive);
  }

  private async authorize(token: string): Promise<string> {
    const link = await this.access.findActiveByToken(token);
    if (!link) throw new NotFoundException('Gallery not found');
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: link.galleryId },
      select: { status: true },
    });
    if (gallery?.status !== 'READY') throw new NotFoundException('Gallery not found');
    return link.galleryId;
  }

  private async toResponse(archive: Archive): Promise<PublicArchiveResponseDto> {
    const response: PublicArchiveResponseDto = {
      id: archive.id,
      status: archive.status,
      expiresAt: archive.expiresAt,
    };
    if (archive.status !== 'READY') return response;
    if (archive.expiresAt && archive.expiresAt.getTime() <= Date.now())
      throw new GoneException('Archive expired; request a new archive');
    if (!archive.storageKey)
      throw new ServiceUnavailableException('Archive is temporarily unavailable');
    const ttl = Number(this.config.getOrThrow<string>('SIGNED_URL_ARCHIVE_TTL'));
    if (!Number.isSafeInteger(ttl) || ttl <= 0)
      throw new ServiceUnavailableException('Archive download configuration is invalid');
    const expiresIn = archive.expiresAt
      ? Math.min(ttl, Math.floor((archive.expiresAt.getTime() - Date.now()) / 1000))
      : ttl;
    if (expiresIn <= 0) throw new GoneException('Archive expired; request a new archive');
    const downloadUrl = await this.storage.createDownloadUrl({
      key: archive.storageKey,
      expiresIn,
      filename: `gallery-${archive.galleryId}.zip`,
    });
    return { ...response, downloadUrl, expiresIn };
  }
}
