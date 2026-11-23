'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import type { AdminPortfolioMediaDto } from '@/lib/portfolio/contracts';
import { AdminImage, button, input, panel } from './editor-ui';
import { mediaKey, mediaPath, useMediaSearch, usePortfolioMedia } from './portfolio-media-data';
import { PortfolioMediaUpload } from './portfolio-media-upload';

export { jsonRequest, usePortfolioMedia } from './portfolio-media-data';

const statusLabels: Record<AdminPortfolioMediaDto['status'], string> = {
  UPLOADING: 'Очікує завантаження', PROCESSING: 'Обробляється', READY: 'Готове', FAILED: 'Помилка обробки', DELETED: 'Видалене',
};

export function PortfolioMediaLibrary() {
  const client = useQueryClient();
  const search = useMediaSearch();
  const query = usePortfolioMedia(search.querySearch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  const refresh = () => client.invalidateQueries({ queryKey: mediaKey });

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

  return <section className={panel} aria-label="Фотобібліотека">
    <h3 className="font-semibold">Фотобібліотека</h3>
    <div className="space-y-3">
      <PortfolioMediaUpload disabled={busy} />
      <label className="block space-y-1 text-sm font-medium">Пошук фото
        <input className={input} type="search" value={search.search} maxLength={120} onChange={event => search.setSearch(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}
      {query.isPending && <p role="status">Завантажуємо медіа…</p>}
      {query.isError && <p role="alert">Не вдалося прочитати медіабібліотеку. <button className={button} type="button" onClick={() => void query.refetch()}>Оновити</button></p>}
      {search.pending && <p role="status">Шукаємо фотографії…</p>}
      {query.isSuccess && items.length === 0 && <p>{search.querySearch ? 'За цією назвою фото не знайдено.' : 'Фотобібліотека порожня.'}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => <li key={item.id} className="space-y-2 rounded-lg border border-zinc-200 p-3">
          {item.previewUrl && <AdminImage url={item.previewUrl} alt={item.filename} />}
          <p className="break-words text-sm font-medium">{item.filename}</p>
          <p className="text-sm text-zinc-600">{statusLabels[item.status]}</p>
          <div className="flex flex-wrap gap-2">
            {item.status === 'FAILED' && <button className={button} type="button" disabled={busy} onClick={() => void mediaAction(item, 'retry')}>Повторити обробку</button>}
            <button className={button} type="button" disabled={busy} onClick={() => void mediaAction(item, 'remove')}>Видалити</button>
          </div>
        </li>)}
      </ul>
      {query.hasNextPage && <button className={button} type="button" disabled={query.isFetching || search.pending} onClick={() => void query.fetchNextPage()}>Більше медіа</button>}
    </div>
  </section>;
}

