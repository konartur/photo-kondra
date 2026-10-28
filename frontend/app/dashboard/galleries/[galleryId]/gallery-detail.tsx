'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import {
  deleteGallery,
  galleryKeys,
  getGallery,
  GalleryStatus,
  transitionGalleryStatus,
  updateGallery,
} from '@/lib/api/galleries';
import type { Gallery } from '@/lib/api/galleries';
import { GalleryStatusBadge } from '../gallery-status';
import { PhotoUploader } from './photo-uploader';
import { GalleryPublication } from './gallery-publication';
import { GalleryShareLink } from './gallery-share-link';

const allowedTransitions: Record<GalleryStatus, GalleryStatus[]> = {
  DRAFT: ['ARCHIVED'],
  PROCESSING: ['DRAFT', 'ARCHIVED'],
  READY: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};

const transitionLabels: Record<GalleryStatus, string> = {
  DRAFT: 'Move to draft',
  PROCESSING: 'Start processing',
  READY: 'Mark ready',
  ARCHIVED: 'Archive gallery',
};

export function GalleryDetail({ galleryId }: { galleryId: string }) {
  const galleryQuery = useQuery({
    queryKey: galleryKeys.detail(galleryId),
    queryFn: () => getGallery(galleryId),
    refetchInterval: (query) => (query.state.data?.status === 'PROCESSING' ? 3000 : false),
  });

  if (galleryQuery.isPending)
    return <p className="mx-auto mt-10 max-w-5xl text-sm text-zinc-500">Loading gallery…</p>;
  if (galleryQuery.isError || !galleryQuery.data) {
    return (
      <section className="mx-auto mt-10 max-w-5xl rounded-xl bg-red-50 p-5 text-sm text-red-700">
        {galleryQuery.error?.message ?? 'Gallery not found'}
      </section>
    );
  }

  return <GalleryDetailContent gallery={galleryQuery.data} galleryId={galleryId} />;
}

function GalleryDetailContent({ gallery, galleryId }: { gallery: Gallery; galleryId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(gallery.title);
  const [description, setDescription] = useState(gallery.description ?? '');
  const [hasPendingUploads, setHasPendingUploads] = useState(false);
  const updateMutation = useMutation({
    mutationFn: () => updateGallery(galleryId, { title, description: description.trim() || null }),
    onSuccess: (gallery) => {
      void queryClient.invalidateQueries({ queryKey: galleryKeys.all });
      queryClient.setQueryData(galleryKeys.detail(galleryId), gallery);
    },
  });
  const statusMutation = useMutation({
    mutationFn: (status: GalleryStatus) => transitionGalleryStatus(galleryId, status),
    onSuccess: (gallery) => {
      void queryClient.invalidateQueries({ queryKey: galleryKeys.all });
      queryClient.setQueryData(galleryKeys.detail(galleryId), gallery);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteGallery(galleryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: galleryKeys.all });
      router.replace('/dashboard/galleries');
    },
  });

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    updateMutation.mutate();
  }

  function remove() {
    if (window.confirm('Delete this gallery and all of its photos? This cannot be undone.')) {
      deleteMutation.mutate();
    }
  }

  const transitions = allowedTransitions[gallery.status];

  return (
    <section className="mx-auto mt-10 max-w-3xl">
      <Link
        className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
        href="/dashboard/galleries"
      >
        ← All galleries
      </Link>
      <div className="mt-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-zinc-950">Gallery details</h2>
        <GalleryStatusBadge status={gallery.status} />
      </div>
      <form className="mt-6 rounded-xl border border-zinc-200 bg-white p-6" onSubmit={save}>
        <label className="block text-sm font-medium text-zinc-800" htmlFor="title">
          Title
        </label>
        <input
          className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
          id="title"
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
        />
        <label className="mt-5 block text-sm font-medium text-zinc-800" htmlFor="description">
          Description <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          className="mt-2 min-h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
          id="description"
          maxLength={1000}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
        {updateMutation.isError ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {updateMutation.error.message}
          </p>
        ) : null}
        <button
          className="mt-5 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={updateMutation.isPending || !title.trim()}
          type="submit"
        >
          {updateMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </form>
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
        <h3 className="font-semibold text-zinc-950">Lifecycle</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Status changes follow the gallery lifecycle enforced by the backend.
        </p>
        {transitions.length ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {transitions.map((status) => (
              <button
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed"
                disabled={statusMutation.isPending}
                key={status}
                onClick={() => statusMutation.mutate(status)}
                type="button"
              >
                {transitionLabels[status]}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            No further lifecycle transitions are available.
          </p>
        )}
        {statusMutation.isError ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {statusMutation.error.message}
          </p>
        ) : null}
      </section>
      <GalleryPublication
        galleryId={galleryId}
        status={gallery.status}
        hasPendingUploads={hasPendingUploads}
      />
      {gallery.status === 'READY' ? (
        <GalleryShareLink key={galleryId} galleryId={galleryId} />
      ) : null}
      {gallery.status === 'DRAFT' ? (
        <PhotoUploader galleryId={galleryId} onPendingUploadsChange={setHasPendingUploads} />
      ) : (
        <p className="mt-4 text-sm text-zinc-600">
          Return to draft before changing photos. Private links are unavailable while in draft.
        </p>
      )}
      <section className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6">
        <h3 className="font-semibold text-red-950">Delete gallery</h3>
        <p className="mt-2 text-sm leading-6 text-red-800">
          Deleting a gallery permanently deletes its related photos and private access links.
        </p>
        {deleteMutation.isError ? (
          <p className="mt-3 text-sm text-red-800" role="alert">
            {deleteMutation.error.message}
          </p>
        ) : null}
        <button
          className="mt-4 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-400"
          disabled={deleteMutation.isPending}
          onClick={remove}
          type="button"
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Delete gallery'}
        </button>
      </section>
    </section>
  );
}
