import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Gallery, GalleryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateGalleryDto } from './dto/create-gallery.dto.js';
import { UpdateGalleryDto } from './dto/update-gallery.dto.js';

const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<GalleryStatus, readonly GalleryStatus[]>> = {
  [GalleryStatus.DRAFT]: [GalleryStatus.PROCESSING, GalleryStatus.ARCHIVED],
  [GalleryStatus.PROCESSING]: [GalleryStatus.READY, GalleryStatus.ARCHIVED],
  [GalleryStatus.READY]: [GalleryStatus.ARCHIVED],
  [GalleryStatus.ARCHIVED]: [],
};

@Injectable()
export class GalleriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, dto: CreateGalleryDto): Promise<Gallery> {
    return this.prisma.gallery.create({
      data: { ownerId, title: dto.title, description: dto.description ?? null },
    });
  }

  findAll(ownerId: string): Promise<Gallery[]> {
    return this.prisma.gallery.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(ownerId: string, galleryId: string): Promise<Gallery> {
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, ownerId },
    });

    if (!gallery) throw new NotFoundException('Gallery not found');

    return gallery;
  }

  async update(ownerId: string, galleryId: string, dto: UpdateGalleryDto): Promise<Gallery> {
    await this.findOne(ownerId, galleryId);

    return this.prisma.gallery.update({
      where: { id: galleryId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  async transitionStatus(
    ownerId: string,
    galleryId: string,
    nextStatus: GalleryStatus,
  ): Promise<Gallery> {
    const gallery = await this.findOne(ownerId, galleryId);

    if (!ALLOWED_STATUS_TRANSITIONS[gallery.status].includes(nextStatus)) {
      throw new ConflictException(
        `Cannot transition gallery from ${gallery.status} to ${nextStatus}`,
      );
    }

    return this.prisma.gallery.update({
      where: { id: galleryId },
      data: { status: nextStatus },
    });
  }

  async remove(ownerId: string, galleryId: string): Promise<void> {
    await this.findOne(ownerId, galleryId);
    await this.prisma.gallery.delete({ where: { id: galleryId } });
  }
}
