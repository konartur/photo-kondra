'use client';

/* Preview URLs are signed and dynamically hosted, so native images are intentional. */
/* eslint-disable @next/next/no-img-element */

import { KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { requestPublicPhotoDownload } from '@/lib/api/public-galleries';
import type { PublicPhoto } from '@/lib/api/public-galleries';

export function PhotoLightbox({
  photos,
  initialPhotoId,
  token,
  onClose,
}: {
  photos: PublicPhoto[];
  initialPhotoId: string;
  token: string;
  onClose: () => void;
}) {
  const [currentPhotoId, setCurrentPhotoId] = useState(initialPhotoId);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentIndex = Math.max(
    0,
    photos.findIndex((photo) => photo.id === currentPhotoId),
  );
  const currentPhoto = photos[currentIndex];
  const previousPhoto = photos[currentIndex - 1];
  const nextPhoto = photos[currentIndex + 1];

  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousStyles = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflowY: body.style.overflowY,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflowY = 'scroll';
    dialogRef.current?.focus();

    return () => {
      body.style.position = previousStyles.position;
      body.style.top = previousStyles.top;
      body.style.width = previousStyles.width;
      body.style.overflowY = previousStyles.overflowY;
      window.scrollTo({ top: scrollY, behavior: 'instant' });
      if (activeElement?.isConnected) activeElement.focus();
    };
  }, []);

  useEffect(() => {
    [previousPhoto, nextPhoto].filter(Boolean).forEach((photo) => {
      const preload = new Image();
      preload.src = photo.previewUrl;
    });
  }, [nextPhoto, previousPhoto]);

  const positionLabel = useMemo(
    () => `Photo ${currentIndex + 1} of ${photos.length}`,
    [currentIndex, photos.length],
  );

  function goToPrevious() {
    if (previousPhoto) setCurrentPhotoId(previousPhoto.id);
  }

  function goToNext() {
    if (nextPhoto) setCurrentPhotoId(nextPhoto.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToPrevious();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToNext();
      return;
    }
    if (event.key === 'Tab') trapFocus(event, dialogRef.current);
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  async function downloadOriginal() {
    if (!currentPhoto) return;

    setDownloadError(null);
    setIsDownloading(true);
    try {
      const { downloadUrl } = await requestPublicPhotoDownload(token, currentPhoto.id);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = currentPhoto.filename;
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Download could not be prepared');
    } finally {
      setIsDownloading(false);
    }
  }

  if (!currentPhoto) return null;

  return (
    <div
      aria-describedby="photo-lightbox-position"
      aria-labelledby="photo-lightbox-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex bg-black/95 p-3 text-white sm:p-6"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        <img
          alt={currentPhoto.filename}
          className="max-h-full max-w-full select-none object-contain"
          decoding="async"
          fetchPriority="high"
          src={currentPhoto.previewUrl}
        />
        <h2 className="sr-only" id="photo-lightbox-title">
          {currentPhoto.filename}
        </h2>
        <p className="sr-only" id="photo-lightbox-position">
          {positionLabel}
        </p>
        <div aria-live="polite" className="absolute left-3 top-3 rounded bg-black/60 px-3 py-1.5 text-xs sm:left-5 sm:top-5">
          {positionLabel}
        </div>
        <button
          aria-label="Close photo viewer"
          className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-black/60 text-2xl transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white sm:right-5 sm:top-5"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <button
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2 text-sm font-medium transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white sm:bottom-5"
          disabled={isDownloading}
          onClick={() => void downloadOriginal()}
          type="button"
        >
          {isDownloading ? 'Preparing download…' : 'Download original'}
        </button>
        {downloadError ? (
          <p aria-live="polite" className="absolute bottom-14 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded bg-red-950/90 px-3 py-2 text-center text-xs text-red-100 sm:bottom-16">
            {downloadError}
          </p>
        ) : null}
        <button
          aria-label="Previous photo"
          className="absolute left-2 rounded-full bg-black/60 px-3 py-2 text-2xl transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-white sm:left-5"
          disabled={!previousPhoto}
          onClick={goToPrevious}
          type="button"
        >
          ←
        </button>
        <button
          aria-label="Next photo"
          className="absolute right-2 rounded-full bg-black/60 px-3 py-2 text-2xl transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-white sm:right-5"
          disabled={!nextPhoto}
          onClick={goToNext}
          type="button"
        >
          →
        </button>
      </div>
    </div>
  );
}

function trapFocus(event: KeyboardEvent<HTMLDivElement>, dialog: HTMLDivElement | null): void {
  if (!dialog) return;

  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ).filter((element) => !element.hasAttribute('disabled'));
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
