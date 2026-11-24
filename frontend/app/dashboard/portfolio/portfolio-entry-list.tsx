'use client';
import { useQuery } from '@tanstack/react-query';
import type { AdminPortfolioSummaryDto } from '@/lib/portfolio/contracts';
import { fetchPortfolioMedia, mediaDetailKey } from './portfolio-media-data';
import { AdminImage, button } from './editor-fields';

const statusLabel = { DRAFT: 'Чернетка', PUBLISHED: 'Опубліковано', ARCHIVED: 'В архіві' };
export function PortfolioEntryRow({
  row,
  open,
}: {
  row: AdminPortfolioSummaryDto & { thumbnailMediaId?: string | null };
  open: () => void;
}) {
  const id = row.thumbnailMediaId;
  const media = useQuery({
    queryKey: mediaDetailKey(id ?? ''),
    queryFn: ({ signal }) => fetchPortfolioMedia(id!, signal),
    enabled: Boolean(id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-200 p-3">
      <div className="w-24 shrink-0">
        {media.data?.previewUrl ? (
          <AdminImage url={media.data.previewUrl} alt="" />
        ) : (
          <div className="flex aspect-square items-center justify-center rounded bg-zinc-100 text-sm text-zinc-600">
            Без фото
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="break-words font-semibold">{row.title.uk || row.title.en || 'Без назви'}</h4>
        <p className="text-sm">
          {statusLabel[row.status]}
          {row.hasUnpublishedChanges ? ' · є неопубліковані зміни' : ''}
        </p>
      </div>
      <button
        type="button"
        className={button}
        onClick={open}
        aria-label={'Відкрити · ' + (row.title.uk || row.title.en || 'Без назви')}
      >
        Відкрити
      </button>
    </li>
  );
}
