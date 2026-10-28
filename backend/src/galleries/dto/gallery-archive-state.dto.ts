import { ApiProperty } from '@nestjs/swagger';
export class GalleryArchiveStateDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  id!: string | null;
  @ApiProperty({ enum: ['NOT_PREPARED', 'PENDING', 'PROCESSING', 'READY', 'FAILED'] })
  status!: string;
  @ApiProperty({ description: 'Number of unfinished/failed photos that block publication' })
  pendingPhotoCount!: number;
  @ApiProperty({ description: 'All photos ready and at least one original exists' })
  canPublish!: boolean;
}
