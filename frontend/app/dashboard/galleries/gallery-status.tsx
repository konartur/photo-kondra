import type { GalleryStatus } from '@/lib/api/galleries';

const statusLabels: Record<GalleryStatus, string> = {
  DRAFT: 'Draft',
  PROCESSING: 'Processing',
  READY: 'Ready',
  ARCHIVED: 'Archived',
};

const statusClasses: Record<GalleryStatus, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-700',
  PROCESSING: 'bg-amber-100 text-amber-800',
  READY: 'bg-emerald-100 text-emerald-800',
  ARCHIVED: 'bg-slate-200 text-slate-700',
};

export function GalleryStatusBadge({ status }: { status: GalleryStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  );
}
