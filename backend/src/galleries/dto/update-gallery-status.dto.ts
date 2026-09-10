import { ApiProperty } from '@nestjs/swagger';
import { GalleryStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateGalleryStatusDto {
  @ApiProperty({ enum: GalleryStatus, example: GalleryStatus.PROCESSING })
  @IsEnum(GalleryStatus)
  status!: GalleryStatus;
}
