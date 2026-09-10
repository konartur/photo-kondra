import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';
import { ALLOWED_PHOTO_MIME_TYPES, PHOTO_MIME_EXTENSIONS } from '../photo-upload.constants.js';

export class RequestPhotoUploadDto {
  @ApiProperty({ example: 'IMG_1234.JPG', maxLength: 255 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[^/\\]+$/u, { message: 'filename must not contain path separators' })
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ enum: ALLOWED_PHOTO_MIME_TYPES, example: 'image/jpeg' })
  @IsIn(ALLOWED_PHOTO_MIME_TYPES)
  mimeType!: keyof typeof PHOTO_MIME_EXTENSIONS;

  @ApiProperty({ example: 12457890, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size!: number;
}

export class RequestPhotoUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  photoId!: string;

  @ApiProperty({ example: 'https://bucket.s3.amazonaws.com/...' })
  uploadUrl!: string;

  @ApiProperty({ example: 900, description: 'URL lifetime in seconds' })
  expiresIn!: number;
}
