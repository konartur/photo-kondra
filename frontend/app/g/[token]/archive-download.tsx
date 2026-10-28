'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getPreparedArchive, getPublicArchive } from '@/lib/api/public-galleries';

export function ArchiveDownload({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const archive = useQuery({
    queryKey: ['prepared-archive', token],
    queryFn: () => getPreparedArchive(token),
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function download() {
    if (!archive.data) return;
    setDownloading(true);
    setError(null);
    try {
      const current = await getPublicArchive(token, archive.data.id);
      if (current.status !== 'READY' || !current.downloadUrl)
        throw new Error('ZIP is temporarily unavailable. Please contact the photographer.');
      window.location.assign(current.downloadUrl);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={archive.isPending || archive.data?.status !== 'READY' || downloading || !!error}
        onClick={() => void download()}
        className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {downloading ? 'Starting download…' : 'Download ZIP'}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-zinc-600">
        {error ??
          archive.error?.message ??
          (archive.isPending
            ? 'Checking download availability…'
            : archive.data?.status === 'READY'
              ? 'All originals are ready to download.'
              : 'ZIP is temporarily unavailable. Please contact the photographer.')}
      </p>
      {archive.isError || error ? (
        <button
          type="button"
          className="text-sm underline"
          onClick={() => {
            setError(null);
            void archive.refetch();
          }}
        >
          Check again
        </button>
      ) : null}
    </div>
  );
}
