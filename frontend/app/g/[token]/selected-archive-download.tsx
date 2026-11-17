'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getPublicArchive, requestSelectedArchive } from '@/lib/api/public-galleries';

export function SelectedArchiveDownload({
  token,
  photoIds,
}: {
  token: string;
  photoIds: string[];
}) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const queryClient = useQueryClient();
  const request = useMutation({
    mutationFn: (ids: string[]) => requestSelectedArchive(token, ids),
    retry: false,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['selected-archive', token, result.id] });
    },
  });
  const archive = useQuery({
    queryKey: ['selected-archive', token, request.data?.id],
    queryFn: () => getPublicArchive(token, request.data!.id),
    enabled: !!request.data,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.error || ['READY', 'FAILED'].includes(query.state.data?.status ?? '')
        ? false
        : 1500,
  });
  const result = archive.data ?? request.data;
  const preparing =
    request.isPending ||
    (!!result && ['PENDING', 'PROCESSING'].includes(result.status) && !archive.isError);
  const error =
    downloadError ??
    request.error?.message ??
    archive.error?.message ??
    (result?.status === 'FAILED' ? 'Selected ZIP preparation failed. Please try again.' : null);

  async function download() {
    if (!result) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const current = await getPublicArchive(token, result.id);
      if (current.status !== 'READY' || !current.downloadUrl)
        throw new Error('Selected ZIP is not ready. Please try again.');
      window.location.assign(current.downloadUrl);
    } catch (failure) {
      setDownloadError(failure instanceof Error ? failure.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={!photoIds.length || photoIds.length > 500 || preparing || downloading}
        className="rounded-lg border border-zinc-800 bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        onClick={() => {
          setDownloadError(null);
          request.mutate([...photoIds]);
        }}
      >
        {preparing ? 'Preparing selected ZIP…' : `Download selected (${photoIds.length})`}
      </button>
      {result?.status === 'READY' && !error ? (
        <button
          type="button"
          disabled={downloading}
          className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm text-white disabled:opacity-50"
          onClick={() => void download()}
        >
          {downloading ? 'Starting download…' : 'Save selected ZIP'}
        </button>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm text-zinc-600">
        {error ??
          (preparing
            ? `Preparing ${request.variables?.length ?? 0} selected originals. You can keep browsing.`
            : result?.status === 'READY'
              ? `Selected ZIP is ready (${request.variables?.length ?? 0} photos).`
              : 'Select up to 500 photos for a separate ZIP.')}
      </p>
    </div>
  );
}
