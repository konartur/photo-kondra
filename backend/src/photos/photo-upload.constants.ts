export const PHOTO_MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export const ALLOWED_PHOTO_MIME_TYPES = Object.keys(PHOTO_MIME_EXTENSIONS);
