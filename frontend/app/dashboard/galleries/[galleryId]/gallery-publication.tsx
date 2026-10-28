'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  galleryKeys,
  getGalleryArchive,
  publishGallery,
  type GalleryStatus,
} from '@/lib/api/galleries';

export function GalleryPublication({
  galleryId,
  status,
  hasPendingUploads = false,
}: {
  galleryId: string;
  status: GalleryStatus;
  hasPendingUploads?: boolean;
}) {
  const client = useQueryClient();
  const archive = useQuery({
    queryKey: ['gallery-archive', galleryId, status],
    queryFn: () => getGalleryArchive(galleryId),
    retry: false,
    refetchInterval: (query) =>
      query.state.data &&
      (query.state.data.pendingPhotoCount > 0 ||
        ['PENDING', 'PROCESSING'].includes(query.state.data.status))
        ? 3000
        : false,
  });
  const publish = useMutation({
    mutationFn: () => publishGallery(galleryId),
    onSuccess: (gallery) => {
      client.setQueryData(galleryKeys.detail(galleryId), gallery);
      void client.invalidateQueries({ queryKey: galleryKeys.all });
      void client.invalidateQueries({ queryKey: ['gallery-archive', galleryId] });
    },
  });
  const preparing = archive.data?.status === 'PENDING' || archive.data?.status === 'PROCESSING';
  const ready = status === 'READY' && archive.data?.status === 'READY';
  const photosNotReady = hasPendingUploads || !archive.data?.canPublish;
  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
      <h3 className="font-semibold text-zinc-950">Publication and ZIP</h3>
      <p className="mt-2 text-sm text-zinc-600" role="status" aria-live="polite">
        {ready
          ? 'Gallery published. ZIP is saved and ready for clients.'
          : preparing
            ? 'Preparing ZIP. The gallery will become available after it is saved.'
            : archive.data?.status === 'FAILED'
              ? 'ZIP preparation failed. Retry publication.'
              : 'Publish after all photos finish processing. Clients will receive a ready ZIP.'}
      </p>
      {!ready && status !== 'ARCHIVED' ? (
        <button
          type="button"
          onClick={() => publish.mutate()}
          disabled={publish.isPending || preparing || photosNotReady || archive.isError}
          aria-describedby={photosNotReady ? 'publication-readiness' : undefined}
          className="mt-4 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {preparing
            ? 'Preparing ZIP…'
            : publish.isPending
              ? 'Starting…'
              : status === 'DRAFT'
                ? 'Publish gallery and prepare ZIP'
                : 'Retry publication'}
        </button>
      ) : null}
      {!ready && photosNotReady ? (
        <p id="publication-readiness" className="mt-3 text-sm text-zinc-600" role="status">
          {archive.isPending
            ? 'Checking photo readiness…'
            : 'Wait until all uploaded photos are Ready. Failed or incomplete uploads must be retried or removed.'}
        </p>
      ) : null}
      {publish.error || archive.error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {publish.error?.message ?? archive.error?.message}
        </p>
      ) : null}
    </section>
  );
}
