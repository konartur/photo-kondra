'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import type { AdminPortfolioMediaDto, PortfolioUploadResponseDto } from '@/lib/portfolio/contracts';
import { button, input, primary } from './editor-ui';
import { jsonRequest, mediaDetailKey, mediaKey, mediaPath } from './portfolio-media-data';

export function PortfolioMediaUpload({ onUploaded, onBusyChange, disabled = false }: {
  onUploaded?: (media: AdminPortfolioMediaDto) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [transfer, setTransfer] = useState<PortfolioUploadResponseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function upload() {
    if (!file || busyRef.current || disabled) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 20_000_000) {
      setError('Оберіть JPEG, PNG або WebP розміром від 1 байта до 20 МБ.');
      return;
    }
    busyRef.current = true;
    onBusyChange?.(true);
    setBusy(true); setError(''); setFeedback('');
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
      const media = await apiRequest<AdminPortfolioMediaDto>(mediaPath + '/' + target.mediaId + '/upload-complete', { method: 'POST' });
      client.setQueryData(mediaDetailKey(media.id), media);
      onUploaded?.(media);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setTransfer(null);
      setFeedback('Файл прийнято. Після обробки його можна буде обрати.');
      await client.invalidateQueries({ queryKey: mediaKey });
    } catch {
      setError('Завантаження не завершено. Повторіть спробу для вибраного файла.');
      await client.invalidateQueries({ queryKey: mediaKey });
    } finally {
      busyRef.current = false;
      onBusyChange?.(false);
      setBusy(false);
    }
  }

  return <div className="space-y-3">
    <label className="block space-y-1 text-sm font-medium">
      <span>Нове фото · JPEG, PNG або WebP до 20 МБ</span>
      <input ref={fileInput} className={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || disabled}
        onChange={e => { setFile(e.target.files?.[0] ?? null); setTransfer(null); setError(''); setFeedback(''); }} />
    </label>
    <button type="button" className={file ? primary : button} disabled={!file || busy || disabled} onClick={() => void upload()}>
      {busy ? 'Завантажуємо…' : transfer ? 'Повторити завантаження' : 'Завантажити фото'}
    </button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {feedback && <p role="status" className="text-sm text-zinc-700">{feedback}</p>}
  </div>;
}
