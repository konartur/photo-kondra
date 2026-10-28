import type { Photo } from '@prisma/client';
import { createHash } from 'node:crypto';

export function archiveContentHash(
  photos: Pick<Photo, 'id' | 'originalKey' | 'filename' | 'size' | 'sortOrder'>[],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        photos.map((photo) => [
          photo.id,
          photo.originalKey,
          photo.filename,
          photo.size.toString(),
          photo.sortOrder,
        ]),
      ),
    )
    .digest('hex');
}
