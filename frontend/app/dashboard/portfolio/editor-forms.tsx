'use client';

import type {
  AdminPortfolioMediaDto, AdminPortfolioSummaryDto, PortfolioHomeDraftInputDto,
  PortfolioServiceDraftInputDto, PortfolioStoryDraftInputDto, PortfolioStoryPhotoInputDto,
} from '@/lib/portfolio/contracts';
import { blankImage, blankSeo, blankText, button, Field, ImageRef, input, Localized, MediaSelect, panel, reorder, Seo, Text } from './editor-fields';

export const newService = (): PortfolioServiceDraftInputDto => ({
  slug: '', title: blankText(), description: blankText(), price: null, cardImage: null, bookingEnabled: false, seo: blankSeo(),
});
export const newStory = (): PortfolioStoryDraftInputDto => ({
  slug: '', title: blankText(), subtitle: blankText(), description: blankText(), serviceId: '', cover: null, seo: blankSeo(),
});

type FieldsProps<T> = { value: T; change: (value: T) => void; media: AdminPortfolioMediaDto[]; lockedSlug?: boolean };
type Option = { id: string; label: string };
export const choices = (rows: AdminPortfolioSummaryDto[]) => rows.map(row => ({
  id: row.id, label: (row.title.uk || row.title.en || row.slug) + ' · ' + row.slug,
}));

function Choice({ label, name, options, value, change, required }: {
  label: string; name: string; options: Option[]; value: string; change: (id: string) => void; required?: boolean;
}) {
  return <Field label={label} name={name}>{props => (
    <select {...props} className={input} value={value} required={required} onChange={e => change(e.target.value)}>
      <option value="">Оберіть запис</option>
      {value && !options.some(option => option.id === value) && <option value={value}>Поточний запис</option>}
      {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  )}</Field>;
}

function MoveButtons({ index, count, move, remove, name }: {
  index: number; count: number; move: (direction: -1 | 1) => void; remove: () => void; name: string;
}) {
  return <div className="flex flex-wrap gap-2">
    <button type="button" className={button} aria-label={'Вище · ' + name} disabled={index === 0} onClick={() => move(-1)}>Вище</button>
    <button type="button" className={button} aria-label={'Нижче · ' + name} disabled={index + 1 === count} onClick={() => move(1)}>Нижче</button>
    <button type="button" className={button} aria-label={'Прибрати · ' + name} onClick={remove}>Прибрати</button>
  </div>;
}

export function ServiceFields({ value, change, media, lockedSlug }: FieldsProps<PortfolioServiceDraftInputDto>) {
  return <>
    <Text label="Slug" name="slug" value={value.slug} change={slug => change({ ...value, slug })} max={80} required disabled={lockedSlug} />
    <Localized label="Назва" name="title" value={value.title} change={title => change({ ...value, title })} />
    <Localized label="Опис" name="description" value={value.description} max={4000} multiline change={description => change({ ...value, description })} />
    <ImageRef label="Фото напряму" name="cardImage" media={media} value={value.cardImage} change={cardImage => change({ ...value, cardImage })} />
    <fieldset className={panel}>
      <legend className="px-1 font-medium">Ціна й бронювання</legend>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={value.bookingEnabled} onChange={e => change({ ...value, bookingEnabled: e.target.checked })} />
        Дозволити бронювання
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={value.price !== null}
          onChange={e => change({ ...value, price: e.target.checked ? { amountMinor: 0, currency: 'UAH', durationMinutes: 60 } : null })} />
        Вказати ціну
      </label>
      {value.price && <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ціна, ₴" name="price.amountMinor">{a11y => (
          <input {...a11y} className={input} inputMode="decimal" type="number" step=".01" min="0" max="1000000"
            value={value.price!.amountMinor / 100} onChange={e => {
              if (value.price) change({ ...value, price: { ...value.price, amountMinor: Math.round(Number(e.target.value) * 100) } });
            }} />
        )}</Field>
        <Field label="Тривалість, хв" name="price.durationMinutes">{a11y => (
          <input {...a11y} className={input} type="number" min="1" max="1440" value={value.price!.durationMinutes}
            onChange={e => { if (value.price) change({ ...value, price: { ...value.price, durationMinutes: Number(e.target.value) } }); }} />
        )}</Field>
      </div>}
    </fieldset>
    <Seo value={value.seo} change={seo => change({ ...value, seo })} media={media} />
  </>;
}

export function StoryFields({ value, change, media, lockedSlug, services }: FieldsProps<PortfolioStoryDraftInputDto> & { services: Option[] }) {
  return <>
    <Text label="Slug" name="slug" value={value.slug} change={slug => change({ ...value, slug })} max={80} required disabled={lockedSlug} />
    <Choice label="Напрям" name="serviceId" options={services} value={value.serviceId} change={serviceId => change({ ...value, serviceId })} required />
    <Localized label="Назва" name="title" value={value.title} change={title => change({ ...value, title })} />
    <Localized label="Підзаголовок" name="subtitle" value={value.subtitle} max={200} change={subtitle => change({ ...value, subtitle })} />
    <Localized label="Опис" name="description" value={value.description} max={4000} multiline change={description => change({ ...value, description })} />
    <ImageRef label="Обкладинка" name="cover" media={media} value={value.cover} change={cover => change({ ...value, cover })} />
    <Seo value={value.seo} change={seo => change({ ...value, seo })} media={media} />
  </>;
}

export function photoCount(photos: PortfolioStoryPhotoInputDto[], coverId?: string) {
  return new Set([...photos.map(photo => photo.image.mediaId), ...(coverId ? [coverId] : [])]).size;
}

export function PhotoFields({ value, change, media, coverId }: {
  value: PortfolioStoryPhotoInputDto[]; change: (value: PortfolioStoryPhotoInputDto[]) => void; media: AdminPortfolioMediaDto[]; coverId?: string;
}) {
  const used = value.map(photo => photo.image.mediaId);
  const count = photoCount(value, coverId);
  const selectable = count >= 10 ? media.filter(item => item.id === coverId && value.length < 10) : media;
  return <div className="space-y-4">
    <p className="text-sm text-zinc-700" role="status">{count} з 10 унікальних фото разом з обкладинкою.</p>
    <MediaSelect label="Додати фото" name="items" value="" options={selectable} used={used}
      change={mediaId => { if (mediaId) change([...value, { id: crypto.randomUUID(), image: blankImage(mediaId) }]); }} />
    <ol className="space-y-4">{value.map((photo, index) => <li key={photo.id} className="space-y-2">
      <ImageRef label={'Фото ' + (index + 1)} name={'items.' + index + '.image'} value={photo.image} removable={false}
        media={media.filter(item => item.id === photo.image.mediaId || (!used.includes(item.id) && (count < 10 || item.id === coverId || photo.image.mediaId !== coverId)))}
        change={image => { if (image) change(value.map(item => item.id === photo.id ? { ...item, image } : item)); }} />
      <MoveButtons index={index} count={value.length} name={'фото ' + (index + 1)}
        move={direction => change(reorder(value, index, direction))} remove={() => change(value.filter(item => item.id !== photo.id))} />
    </li>)}</ol>
  </div>;
}

export function HomeFields({ value, change, media, services, stories }: FieldsProps<PortfolioHomeDraftInputDto> & {
  services: Option[]; stories: Option[];
}) {
  const serviceIds = value.servicesSection.serviceIds;
  const featured = value.storiesSection.items;
  const setServices = (ids: string[]) => change({ ...value, servicesSection: { ...value.servicesSection, serviceIds: ids } });
  const setFeatured = (items: typeof featured) => change({ ...value, storiesSection: { ...value.storiesSection, items } });
  const contactTypes = ['email', 'instagram', 'telegram'] as const;
  return <>
    <Text label="Назва бренду" name="brand" value={value.brand} max={120} change={brand => change({ ...value, brand })} />
    <Localized label="Вступ форми бронювання" name="bookingIntro" value={value.bookingIntro} max={4000} multiline change={bookingIntro => change({ ...value, bookingIntro })} />
    <ImageRef label="Головне фото · широке" name="hero.desktop" value={value.hero.desktop} media={media} change={desktop => change({ ...value, hero: { ...value.hero, desktop } })} />
    <ImageRef label="Головне фото · мобільне" name="hero.mobile" value={value.hero.mobile} media={media} change={mobile => change({ ...value, hero: { ...value.hero, mobile } })} />

    <fieldset className={panel}>
      <legend className="px-1 font-medium">Напрями на головній</legend>
      <Localized label="Заголовок напрямів" name="servicesSection.title" value={value.servicesSection.title}
        change={title => change({ ...value, servicesSection: { ...value.servicesSection, title } })} />
      <Localized label="Опис напрямів" name="servicesSection.description" value={value.servicesSection.description} max={4000} multiline
        change={description => change({ ...value, servicesSection: { ...value.servicesSection, description } })} />
      {serviceIds.length < 20 && <Choice label="Додати напрям" name="servicesSection.serviceIds" value=""
        options={services.filter(option => !serviceIds.includes(option.id))} change={id => { if (id) setServices([...serviceIds, id]); }} />}
      <ol className="space-y-3">{serviceIds.map((id, index) => {
        const name = services.find(item => item.id === id)?.label ?? ('Напрям ' + (index + 1));
        return <li key={id} className="space-y-1"><p>{name}</p>
          <MoveButtons name={name} index={index} count={serviceIds.length}
            move={direction => setServices(reorder(serviceIds, index, direction))} remove={() => setServices(serviceIds.filter(item => item !== id))} />
        </li>;
      })}</ol>
    </fieldset>

    <fieldset className={panel}>
      <legend className="px-1 font-medium">Добірка історій</legend>
      <Localized label="Заголовок історій" name="storiesSection.title" value={value.storiesSection.title}
        change={title => change({ ...value, storiesSection: { ...value.storiesSection, title } })} />
      {featured.length < 12 && <Choice label="Додати історію" name="storiesSection.items" value=""
        options={stories.filter(option => !featured.some(item => item.storyId === option.id))}
        change={storyId => { if (storyId) setFeatured([...featured, { storyId, caption: blankText() }]); }} />}
      <ol className="space-y-3">{featured.map(({ storyId, caption }, index) => {
        const name = stories.find(item => item.id === storyId)?.label ?? ('Історія ' + (index + 1));
        return <li key={storyId} className="space-y-2"><p>{name}</p>
          <Localized label="Підпис історії" name={'storiesSection.items.' + index + '.caption'} value={caption} max={4000} multiline
            change={next => setFeatured(featured.map(item => item.storyId === storyId ? { ...item, caption: next } : item))} />
          <MoveButtons name={name} index={index} count={featured.length}
            move={direction => setFeatured(reorder(featured, index, direction))} remove={() => setFeatured(featured.filter(item => item.storyId !== storyId))} />
        </li>;
      })}</ol>
    </fieldset>

    <fieldset className={panel}>
      <legend className="px-1 font-medium">Контакти</legend>
      {contactTypes.map(type => {
        const index = value.contacts.findIndex(contact => contact.type === type);
        const contact = value.contacts[index];
        const label = { email: 'Email', instagram: 'Instagram', telegram: 'Telegram' }[type];
        const update = (next: typeof contact) => change({ ...value, contacts: value.contacts.map(item => item.type === type ? next : item) });
        return <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-3" key={type}>
          <legend className="px-1 font-medium">{label}</legend>
          {contact ? <>
            <Text label={label + ' · адреса'} name={'contacts.' + index + '.address'} value={contact.address} max={2048} required change={address => update({ ...contact, address })} />
            <Localized label={label + ' · назва'} name={'contacts.' + index + '.label'} value={contact.label} change={name => update({ ...contact, label: name })} />
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={contact.visible}
              onChange={e => update({ ...contact, visible: e.target.checked })} /> Показувати {label}</label>
            <button type="button" className={button} onClick={() => change({ ...value, contacts: value.contacts.filter(item => item.type !== type) })}>Прибрати {label}</button>
          </> : <button type="button" className={button} onClick={() => change({ ...value, contacts: [...value.contacts, { type, label: blankText(), address: '', visible: true }] })}>Додати {label}</button>}
        </fieldset>;
      })}
      <Localized label="Заголовок контактів" name="contactSection.title" value={value.contactSection.title} change={title => change({ ...value, contactSection: { ...value.contactSection, title } })} />
      <Localized label="Опис контактів" name="contactSection.description" value={value.contactSection.description} max={4000} multiline change={description => change({ ...value, contactSection: { ...value.contactSection, description } })} />
      <Localized label="Текст кнопки бронювання" name="contactSection.buttonLabel" value={value.contactSection.buttonLabel} change={buttonLabel => change({ ...value, contactSection: { ...value.contactSection, buttonLabel } })} />
      <ImageRef label="Фонове фото контактів" name="contactSection.background" value={value.contactSection.background} media={media} change={background => change({ ...value, contactSection: { ...value.contactSection, background } })} />
    </fieldset>
    <Seo value={value.seo} change={seo => change({ ...value, seo })} media={media} />
  </>;
}
