export const IMAGE_PROCESSING_QUEUE_NAME = 'image-processing';
export const ARCHIVE_GENERATION_QUEUE_NAME = 'archive-generation';
export const PROCESS_PHOTO_JOB_NAME = 'process-photo';

export const IMAGE_PROCESSING_QUEUE = Symbol('IMAGE_PROCESSING_QUEUE');
export const ARCHIVE_GENERATION_QUEUE = Symbol('ARCHIVE_GENERATION_QUEUE');

export interface ProcessPhotoJobData {
  photoId: string;
}
