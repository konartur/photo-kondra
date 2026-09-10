import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PhotoStatus } from '@prisma/client';

export class PhotoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  galleryId!: string;

  @ApiProperty({ example: 'IMG_0001.jpg' })
  filename!: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType!: string;

  @ApiProperty({ example: '12457890', description: 'Byte count serialized as a string' })
  size!: string;

  @ApiPropertyOptional({ example: 4000 })
  width!: number | null;

  @ApiPropertyOptional({ example: 3000 })
  height!: number | null;

  @ApiProperty({ enum: PhotoStatus })
  status!: PhotoStatus;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class PhotoListResponseDto {
  @ApiProperty({ type: () => [PhotoResponseDto] })
  items!: PhotoResponseDto[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  nextCursor!: string | null;
}
