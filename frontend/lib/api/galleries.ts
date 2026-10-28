import { apiRequest } from './client';

export type GalleryStatus = 'DRAFT' | 'PROCESSING' | 'READY' | 'ARCHIVED';

export interface Gallery {
  id: string;
  title: string;
  description: string | null;
  status: GalleryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GalleryInput {
  title: string;
  description?: string | null;
}

export const galleryKeys = {
  all: ['galleries'] as const,
  detail: (galleryId: string) => [...galleryKeys.all, galleryId] as const,
};

export function listGalleries(): Promise<Gallery[]> {
  return apiRequest<Gallery[]>('/api/galleries');
}

export function getGallery(galleryId: string): Promise<Gallery> {
  return apiRequest<Gallery>(`/api/galleries/${galleryId}`);
}

export function createGallery(input: GalleryInput): Promise<Gallery> {
  return apiRequest<Gallery>('/api/galleries', jsonRequest('POST', input));
}

export function updateGallery(galleryId: string, input: GalleryInput): Promise<Gallery> {
  return apiRequest<Gallery>(`/api/galleries/${galleryId}`, jsonRequest('PATCH', input));
}

export function transitionGalleryStatus(
  galleryId: string,
  status: GalleryStatus,
): Promise<Gallery> {
  return apiRequest<Gallery>(
    `/api/galleries/${galleryId}/status`,
    jsonRequest('PATCH', { status }),
  );
}

export function deleteGallery(galleryId: string): Promise<void> {
  return apiRequest<void>(`/api/galleries/${galleryId}`, { method: 'DELETE' });
}

export function publishGallery(galleryId: string): Promise<Gallery> {
  return apiRequest(`/api/galleries/${encodeURIComponent(galleryId)}/publish`, { method: 'POST' });
}

export interface GalleryArchive {
  canPublish: boolean;
  pendingPhotoCount: number;
  id: string | null;
  status: 'NOT_PREPARED' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
}
export function getGalleryArchive(galleryId: string): Promise<GalleryArchive> {
  return apiRequest(`/api/galleries/${encodeURIComponent(galleryId)}/archive`);
}

export function createPrivateGalleryLink(galleryId: string): Promise<{ id: string; url: string }> {
  return apiRequest(`/api/galleries/${encodeURIComponent(galleryId)}/access-links`, {
    method: 'POST',
  });
}

function jsonRequest(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
