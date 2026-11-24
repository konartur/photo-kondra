'use client';
import { useId, useRef, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminPortfolioMediaDto, PortfolioImageRefDto } from '@/lib/portfolio/contracts';
import { fetchPortfolioMedia, mediaDetailKey } from './portfolio-media-data';
import { button } from './editor-ui';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function PortfolioFocalEditor({
  value,
  name,
  media,
  change,
}: {
  value: PortfolioImageRefDto;
  name: string;
  media: readonly AdminPortfolioMediaDto[];
  change: (value: PortfolioImageRefDto) => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const dragging = useRef(false);
  const hint = useId();
  const initial = media.find((item) => item.id === value.mediaId);
  const query = useQuery({
    queryKey: mediaDetailKey(value.mediaId),
    queryFn: ({ signal }) => fetchPortfolioMedia(value.mediaId, signal),
    initialData: initial,
    enabled: initial?.status !== 'READY',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const point = value.focalPoint ?? { x: 0.5, y: 0.5 };
  function move(event: PointerEvent<HTMLButtonElement>) {
    const box = image.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return;
    change({
      ...value,
      focalPoint: {
        x: clamp((event.clientX - box.left) / box.width),
        y: clamp((event.clientY - box.top) / box.height),
      },
    });
  }
  return (
    <div className="space-y-2">
      <p id={hint} className="text-sm text-zinc-700">
        Натисніть на фото або перемістіть точку стрілками. Shift збільшує крок. Оригінал не
        обрізається.
      </p>
      {query.data?.previewUrl ? (
        <div className="relative max-w-xl overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element -- Protected admin derivative, shown at its natural aspect ratio. */}
          <img
            ref={image}
            src={query.data.previewUrl}
            alt=""
            className="block h-auto w-full"
            draggable={false}
          />
          <button
            type="button"
            className="absolute inset-0 block touch-none focus-visible:outline-4 focus-visible:outline-indigo-600"
            data-portfolio-field={name + '.focalPoint'}
            aria-describedby={hint}
            aria-label={
              'Точка кадрування · X ' +
              Math.round(point.x * 100) +
              '%, Y ' +
              Math.round(point.y * 100) +
              '%'
            }
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              move(event);
            }}
            onPointerMove={(event) => {
              if (dragging.current) move(event);
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
            onKeyDown={(event) => {
              const direction = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              }[event.key];
              if (!direction) return;
              event.preventDefault();
              const step = event.shiftKey ? 0.1 : 0.01;
              change({
                ...value,
                focalPoint: {
                  x: clamp(point.x + direction[0] * step),
                  y: clamp(point.y + direction[1] * step),
                },
              });
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/30 shadow ring-2 ring-black"
              style={{ left: point.x * 100 + '%', top: point.y * 100 + '%' }}
            />
          </button>
        </div>
      ) : (
        <p role="status">
          {query.isPending
            ? 'Завантажуємо фото для кадрування…'
            : 'Фото для кадрування недоступне.'}
        </p>
      )}
      <p className="text-sm">
        {value.focalPoint ? 'Власна точка кадрування' : 'Автоматичний центр'}
      </p>
      <button
        type="button"
        className={button}
        disabled={!value.focalPoint}
        onClick={() => change({ ...value, focalPoint: null })}
      >
        Скинути до автоматичного центру
      </button>
    </div>
  );
}
