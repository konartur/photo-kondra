'use client';

import { useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import type { AdminPortfolioMediaDto } from '@/lib/portfolio/contracts';
import { PortfolioPhotoPicker, type MediaSource, type PortfolioPhotoPickerProps } from './portfolio-photo-picker';
import { fetchPortfolioMedia, mediaDetailKey, mediaKey, mediaPath, useMediaSearch, usePortfolioMedia } from './portfolio-media-data';
import { PortfolioMediaUpload } from './portfolio-media-upload';

type WithoutSource<T> = T extends MediaSource ? Omit<T, keyof MediaSource> : never;
type Props = WithoutSource<PortfolioPhotoPickerProps> & {
  initialItems: readonly AdminPortfolioMediaDto[];
  allowedIds?: readonly string[];
};

/** Connect the shared picker to authenticated media queries without coupling form fields to pagination. */
export function PortfolioMediaPicker({ initialItems, allowedIds, ...props }: Props) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const search = useMediaSearch();
  const query = usePortfolioMedia(search.querySearch, open);
  const rows = query.data?.pages.flatMap(page => page.items) ?? [];
  const values = props.mode === 'single' ? (props.value ? [props.value] : []) : props.value;
  const pinnedIds = [...new Set([...values, ...draftSelection, ...uploadedIds])];
  const details = useQueries({ queries: pinnedIds.map(id => ({
    queryKey: mediaDetailKey(id),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchPortfolioMedia(id, signal),
    enabled: open || values.includes(id),
    initialData: () => initialItems.find(item => item.id === id) ?? rows.find(item => item.id === id),
    initialDataUpdatedAt: 0,
    refetchInterval: (state: { state: { data: AdminPortfolioMediaDto | undefined } }): number | false => state.state.data?.status === 'PROCESSING' ? 3500 : false,
    retry: false,
  })) });
  const known = new Map(rows.map(item => [item.id, item]));
  details.forEach((detail, index) => {
    if (detail.isError) known.delete(pinnedIds[index]);
    else if (detail.data) known.set(detail.data.id, detail.data);
  });
  const retry = useMutation({
    mutationFn: (id: string) => apiRequest<AdminPortfolioMediaDto>(mediaPath + '/' + id + '/retry', { method: 'POST' }),
    onSuccess: async media => {
      client.setQueryData(mediaDetailKey(media.id), media);
      await client.invalidateQueries({ queryKey: mediaKey });
    },
  });

  return <PortfolioPhotoPicker
    {...props}
    allowedIds={allowedIds}
    items={[...known.values()]}
    isLoading={query.isPending && query.isFetching}
    isLoadingMore={query.isFetchingNextPage}
    isError={query.isError}
    hasMore={query.hasNextPage}
    onRetry={() => { void client.resetQueries({ queryKey: [...mediaKey, 'list', search.querySearch] }); }}
    onLoadMore={() => { void query.fetchNextPage(); }}
    search={search.search}
    onSearchChange={search.setSearch}
    isSearching={search.pending}
    onOpenChange={next => { setOpen(next); if (!next) setDraftSelection([]); }}
    onSelectionChange={ids => {
      for (const id of ids) {
        const item = known.get(id);
        if (item && !client.getQueryData(mediaDetailKey(id))) client.setQueryData(mediaDetailKey(id), item);
      }
      setDraftSelection(ids);
    }}
    upload={<div className="space-y-2">
      <PortfolioMediaUpload disabled={props.disabled} onBusyChange={setUploadBusy}
        onUploaded={media => setUploadedIds(current => [...new Set([...current, media.id])])} />
      {retry.isError && <p role="alert" className="text-red-700">Не вдалося повторити обробку. Спробуйте ще раз.</p>}
    </div>}
    isUploading={uploadBusy}
    onRetryMedia={media => retry.mutate(media.id)}
    retryingMediaId={retry.isPending ? retry.variables : undefined}
  />;
}
