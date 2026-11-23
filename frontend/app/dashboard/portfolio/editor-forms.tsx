'use client';

import { useState } from 'react';
import type {
  AdminPortfolioMediaDto, AdminPortfolioSummaryDto, PortfolioContactInputDto, PortfolioHomeDraftInputDto,
  PortfolioServiceDraftInputDto, PortfolioStoryDraftInputDto,
} from '@/lib/portfolio/contracts';
import { blankSeo, blankText, button, Field, ImageRef, input, Localized, panel, reorder, Seo } from './editor-fields';

export { photoCount, PhotoFields } from './portfolio-story-photos';

export const newService = (): PortfolioServiceDraftInputDto => ({
  slug: '', title: blankText(), description: blankText(), price: null, cardImage: null, bookingEnabled: false, seo: blankSeo(),
});
export const newStory = (): PortfolioStoryDraftInputDto => ({
  slug: '', title: blankText(), subtitle: blankText(), description: blankText(), serviceId: '', cover: null, seo: blankSeo(),
});

type FieldsProps<T> = { value: T; change: (value: T) => void; media: AdminPortfolioMediaDto[]; lockedSlug?: boolean };
type Option = { id: string; label: string };

const portfolioCategories = [
  { slug: 'love', label: 'Історія кохання' },
  { slug: 'portrait', label: 'Портретна фотосесія' },
  { slug: 'family', label: 'Сімейна фотосесія' },
  { slug: 'events', label: 'Події та лайфстайл' },
  { slug: 'brand', label: 'Брендова та комерційна зйомка' },
  { slug: 'pets', label: 'Фотосесія з улюбленцем' },
];

export const choices = (rows: AdminPortfolioSummaryDto[]) => rows.map(row => ({
  id: row.id, label: (row.title.uk || row.title.en || row.slug) + ' · ' + row.slug,
}));

function Choice({ label, name, options, value, change, required, disabled, added = [] }: {
  label: string; name: string; options: Option[]; value: string; change: (id: string) => void;
  required?: boolean; disabled?: boolean; added?: readonly string[];
}) {
  return <Field label={label} name={name}>{props => (
    <select {...props} value={value} required={required} disabled={disabled} onChange={e => change(e.target.value)}>
      <option value="" disabled>Оберіть запис</option>
      {value && !options.some(option => option.id === value) && <option value={value}>Поточний запис</option>}
      {options.map(option => {
        const inList = added.includes(option.id);
        return <option key={option.id} value={option.id} disabled={inList}>{option.label}{inList ? ' · додано' : ''}</option>;
      })}
    </select>
  )}</Field>;
}

function PlacementChoice({ label, name, options, added, limit, add }: {
  label: string; name: string; options: Option[]; added: readonly string[]; limit: number; add: (id: string) => void;
}) {
  const [lastAdded, setLastAdded] = useState('');
  const value = added.includes(lastAdded) ? lastAdded : added.at(-1) ?? '';
  const full = added.length >= limit;

  return <Choice label={label} name={name} value={value} options={options} added={added} disabled={full}
    change={id => {
      if (!id || full || added.includes(id)) return;
      setLastAdded(id);
      add(id);
    }} />;
}

function PortfolioAddressSelect({ label, placeholder, legacyLabel, errorMessage, value, change, locked, occupiedSlugs }: {
  label: string; placeholder: string; legacyLabel: string; errorMessage: string; value: string;
  change: (slug: string) => void; locked?: boolean; occupiedSlugs: readonly string[];
}) {
  return <Field label={label} name="slug" errorMessage={errorMessage}>{a11y => (
    <select {...a11y} value={value} required disabled={locked} onChange={e => change(e.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {value && !portfolioCategories.some(({ slug }) => slug === value) &&
        <option value={value}>{legacyLabel}</option>}
      {portfolioCategories.map(({ slug, label: optionLabel }) => {
        const occupied = occupiedSlugs.includes(slug);
        return <option key={slug} value={slug} disabled={occupied}>{optionLabel}{occupied ? ' · вже використано' : ''}</option>;
      })}
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

export function ServiceFields({ value, change, media, lockedSlug, occupiedSlugs }: FieldsProps<PortfolioServiceDraftInputDto> & {
  occupiedSlugs: readonly string[];
}) {
  return <>
    <PortfolioAddressSelect label="Тип фотосесії" placeholder="Оберіть тип фотосесії"
      errorMessage="Оберіть вільний тип фотосесії."
      legacyLabel="Раніше збережений тип" value={value.slug} locked={lockedSlug}
      occupiedSlugs={occupiedSlugs} change={slug => change({ ...value, slug })} />
    <Localized label="Назва" name="title" value={value.title} change={title => change({ ...value, title })} />
    <Localized label="Опис" name="description" value={value.description} max={4000} multiline change={description => change({ ...value, description })} />
    <ImageRef label="Фото напряму" name="cardImage" media={media} value={value.cardImage} change={cardImage => change({ ...value, cardImage })} />
    <fieldset className={panel}>
      <legend className="px-1 font-medium">Ціна й бронювання</legend>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={value.bookingEnabled} onChange={e => change({ ...value, bookingEnabled: e.target.checked })} />
        Дозволити бронювання
      </label>
      <Field label="Вказати ціну" name="price">{a11y => (
        <input {...a11y} className="size-5 aria-invalid:outline-2 aria-invalid:outline-red-700" type="checkbox" checked={value.price !== null}
          onChange={e => change({ ...value, price: e.target.checked ? { amountMinor: 0, currency: 'UAH', durationMinutes: 60 } : null })} />
      )}</Field>
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

export function StoryFields({ value, change, media, lockedSlug, services, occupiedSlugs }: FieldsProps<PortfolioStoryDraftInputDto> & {
  services: Option[]; occupiedSlugs: readonly string[];
}) {
  return <>
    <PortfolioAddressSelect label="Адреса історії" placeholder="Оберіть адресу історії"
      errorMessage="Оберіть вільну адресу. Щоб змінити наявну історію, відкрийте її зі списку чернеток."
      legacyLabel={'Поточна адреса · /stories/' + value.slug} value={value.slug} locked={lockedSlug}
      occupiedSlugs={occupiedSlugs} change={slug => change({ ...value, slug })} />
    <Choice label="Напрям" name="serviceId" options={services} value={value.serviceId} change={serviceId => change({ ...value, serviceId })} required />
    <Localized label="Назва" name="title" value={value.title} change={title => change({ ...value, title })} />
    <Localized label="Підзаголовок" name="subtitle" value={value.subtitle} max={200} change={subtitle => change({ ...value, subtitle })} />
    <Localized label="Опис" name="description" value={value.description} max={4000} multiline change={description => change({ ...value, description })} />

    <Seo value={value.seo} change={seo => change({ ...value, seo })} media={media} />
  </>;
}

const contactLabels = { email: 'Email', instagram: 'Instagram', telegram: 'Telegram' } as const;
const socialProfiles = {
  instagram: { prefix: 'https://www.instagram.com/', pattern: '[A-Za-z0-9_][A-Za-z0-9_.]{0,29}', hint: 'Латинські літери, цифри, крапки та підкреслення, до 30 символів.' },
  telegram: { prefix: 'https://t.me/', pattern: '[A-Za-z0-9_]{1,32}', hint: 'Латинські літери, цифри та підкреслення, до 32 символів.' },
} as const;

function ContactAddress({ contact, name, change }: {
  contact: PortfolioContactInputDto; name: string; change: (address: string) => void;
}) {
  const { type, address } = contact;
  if (type === 'email') return <Field label="Email · адреса" name={name}>{a11y => (
    <input {...a11y} className={input} type="email" autoComplete="email" value={address} maxLength={2048} required onChange={e => change(e.target.value)} />
  )}</Field>;

  const profile = socialProfiles[type];
  const username = address
    .replace(/^https:\/\/(?:www\.)?(?:instagram\.com|t\.me|telegram\.me)\//, '')
    .replace(/\/$/, '');
  return <Field label={contactLabels[type] + ' · нікнейм'} name={name}>{a11y => (
    <>
      <p id={a11y.id + '-hint'} className="break-all text-sm text-zinc-700">{profile.prefix} · {profile.hint}</p>
      <input {...a11y} aria-describedby={[a11y.id + '-hint', a11y['aria-describedby']].filter(Boolean).join(' ')}
        className={input} autoCapitalize="none" spellCheck={false} autoComplete="off"
        value={username} pattern={profile.pattern} title={profile.hint} required
        onChange={e => {
          const handle = e.target.value.trim().replace(/^@/, '');
          change(handle ? profile.prefix + handle : '');
        }} />
    </>
  )}</Field>;
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
    <Localized label="Вступ форми бронювання" name="bookingIntro" value={value.bookingIntro} max={4000} multiline change={bookingIntro => change({ ...value, bookingIntro })} />
    <ImageRef label="Головне фото · широке" name="hero.desktop" value={value.hero.desktop} media={media} change={desktop => change({ ...value, hero: { ...value.hero, desktop } })} />
    <ImageRef label="Головне фото · мобільне" name="hero.mobile" value={value.hero.mobile} media={media} change={mobile => change({ ...value, hero: { ...value.hero, mobile } })} />

    <fieldset className={panel}>
      <legend className="px-1 font-medium">Напрями на головній</legend>
      <Localized label="Заголовок напрямів" name="servicesSection.title" value={value.servicesSection.title}
        change={title => change({ ...value, servicesSection: { ...value.servicesSection, title } })} />
      <Localized label="Опис напрямів" name="servicesSection.description" value={value.servicesSection.description} max={4000} multiline
        change={description => change({ ...value, servicesSection: { ...value.servicesSection, description } })} />
      <PlacementChoice label="Додати напрям" name="servicesSection.serviceIds" options={services}
        added={serviceIds} limit={20} add={id => setServices([...serviceIds, id])} />
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
      <PlacementChoice label="Додати історію" name="storiesSection.items" options={stories}
        added={featured.map(item => item.storyId)} limit={12}
        add={storyId => setFeatured([...featured, { storyId, caption: blankText() }])} />
      <ol className="space-y-3">{featured.map(({ storyId, caption, image }, index) => {
        const name = stories.find(item => item.id === storyId)?.label ?? ('Історія ' + (index + 1));
        return <li key={storyId} className="space-y-2"><p>{name}</p>
          <Localized label="Підпис історії" name={'storiesSection.items.' + index + '.caption'} value={caption} max={4000} multiline
            change={next => setFeatured(featured.map(item => item.storyId === storyId ? { ...item, caption: next } : item))} />
          <ImageRef label="Окреме фото добірки" name={'storiesSection.items.' + index + '.image'} media={media} value={image ?? null}
            change={next => setFeatured(featured.map(item => item.storyId === storyId ? { ...item, image: next } : item))} />
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
        const label = contactLabels[type];
        const update = (next: typeof contact) => change({ ...value, contacts: value.contacts.map(item => item.type === type ? next : item) });
        return <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-3" key={type}>
          <legend className="px-1 font-medium">{label}</legend>
          {contact ? <>
            <ContactAddress contact={contact} name={'contacts.' + index + '.address'} change={address => update({ type, address, visible: contact.visible })} />
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={contact.visible}
              onChange={e => update({ ...contact, visible: e.target.checked })} /> Показувати {label}</label>
            <button type="button" className={button} onClick={() => change({ ...value, contacts: value.contacts.filter(item => item.type !== type) })}>Прибрати {label}</button>
          </> : <button type="button" className={button} onClick={() => change({ ...value, contacts: [...value.contacts, { type, address: '', visible: true }] })}>Додати {label}</button>}
        </fieldset>;
      })}
    </fieldset>
    <fieldset className={panel}>
      <legend className="px-1 font-medium">Секція бронювання</legend>
      <ImageRef label="Фонове фото" name="contactSection.background" value={value.contactSection.background}
        media={media} change={background => change({ ...value, contactSection: { ...value.contactSection, background } })} />
    </fieldset>
    <Seo value={value.seo} change={seo => change({ ...value, seo })} media={media} />
  </>;
}

