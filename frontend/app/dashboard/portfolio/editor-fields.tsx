'use client';

import { createContext, useContext, useId, type ReactNode } from 'react';
import type { AdminPortfolioMediaDto, LocalizedTextDto, PortfolioImageRefDto, PortfolioSeoInputDto } from '@/lib/portfolio/contracts';
import { button, input, panel } from './editor-ui';
import { PortfolioMediaPicker } from './portfolio-media-picker';

export { AdminImage, button, primary, input, panel } from './editor-ui';
export const blankText = (): LocalizedTextDto => ({ uk: '', en: '' });
export const blankSeo = (): PortfolioSeoInputDto => ({ title: blankText(), description: blankText(), shareImage: null });
export const blankImage = (mediaId: string): PortfolioImageRefDto => ({ mediaId, alt: blankText(), focalPoint: null });
export const FieldErrors = createContext<readonly string[]>([]);

export function Field({ label, name, errorMessage = 'Перевірте значення цього поля.', children }: {
  label: string; name: string; errorMessage?: string;
  children: (props: { id: string; 'data-portfolio-field': string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const errors = useContext(FieldErrors);
  const invalid = errors.some(error => {
    const field = error.startsWith('data.') ? error.slice(5) : error;
    return field === name || field.startsWith(name + '.');
  });
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-900">{label}</label>
      {children({ id, 'data-portfolio-field': name, 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? id + '-error' : undefined })}
      {invalid && <p id={id + '-error'} className="text-sm text-red-700">{errorMessage}</p>}
    </div>
  );
}

export function Text({ label, name, value, change, max, multiline = false, required = false, disabled }: {
  label: string; name: string; value: string; change: (value: string) => void;
  max: number; multiline?: boolean; required?: boolean; disabled?: boolean;
}) {
  return <Field label={label} name={name}>{a11y => multiline
    ? <textarea {...a11y} className={input} value={value} maxLength={max} rows={3} required={required} onChange={e => change(e.target.value)} />
    : <input {...a11y} className={input} value={value} maxLength={max} required={required} disabled={disabled}
      pattern={name === 'slug' ? '[a-z0-9]+(?:-[a-z0-9]+)*' : undefined} onChange={e => change(e.target.value)} />
  }</Field>;
}

export function Localized({ label, name, value, change, max = 120, multiline }: {
  label: string; name: string; value: LocalizedTextDto; change: (value: LocalizedTextDto) => void; max?: number; multiline?: boolean;
}) {
  return <fieldset className="grid gap-3 sm:grid-cols-2">
    <legend className="mb-2 text-sm font-semibold text-zinc-950">{label}</legend>
    {(['uk', 'en'] as const).map(locale => (
      <Text key={locale} label={label + ' · ' + locale.toUpperCase()} name={name + '.' + locale} value={value[locale]}
        change={next => change({ ...value, [locale]: next })} max={max} multiline={multiline} />
    ))}
  </fieldset>;
}

export function MediaSelect({ name, label, value, change, options, used = [], allowedIds }: {
  name: string; label: string; value: string; change: (id: string) => void; options: AdminPortfolioMediaDto[];
  used?: readonly string[]; allowedIds?: readonly string[];
}) {
  return <Field label={label} name={name}>{a11y => (
    <PortfolioMediaPicker {...a11y} label={label} mode="single" value={value || null}
      initialItems={options} used={used} allowedIds={allowedIds} onConfirm={change} />
  )}</Field>;
}

export function ImageRef({ label, name, value, change, media, removable = true, used, allowedIds, showPicker = true }: {
  label: string; name: string; value: PortfolioImageRefDto | null;
  change: (value: PortfolioImageRefDto | null) => void; media: AdminPortfolioMediaDto[]; removable?: boolean;
  used?: readonly string[]; allowedIds?: readonly string[];
  showPicker?: boolean;
}) {
  return <fieldset className="space-y-3 rounded-lg border border-zinc-200 p-3">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    {showPicker && <MediaSelect name={name + '.mediaId'} label={label + ' · файл'} value={value?.mediaId ?? ''} options={media}
      used={used} allowedIds={allowedIds}
      change={id => change(value ? { ...value, mediaId: id } : blankImage(id))} />}
    {showPicker && value && removable && <button type="button" className={button} onClick={() => change(null)}>Прибрати фото</button>}
    {value && <>
      <Localized name={name + '.alt'} label="Альтернативний опис" value={value.alt} max={500}
        change={alt => change({ ...value, alt })} />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={value.focalPoint !== null}
          onChange={e => change({ ...value, focalPoint: e.target.checked ? { x: 0.5, y: 0.5 } : null })} />
        Задати точку кадрування
      </label>
      {value.focalPoint && <div className="grid gap-3 sm:grid-cols-2">{(['x', 'y'] as const).map(axis => (
        <Field label={axis.toUpperCase() + ' · від 0 до 1'} name={name + '.focalPoint.' + axis} key={axis}>{a11y =>
          <input {...a11y} className={input} type="number" min="0" max="1" step="any" required
            value={value.focalPoint![axis]} onChange={e => {
              if (value.focalPoint && Number.isFinite(e.target.valueAsNumber))
                change({ ...value, focalPoint: { ...value.focalPoint, [axis]: e.target.valueAsNumber } });
            }} />
        }</Field>
      ))}</div>}
    </>}
  </fieldset>;
}

export function Seo({ value, change, media }: {
  value: PortfolioSeoInputDto; change: (value: PortfolioSeoInputDto) => void; media: AdminPortfolioMediaDto[];
}) {
  return <fieldset className={panel}>
    <legend className="px-1 font-medium">SEO та поширення</legend>
    <Localized label="SEO заголовок" name="seo.title" value={value.title} change={title => change({ ...value, title })} />
    <Localized label="SEO опис" name="seo.description" value={value.description} max={320} multiline change={description => change({ ...value, description })} />
    <ImageRef label="Фото для поширення" name="seo.shareImage" value={value.shareImage} change={shareImage => change({ ...value, shareImage })} media={media} />
  </fieldset>;
}

export function reorder<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const ordered = [...items];
  const other = index + direction;
  if (other >= 0 && other < items.length) [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
  return ordered;
}
