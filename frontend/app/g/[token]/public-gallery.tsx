'use client';

/* Signed object-storage URLs have dynamic hosts, so native lazy-loaded images are intentional here. */
/* eslint-disable @next/next/no-img-element */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  getPublicGallery,
  listPublicPhotos,
  publicGalleryKeys,
  PublicPhoto,
} from '@/lib/api/public-galleries';
import { PhotoLightbox } from './photo-lightbox';

export function PublicGalleryPage({ token }: { token: string }) {
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const galleryQuery = useQuery({
    queryKey: publicGalleryKeys.gallery(token),
    queryFn: () => getPublicGallery(token),
    retry: false,
  });
  const photosQuery = useInfiniteQuery({
    queryKey: publicGalleryKeys.photos(token),
    queryFn: ({ pageParam }) => listPublicPhotos(token, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: galleryQuery.isSuccess,
    retry: false,
  });

  if (galleryQuery.isPending) return <LoadingState />;
  if (galleryQuery.isError || !galleryQuery.data) {
    return <PrivateLinkFailure error={galleryQuery.error} onRetry={() => void galleryQuery.refetch()} />;
  }

  const photos = photosQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 text-zinc-950 sm:px-8 sm:py-12">
      <section className="mx-auto max-w-7xl">
        <header className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Private gallery</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">{galleryQuery.data.title}</h1>
          {galleryQuery.data.description ? (
            <p className="mt-4 text-base leading-7 text-zinc-600 sm:text-lg">{galleryQuery.data.description}</p>
          ) : null}
        </header>
        <section aria-label="Photos" className="mt-8 sm:mt-12">
          {photosQuery.isPending ? <LoadingGrid /> : null}
          {photosQuery.isError && photos.length === 0 ? (
            <InlineError message={photosQuery.error.message} onRetry={() => void photosQuery.refetch()} />
          ) : null}
          {photos.length === 0 && photosQuery.isSuccess ? (
            <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-600">
              There are no ready photos in this gallery yet.
            </p>
          ) : null}
          {photos.length ? <PhotoGrid onSelect={setSelectedPhotoId} photos={photos} /> : null}
          {photosQuery.isError && photos.length ? (
            <InlineError message="More photos could not be loaded." onRetry={() => void photosQuery.refetch()} />
          ) : null}
          <LoadMoreTrigger
            hasNextPage={photosQuery.hasNextPage}
            isFetching={photosQuery.isFetchingNextPage}
            onLoadMore={photosQuery.fetchNextPage}
          />
        </section>
      </section>
      {selectedPhotoId ? (
        <PhotoLightbox
          initialPhotoId={selectedPhotoId}
          key={selectedPhotoId}
          onClose={() => setSelectedPhotoId(null)}
          photos={photos}
          token={token}
        />
      ) : null}
    </main>
  );
}

function PhotoGrid({ photos, onSelect }: { photos: PublicPhoto[]; onSelect: (photoId: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
      {photos.map((photo) => (
        <figure className="overflow-hidden rounded-lg bg-zinc-200" key={photo.id}>
          <button
            aria-label={`Open ${photo.filename}`}
            className="block w-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2"
            onClick={() => onSelect(photo.id)}
            type="button"
          >
            <img
              alt={photo.filename}
              className="aspect-[4/3] h-full w-full object-cover"
              decoding="async"
              loading="lazy"
              src={photo.thumbnailUrl}
            />
          </button>
        </figure>
      ))}
    </div>
  );
}

function LoadMoreTrigger({
  hasNextPage,
  isFetching,
  onLoadMore,
}: {
  hasNextPage: boolean;
  isFetching: boolean;
  onLoadMore: () => Promise<unknown>;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetching) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void onLoadMore();
      },
      { rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, onLoadMore]);

  if (!hasNextPage && !isFetching) return null;

  return (
    <div className="mt-8 flex flex-col items-center gap-3" ref={sentinelRef}>
      {isFetching ? <p className="text-sm text-zinc-500">Loading more photos…</p> : null}
      {hasNextPage ? (
        <button
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          onClick={() => void onLoadMore()}
          type="button"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}

function PrivateLinkFailure({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const isUnavailable = error instanceof ApiError && error.status === 503;
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-zinc-950">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Photo Cloud</p>
        <h1 className="mt-4 text-2xl font-semibold">{isUnavailable ? 'Gallery temporarily unavailable' : 'Gallery unavailable'}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          {isUnavailable
            ? 'Please try again in a moment.'
            : 'This private link is invalid, expired, or has been revoked.'}
        </p>
        {isUnavailable ? (
          <button
            className="mt-6 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            onClick={onRetry}
            type="button"
          >
            Try again
          </button>
        ) : null}
      </section>
    </main>
  );
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-zinc-100 p-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-4 w-28 rounded bg-zinc-200" />
        <div className="mt-4 h-12 max-w-md rounded bg-zinc-200" />
        <LoadingGrid />
      </div>
    </main>
  );
}

function LoadingGrid() {
  return (
    <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }, (_, index) => (
        <div className="aspect-[4/3] animate-pulse rounded-lg bg-zinc-200" key={index} />
      ))}
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl bg-red-50 p-5 text-sm text-red-700" role="alert">
      <p>{message}</p>
      <button className="mt-3 font-medium underline" onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  );
}
