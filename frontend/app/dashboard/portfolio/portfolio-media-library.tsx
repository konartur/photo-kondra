'use client';

import { useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import type { AdminPortfolioMediaDto, AdminPortfolioMediaListDto, PortfolioUploadResponseDto } from '@/lib/portfolio/contracts';
import { AdminImage, button, input, panel, primary } from './editor-fields';

const mediaPath = '/api/portfolio/media';
const mediaKey = ['portfolio-admin', 'media'] as const;

export const jsonRequest = (method: 'POST' | 'PUT' | 'DELETE', body: object): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
});

export function usePortfolioMedia() {
  return useInfiniteQuery({
    queryKey: mediaKey,
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => apiRequest<AdminPortfolioMediaListDto>(
      mediaPath + '?limit=24' + (pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''), { signal, cache: 'no-store' },
    ),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchInterval: query => query.state.data?.pages.some(page => page.items.some(media => media.status === 'PROCESSING')) ? 3500 : false,
    retry: false,
  });
}

const statusLabels: Record<AdminPortfolioMediaDto['status'], string> = {
  UPLOADING: 'Очікує завантаження', PROCESSING: 'Обробляється', READY: 'Готове', FAILED: 'Помилка обробки', DELETED: 'Видалене',
};

export function PortfolioMediaLibrary({ query, library = false }: { query: ReturnType<typeof usePortfolioMedia>; library?: boolean }) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [transfer, setTransfer] = useState<PortfolioUploadResponseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  const refresh = () => client.invalidateQueries({ queryKey: mediaKey });

  async function upload() {
    if (!file || busy) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 20_000_000) {
      setError('Оберіть JPEG, PNG або WebP розміром від 1 байта до 20 МБ.');
      return;
    }
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const target = transfer ?? await apiRequest<PortfolioUploadResponseDto>(mediaPath + '/upload-url',
        jsonRequest('POST', { filename: file.name, mimeType: file.type, sizeBytes: file.size }));
      setTransfer(target);
      const url = new URL(target.uploadUrl);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid upload URL');
      const write = await fetch(url, {
        method: 'PUT', headers: target.requiredHeaders, body: file,
        credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(60000),
      });
      if (write.status === 403 || write.status === 410) setTransfer(null);
      if (!write.ok && write.status !== 412) throw new Error('Upload failed');
      await apiRequest<AdminPortfolioMediaDto>(mediaPath + '/' + target.mediaId + '/upload-complete', { method: 'POST' });
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setTransfer(null);
      setFeedback('Файл прийнято. Щойно обробка завершиться, він стане доступним у списках вибору.');
      await refresh();
    } catch {
      setError('Завантаження не завершено. Повторіть спробу для вибраного файла.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function mediaAction(item: AdminPortfolioMediaDto, action: 'retry' | 'remove') {
    if (busy || (action === 'remove' && !window.confirm('Видалити «' + item.filename + '»?'))) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const path = mediaPath + '/' + item.id;
      await apiRequest(action === 'retry' ? path + '/retry' : path, { method: action === 'retry' ? 'POST' : 'DELETE' });
      await refresh();
      setFeedback(action === 'retry' ? 'Обробку запущено повторно.' : 'Файл видалено.');
    } catch {
      setError(action === 'remove' ? 'Не вдалося видалити файл. Перевірте, чи він використовується в портфоліо.' : 'Повторити обробку не вдалося.');
    } finally {
      setBusy(false);
    }
  }

  return <details className={panel} open={library || undefined}>
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">Медіабібліотека · {items.length} завантажено у список</summary>
    <div className="space-y-3">
      <label className="block space-y-1 text-sm font-medium">
        <span>Файл JPEG, PNG або WebP до 20 МБ</span>
        <input ref={fileInput} className={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={e => { setFile(e.target.files?.[0] ?? null); setTransfer(null); setError(''); }} />
      </label>
      <button type="button" className={primary} disabled={!file || busy} onClick={() => void upload()}>
        {busy ? 'Зачекайте…' : transfer ? 'Повторити завантаження' : 'Завантажити'}
      </button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {feedback && <p role="status" className="text-sm text-zinc-700">{feedback}</p>}
      {query.isPending && <p role="status">Завантажуємо медіа…</p>}
      {query.isError && <p role="alert">Не вдалося прочитати медіабібліотеку. <button className={button} type="button" onClick={() => void query.refetch()}>Оновити</button></p>}
      {query.isSuccess && items.length === 0 && <p>Медіабібліотека порожня.</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => <li key={item.id} className="space-y-2 rounded-lg border border-zinc-200 p-3">
          {item.previewUrl && <AdminImage url={item.previewUrl} alt={item.filename} />}
          <p className="break-words text-sm font-medium">{item.filename}</p>
          <p className="text-sm text-zinc-600">{statusLabels[item.status]}</p>
          <div className="flex flex-wrap gap-2">
            {item.status === 'FAILED' && <button className={button} type="button" disabled={busy} onClick={() => void mediaAction(item, 'retry')}>Повторити обробку</button>}
            {library && <button className={button} type="button" disabled={busy} onClick={() => void mediaAction(item, 'remove')}>Видалити</button>}
          </div>
        </li>)}
      </ul>
      {query.hasNextPage && <button className={button} type="button" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>Більше медіа</button>}
    </div>
  </details>;
}
