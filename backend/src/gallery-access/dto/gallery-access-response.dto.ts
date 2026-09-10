import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GalleryAccessResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  galleryId!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiresAt!: Date | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class CreatedGalleryAccessResponseDto extends GalleryAccessResponseDto {
  @ApiProperty({ example: 'https://photos.example.com/g/secure-token' })
  url!: string;
}
