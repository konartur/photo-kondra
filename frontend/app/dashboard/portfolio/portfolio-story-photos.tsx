'use client';

import { useQuery } from '@tanstack/react-query';
import type { AdminPortfolioMediaDto, PortfolioImageRefDto, PortfolioStoryPhotoInputDto } from '@/lib/portfolio/contracts';
import { blankImage, Field, ImageRef, reorder } from './editor-fields';
import { AdminImage, button } from './editor-ui';
import { fetchPortfolioMedia, mediaDetailKey } from './portfolio-media-data';
import { PortfolioMediaPicker } from './portfolio-media-picker';

export function photoCount(photos: readonly PortfolioStoryPhotoInputDto[], coverId?: string) {
  return new Set([...photos.map(photo => photo.image.mediaId), ...(coverId ? [coverId] : [])]).size;
}

function PhotoPreview({ mediaId, media }: { mediaId: string; media: AdminPortfolioMediaDto[] }) {
  const query = useQuery({
    queryKey: mediaDetailKey(mediaId),
    queryFn: ({ signal }) => fetchPortfolioMedia(mediaId, signal),
    initialData: () => media.find(item => item.id === mediaId),
    initialDataUpdatedAt: 0,
    retry: false,
  });
  return <div className="space-y-1">
    {query.data?.previewUrl && !query.isError ? <AdminImage url={query.data.previewUrl} alt={query.data.filename} />
      : <div className="flex aspect-[3/2] items-center justify-center rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700">
        {query.isPending ? 'Завантажуємо фото…' : 'Фото недоступне'}
      </div>}
    <p className="break-words text-sm text-zinc-700">{query.data?.filename ?? 'Фото історії'}</p>
  </div>;
}

export function PhotoFields({ value, change, cover, changeCover, media, canEditPhotos }: {
  value: PortfolioStoryPhotoInputDto[];
  change: (value: PortfolioStoryPhotoInputDto[]) => void;
  cover: PortfolioImageRefDto | null;
  changeCover: (value: PortfolioImageRefDto | null) => void;
  media: AdminPortfolioMediaDto[];
  canEditPhotos: boolean;
}) {
  const used = value.map(photo => photo.image.mediaId);
  const count = photoCount(value, cover?.mediaId);
  const outsideCover = cover && !used.includes(cover.mediaId) ? cover : null;
  const cards = [
    ...(outsideCover ? [{ key: 'cover-' + outsideCover.mediaId, image: outsideCover, index: null }] : []),
    ...value.map((photo, index) => ({ key: photo.id, image: photo.image, index })),
  ];

  function addPhotos(ids: string[]) {
    if (!canEditPhotos) return;
    const additions = [...new Set(ids)].filter(id => !used.includes(id));
    const next = [...value, ...additions.map(mediaId => ({
      id: crypto.randomUUID(), image: cover?.mediaId === mediaId ? { ...cover } : blankImage(mediaId),
    }))];
    if (next.length <= 10 && photoCount(next, cover?.mediaId) <= 10) change(next);
  }

  function chooseCover(mediaId: string) {
    const next = cover?.mediaId === mediaId ? cover : value.find(photo => photo.image.mediaId === mediaId)?.image ?? blankImage(mediaId);
    if (photoCount(value, mediaId) <= 10) changeCover({ ...next });
  }

  return <div className="space-y-4">
    <p className="text-sm text-zinc-700" role="status">{count} з 10 унікальних фото разом з обкладинкою.</p>
    <div className="flex flex-wrap items-end gap-4">
      <Field label="Обкладинка історії" name="cover.mediaId">{a11y => <PortfolioMediaPicker
        {...a11y} label="Обкладинка" mode="single" value={cover?.mediaId ?? null} initialItems={media}
        showCurrentPreview={false} allowedIds={value.length >= 10 ? used : undefined} onConfirm={chooseCover}
      />}</Field>
      <Field label="Фото в історії" name="items">{a11y => <PortfolioMediaPicker
        {...a11y} label="Додати фото" mode="multiple" value={[]} initialItems={media} used={used}
        showCurrentPreview={false} disabled={!canEditPhotos} limit={Math.max(0, 10 - count)}
        uncountedIds={outsideCover ? [outsideCover.mediaId] : []} onConfirm={addPhotos}
      />}</Field>
    </div>
    {!canEditPhotos && <p className="text-sm text-zinc-700">Спочатку збережіть опис і обкладинку. Потім можна додати фото до історії.</p>}
    {!cover && <p className="text-sm text-zinc-700">Оберіть обкладинку з бібліотеки або призначте нею фото зі списку.</p>}
    <p className="text-sm text-zinc-700">Прибирання зі списку не видаляє файл із фотобібліотеки. Обкладинка може бути окремим фото.</p>
    <ol className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ key, image, index }) => {
        const isCover = cover?.mediaId === image.mediaId;
        return <li key={key} className="min-w-0 space-y-3 rounded-lg border border-zinc-200 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span>{index === null ? 'Окреме фото' : 'Фото ' + (index + 1)}</span>
            {isCover && <span className="rounded bg-zinc-100 px-2 py-1">Обкладинка</span>}
            {index === null && <span className="text-sm text-zinc-700">Поза списком історії</span>}
          </div>
          <PhotoPreview mediaId={image.mediaId} media={media} />
          <div className="flex flex-wrap gap-2">
            {!isCover && <button type="button" className={button} onClick={() => chooseCover(image.mediaId)}>Зробити обкладинкою</button>}
            {index === null && <button type="button" className={button} disabled={!canEditPhotos || value.length >= 10}
              onClick={() => addPhotos([image.mediaId])}>Додати до історії</button>}
            {isCover && <button type="button" className={button} onClick={() => changeCover(null)}>Прибрати обкладинку</button>}
            {index !== null && <>
              <button type="button" className={button} aria-label={'Вище · фото ' + (index + 1)} disabled={index === 0}
                onClick={() => change(reorder(value, index, -1))}>Вище</button>
              <button type="button" className={button} aria-label={'Нижче · фото ' + (index + 1)} disabled={index === value.length - 1}
                onClick={() => change(reorder(value, index, 1))}>Нижче</button>
              <button type="button" className={button} aria-label={'Прибрати зі списку · фото ' + (index + 1)}
                onClick={() => change(value.filter((_, position) => position !== index))}>Прибрати зі списку</button>
            </>}
          </div>
          {isCover && index !== null && <p className="text-sm text-zinc-700">Якщо прибрати це фото зі списку, воно залишиться обкладинкою.</p>}
          {index !== null && <details className="space-y-3" data-story-photo-fields>
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Замінити фото {index + 1}, опис і кадрування</summary>
            <ImageRef label={'Фото ' + (index + 1)} name={'items.' + index + '.image'} value={image} media={media}
              removable={false} used={used.filter(id => id !== image.mediaId)}
              allowedIds={count >= 10 && isCover ? [image.mediaId] : undefined}
              change={next => {
                if (!next) return;
                const updated = value.map((photo, position) => position === index ? { ...photo, image: next } : photo);
                if (new Set(updated.map(photo => photo.image.mediaId)).size === updated.length
                  && photoCount(updated, cover?.mediaId) <= 10) change(updated);
              }} />
          </details>}
          {isCover && <details className="space-y-3" data-story-cover-fields>
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Опис і кадрування обкладинки</summary>
            <ImageRef label="Обкладинка" name="cover" value={cover} media={media} removable={false} showPicker={false} change={changeCover} />
          </details>}
        </li>;
      })}
    </ol>
  </div>;
}
