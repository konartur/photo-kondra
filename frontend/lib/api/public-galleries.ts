import { ApiError } from './client';

export interface PublicGallery {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
}

export interface PublicPhoto {
  id: string;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  thumbnailUrl: string;
  previewUrl: string;
}

export interface PublicPhotoList {
  items: PublicPhoto[];
  nextCursor: string | null;
}

export interface PublicPhotoDownload {
  downloadUrl: string;
  expiresIn: number;
}

export const publicGalleryKeys = {
  gallery: (token: string) => ['public-gallery', token] as const,
  photos: (token: string) => [...publicGalleryKeys.gallery(token), 'photos'] as const,
};

export function getPublicGallery(token: string): Promise<PublicGallery> {
  return publicRequest<PublicGallery>(`/api/public/galleries/${encodeURIComponent(token)}`);
}

export function listPublicPhotos(token: string, cursor?: string): Promise<PublicPhotoList> {
  const query = new URLSearchParams({ limit: '48' });
  if (cursor) query.set('cursor', cursor);
  return publicRequest<PublicPhotoList>(
    `/api/public/galleries/${encodeURIComponent(token)}/photos?${query.toString()}`,
  );
}

export function requestPublicPhotoDownload(
  token: string,
  photoId: string,
): Promise<PublicPhotoDownload> {
  return publicRequest<PublicPhotoDownload>(
    `/api/public/photos/${encodeURIComponent(token)}/${encodeURIComponent(photoId)}/download`,
  );
}

export interface PublicArchive {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  expiresAt: string | null;
  downloadUrl?: string;
  expiresIn?: number;
}

export function getPreparedArchive(token: string): Promise<PublicArchive> {
  return publicRequest(`/api/public/galleries/${encodeURIComponent(token)}/archive`);
}

export function getPublicArchive(token: string, archiveId: string): Promise<PublicArchive> {
  return publicRequest(
    `/api/public/galleries/${encodeURIComponent(token)}/archives/${encodeURIComponent(archiveId)}`,
  );
}

async function publicRequest<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const response = await fetch(path, { method, cache: 'no-store' });
  if (!response.ok) throw new ApiError(await errorMessage(response), response.status);
  return (await response.json()) as T;
}

async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
  ) {
    return body.message;
  }

  return 'The gallery could not be loaded';
}
