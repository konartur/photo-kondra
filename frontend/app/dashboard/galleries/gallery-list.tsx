'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createGallery, galleryKeys, listGalleries } from '@/lib/api/galleries';
import { GalleryStatusBadge } from './gallery-status';

export function GalleryList() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const galleriesQuery = useQuery({ queryKey: galleryKeys.all, queryFn: listGalleries });
  const createMutation = useMutation({
    mutationFn: createGallery,
    onSuccess: () => {
      setTitle('');
      setDescription('');
      void queryClient.invalidateQueries({ queryKey: galleryKeys.all });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate({ title, ...(description.trim() && { description }) });
  }

  return (
    <section className="mx-auto mt-10 max-w-5xl">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-950">Galleries</h2>
              <p className="mt-1 text-sm text-zinc-600">Create, edit, and manage gallery lifecycle.</p>
            </div>
          </div>
          {galleriesQuery.isPending ? <p className="mt-8 text-sm text-zinc-500">Loading galleries…</p> : null}
          {galleriesQuery.isError ? (
            <p className="mt-8 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {galleriesQuery.error.message}
            </p>
          ) : null}
          {galleriesQuery.data?.length === 0 ? (
            <p className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
              No galleries yet. Create your first one to get started.
            </p>
          ) : null}
          <ul className="mt-6 space-y-3">
            {galleriesQuery.data?.map((gallery) => (
              <li key={gallery.id}>
                <Link
                  className="block rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400"
                  href={`/dashboard/galleries/${gallery.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-zinc-950">{gallery.title}</h3>
                      <p className="mt-1 text-sm text-zinc-600">
                        {gallery.description || 'No description'}
                      </p>
                    </div>
                    <GalleryStatusBadge status={gallery.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <form className="h-fit rounded-xl border border-zinc-200 bg-white p-5" onSubmit={onSubmit}>
          <h2 className="font-semibold text-zinc-950">New gallery</h2>
          <label className="mt-4 block text-sm font-medium text-zinc-800" htmlFor="title">
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
          <label className="mt-4 block text-sm font-medium text-zinc-800" htmlFor="description">
            Description <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <textarea
            className="mt-2 min-h-24 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
            id="description"
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
          {createMutation.isError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {createMutation.error.message}
            </p>
          ) : null}
          <button
            className="mt-5 w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            disabled={createMutation.isPending || !title.trim()}
            type="submit"
          >
            {createMutation.isPending ? 'Creating…' : 'Create gallery'}
          </button>
        </form>
      </div>
    </section>
  );
}
