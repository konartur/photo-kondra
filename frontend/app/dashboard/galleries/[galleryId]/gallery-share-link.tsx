'use client';

import { useState } from 'react';
import { createPrivateGalleryLink } from '@/lib/api/galleries';

export function GalleryShareLink({ galleryId }: { galleryId: string }) {
  // Raw tokens stay in this mounted view, never localStorage or the query cache.
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    if (busy) return;
    setBusy(true);
    setCopied(false);
    setError(null);
    try {
      const link = url ?? (await createPrivateGalleryLink(galleryId)).url;
      setUrl(link);
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(link);
        setCopied(true);
      } catch {
        setError('Automatic copying is unavailable. Select the link below and copy it manually.');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Private link could not be created');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
      <h3 className="font-semibold text-zinc-950">Share with client</h3>
      <p className="mt-2 text-sm text-zinc-600">
        Copy a private link to the published gallery. Anyone with this link can view the photos and
        download the ZIP.
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        disabled={busy}
        className="mt-4 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Preparing link…' : copied ? 'Copy again' : 'Copy private link'}
      </button>
      {url ? (
        <label className="mt-4 block text-sm text-zinc-600">
          Private gallery link
          <input
            value={url}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
      ) : null}
      <p role="status" aria-live="polite" className="mt-3 text-sm text-zinc-600">
        {copied ? 'Private link copied.' : ''}
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
