import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GalleryAccess, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { GalleriesService } from '../galleries/galleries.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateGalleryAccessDto } from './dto/create-gallery-access.dto.js';
import {
  CreatedGalleryAccessResponseDto,
  GalleryAccessResponseDto,
} from './dto/gallery-access-response.dto.js';

@Injectable()
export class GalleryAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly galleriesService: GalleriesService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    ownerId: string,
    galleryId: string,
    dto: CreateGalleryAccessDto,
  ): Promise<CreatedGalleryAccessResponseDto> {
    const gallery = await this.galleriesService.findOne(ownerId, galleryId);
    if (gallery.status !== 'READY')
      throw new ConflictException('Publish gallery and wait for ZIP preparation before sharing');
    if ((await this.galleriesService.archiveStatus(ownerId, galleryId)).status !== 'READY')
      throw new ConflictException('Publish gallery and wait for ZIP preparation before sharing');
    const expiresAt = this.parseExpiration(dto.expiresAt);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = randomBytes(32).toString('base64url');
      try {
        const access = await this.prisma.galleryAccess.create({
          data: { galleryId, tokenHash: hashToken(token), expiresAt },
        });

        return { ...toResponse(access), url: `${this.appUrl}/g/${token}` };
      } catch (error) {
        if (!isTokenHashConflict(error) || attempt === 2) throw error;
      }
    }

    throw new Error('Unable to create a unique gallery access token');
  }

  async findAll(ownerId: string, galleryId: string): Promise<GalleryAccessResponseDto[]> {
    await this.galleriesService.findOne(ownerId, galleryId);

    const accessLinks = await this.prisma.galleryAccess.findMany({
      where: { galleryId },
      orderBy: { createdAt: 'desc' },
    });

    return accessLinks.map(toResponse);
  }

  async revoke(ownerId: string, accessLinkId: string): Promise<void> {
    const accessLink = await this.prisma.galleryAccess.findFirst({
      where: { id: accessLinkId, gallery: { ownerId } },
    });

    if (!accessLink) throw new NotFoundException('Gallery access link not found');

    await this.prisma.galleryAccess.update({
      where: { id: accessLinkId },
      data: { isActive: false },
    });
  }

  async findActiveByToken(token: string): Promise<GalleryAccess | null> {
    const now = new Date();

    return this.prisma.galleryAccess.findFirst({
      where: {
        tokenHash: hashToken(token),
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
  }

  private parseExpiration(value: string | undefined): Date | null {
    if (!value) return null;

    const expiresAt = new Date(value);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw new BadRequestException('Access link expiration must be in the future');
    }

    return expiresAt;
  }

  private get appUrl(): string {
    return this.configService.getOrThrow<string>('APP_URL').replace(/\/$/u, '');
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toResponse(access: GalleryAccess): GalleryAccessResponseDto {
  return {
    id: access.id,
    galleryId: access.galleryId,
    expiresAt: access.expiresAt,
    isActive: access.isActive,
    createdAt: access.createdAt,
  };
}

function isTokenHashConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    error.meta?.target === 'GalleryAccess_tokenHash_key'
  );
}
