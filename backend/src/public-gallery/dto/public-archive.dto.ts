import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArchiveStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class RequestSelectedArchiveDto {
  @ApiProperty({
    type: [String],
    description: 'Unique READY photo UUIDs from this gallery (1–500)',
    maxItems: 500,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  photoIds!: string[];
}

export class ArchiveAccessQueryDto {
  @ApiProperty({ description: 'Private gallery access token' })
  @IsString()
  @Length(1, 256)
  token!: string;
}

export class PublicArchiveResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ArchiveStatus })
  status!: ArchiveStatus;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiresAt!: Date | null;
  @ApiPropertyOptional({ description: 'Short-lived signed URL, only for READY archives' })
  downloadUrl?: string;
  @ApiPropertyOptional({ description: 'Signed URL lifetime in seconds' })
  expiresIn?: number;
}
