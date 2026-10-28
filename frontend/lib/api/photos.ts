import { apiRequest } from './client';

export type PhotoStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';

export interface Photo {
  id: string;
  galleryId: string;
  filename: string;
  mimeType: string;
  size: string;
  width: number | null;
  height: number | null;
  status: PhotoStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoListResponse {
  items: Photo[];
  nextCursor: string | null;
}

export interface UploadUrlResponse {
  photoId: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface UploadRequest {
  filename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
}

export const photoKeys = {
  gallery: (galleryId: string) => ['galleries', galleryId, 'photos'] as const,
};

export function listPhotos(galleryId: string): Promise<PhotoListResponse> {
  return apiRequest<PhotoListResponse>(`/api/galleries/${galleryId}/photos?limit=100`);
}

export function requestPhotoUpload(galleryId: string, request: UploadRequest): Promise<UploadUrlResponse> {
  return apiRequest<UploadUrlResponse>(`/api/galleries/${galleryId}/photos/upload-url`, jsonPost(request));
}

export function completePhotoUpload(photoId: string): Promise<Photo> {
  return apiRequest<Photo>(`/api/photos/${photoId}/upload-complete`, { method: 'POST' });
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
