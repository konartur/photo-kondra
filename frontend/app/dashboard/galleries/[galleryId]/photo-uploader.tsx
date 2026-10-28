'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import {
  completePhotoUpload,
  listPhotos,
  photoKeys,
  PhotoStatus,
  requestPhotoUpload,
  UploadUrlResponse,
} from '@/lib/api/photos';

const acceptedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uploadConcurrency = 3;

type LocalUploadStatus = 'REQUESTING_URL' | 'UPLOADING' | 'PROCESSING' | 'FAILED';

interface UploadItem {
  id: string;
  file: File;
  status: LocalUploadStatus;
  progress: number;
  error?: string;
  photoId?: string;
  uploadUrl?: string;
  uploaded?: boolean;
}

export function PhotoUploader({ galleryId }: { galleryId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const photosQuery = useQuery({
    queryKey: photoKeys.gallery(galleryId),
    queryFn: () => listPhotos(galleryId),
    refetchInterval: 5_000,
  });
  const serverPhotoStatus = useMemo(
    () => new Map(photosQuery.data?.items.map((photo) => [photo.id, photo.status])),
    [photosQuery.data],
  );

  function updateUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((current) => current.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload)));
  }

  async function processUpload(upload: UploadItem) {
    let session: UploadUrlResponse | undefined;
    try {
      if (upload.photoId && upload.uploadUrl) {
        session = { photoId: upload.photoId, uploadUrl: upload.uploadUrl, expiresIn: 0 };
      } else {
        updateUpload(upload.id, { status: 'REQUESTING_URL', error: undefined, progress: 0 });
        session = await requestPhotoUpload(galleryId, {
          filename: upload.file.name,
          mimeType: upload.file.type as 'image/jpeg' | 'image/png' | 'image/webp',
          size: upload.file.size,
        });
        updateUpload(upload.id, { photoId: session.photoId, uploadUrl: session.uploadUrl });
      }

      if (!upload.uploaded) {
        updateUpload(upload.id, { status: 'UPLOADING', error: undefined, progress: 0 });
        await uploadDirectly(session.uploadUrl, upload.file, (progress) => {
          updateUpload(upload.id, { progress });
        });
        updateUpload(upload.id, { uploaded: true, progress: 100 });
      }

      updateUpload(upload.id, { status: 'PROCESSING', error: undefined });
      await completePhotoUpload(session.photoId);
      await queryClient.invalidateQueries({ queryKey: photoKeys.gallery(galleryId) });
    } catch (error) {
      updateUpload(upload.id, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Upload failed',
      });
    }
  }

  function addFiles(files: File[]) {
    const existingFiles = new Set(uploads.map(fileKey));
    const newUploads = files
      .filter((file) => {
        const key = fileKey({ file });
        if (existingFiles.has(key)) return false;
        existingFiles.add(key);
        return true;
      })
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: acceptedMimeTypes.has(file.type) ? 'REQUESTING_URL' : 'FAILED',
        progress: 0,
        ...(acceptedMimeTypes.has(file.type) ? {} : { error: 'Only JPEG, PNG, and WebP images are supported' }),
      })) satisfies UploadItem[];

    if (!newUploads.length) return;
    setUploads((current) => [...current, ...newUploads]);
    void runWithConcurrency(
      newUploads.filter((upload) => upload.status !== 'FAILED'),
      uploadConcurrency,
      processUpload,
    );
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function retry(upload: UploadItem) {
    updateUpload(upload.id, { status: upload.uploaded ? 'PROCESSING' : 'UPLOADING', error: undefined });
    void processUpload(upload);
  }

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-zinc-950">Upload photos</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Files are uploaded directly to private object storage, then processed asynchronously.
          </p>
        </div>
      </div>
      <input
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        multiple
        onChange={onFileChange}
        ref={inputRef}
        type="file"
      />
      <button
        className={`mt-5 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
          isDragging ? 'border-zinc-950 bg-zinc-100' : 'border-zinc-300 hover:border-zinc-500 hover:bg-zinc-50'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        type="button"
      >
        <span className="text-sm font-medium text-zinc-900">Drop photos here or choose files</span>
        <span className="mt-1 text-sm text-zinc-500">JPEG, PNG, or WebP. Multiple files are supported.</span>
      </button>
      {uploads.length ? (
        <ul className="mt-5 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {uploads.map((upload) => {
            const status = upload.photoId ? (serverPhotoStatus.get(upload.photoId) ?? upload.status) : upload.status;
            const processingFailed = status === 'FAILED' && upload.uploaded && serverPhotoStatus.get(upload.photoId ?? '') === 'FAILED';
            const canRetry = status === 'FAILED' && acceptedMimeTypes.has(upload.file.type) && !processingFailed;
            return (
              <li className="p-4" key={upload.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{upload.file.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{formatBytes(upload.file.size)}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-zinc-600">{statusLabel(status)}</span>
                </div>
                {status === 'UPLOADING' ? (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full bg-zinc-900 transition-all" style={{ width: `${upload.progress}%` }} />
                  </div>
                ) : null}
                {status === 'FAILED' ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-red-700">
                      {processingFailed
                        ? 'Image processing failed. Processing retry is not available yet.'
                        : (upload.error ?? 'Upload failed')}
                    </p>
                    {canRetry ? (
                      <button
                        className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                        onClick={() => retry(upload)}
                        type="button"
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {photosQuery.isError ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          Photo processing status could not be refreshed: {photosQuery.error.message}
        </p>
      ) : null}
    </section>
  );
}

function fileKey({ file }: Pick<UploadItem, 'file'>): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function uploadDirectly(url: string, file: File, onProgress: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Storage upload failed (${request.status})`));
    });
    request.addEventListener('error', () => reject(new Error('Storage upload failed due to a network error')));
    request.addEventListener('abort', () => reject(new Error('Storage upload was cancelled')));
    request.send(file);
  });
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const pending = [...items];
  const workers = Array.from({ length: Math.min(limit, pending.length) }, async () => {
    while (pending.length) {
      const item = pending.shift();
      if (item) await worker(item);
    }
  });
  await Promise.all(workers);
}

function statusLabel(status: LocalUploadStatus | PhotoStatus): string {
  return {
    REQUESTING_URL: 'Preparing upload',
    UPLOADING: 'Uploading',
    PROCESSING: 'Processing',
    READY: 'Ready',
    FAILED: 'Failed',
    DELETED: 'Deleted',
  }[status];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
