import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicGalleryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Wedding 2026' })
  title!: string;

  @ApiPropertyOptional({ example: 'Photos from Olena and Andrii’s wedding', nullable: true })
  description!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class PublicPhotoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'IMG_0001.jpg' })
  filename!: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType!: string;

  @ApiPropertyOptional({ example: 4000, nullable: true })
  width!: number | null;

  @ApiPropertyOptional({ example: 3000, nullable: true })
  height!: number | null;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ format: 'uri' })
  thumbnailUrl!: string;

  @ApiProperty({ format: 'uri' })
  previewUrl!: string;
}

export class PublicPhotoListResponseDto {
  @ApiProperty({ type: () => [PublicPhotoResponseDto] })
  items!: PublicPhotoResponseDto[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  nextCursor!: string | null;
}

export class PublicPhotoDownloadResponseDto {
  @ApiProperty({ format: 'uri', description: 'Short-lived URL for downloading the original file' })
  downloadUrl!: string;

  @ApiProperty({ example: 900, description: 'URL lifetime in seconds' })
  expiresIn!: number;
}
