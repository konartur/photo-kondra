'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api/client';
import type {
  AdminPortfolioEntityBaseDto, AdminPortfolioServiceDto, AdminPortfolioSettingsDto, AdminPortfolioStoryDto,
  AdminPortfolioSummaryDto, PortfolioImageRefDto, PortfolioPublicationResponseDto, PortfolioStoryPhotoInputDto,
} from '@/lib/portfolio/contracts';
import { button, FieldErrors, panel, primary } from './editor-fields';
import { choices, HomeFields, newService, newStory, photoCount, PhotoFields, ServiceFields, StoryFields } from './editor-forms';
import { jsonRequest, PortfolioMediaLibrary, usePortfolioMedia } from './portfolio-media-library';
import { PortfolioPreview } from './portfolio-preview';

type Entity = AdminPortfolioServiceDto | AdminPortfolioStoryDto | AdminPortfolioSettingsDto;
type Draft = Entity['draft'];
type Resource = 'services' | 'stories' | 'settings';
type Section = Resource | 'media';

const prefix = '/api/portfolio/';
const queryPrefix = ['portfolio-admin'] as const;
const names: Record<Section, string> = { services: 'Напрями', stories: 'Історії', settings: 'Головна та контакти', media: 'Медіа' };
const statuses: Record<AdminPortfolioEntityBaseDto['status'], string> = { DRAFT: 'Чернетка', PUBLISHED: 'Опубліковано', ARCHIVED: 'В архіві' };
const storyServiceUnpublished = 'Спочатку опублікуйте напрям, до якого належить ця історія.';

function useEntries(resource: 'services' | 'stories', enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...queryPrefix, resource],
    enabled,
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => apiRequest<{ items: AdminPortfolioSummaryDto[]; nextCursor: string | null }>(
      prefix + resource + '?limit=50' + (pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''), { signal, cache: 'no-store' },
    ),
    getNextPageParam: result => result.nextCursor ?? undefined,
    retry: false,
  });
}

function ListMore({ query, label }: { query: ReturnType<typeof useEntries>; label: string }) {
  return <div className="flex flex-wrap gap-2">
    {query.isError && <button className={button} type="button" onClick={() => void query.refetch()}>Повторити · {label}</button>}
    {query.hasNextPage && <button className={button} type="button" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>Більше · {label}</button>}
  </div>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function requiredDraftFields(draft: Draft, photos: readonly PortfolioStoryPhotoInputDto[] = []) {
  const missing: string[] = [];
  const text = (name: string, value: string) => { if (!value.trim()) missing.push(name); };
  const localized = (name: string, value: { uk: string; en: string }) => {
    text(name + '.uk', value.uk);
    text(name + '.en', value.en);
  };
  const image = (name: string, value: PortfolioImageRefDto | null) => {
    if (value) localized(name + '.alt', value.alt);
    else missing.push(name + '.mediaId');
  };

  localized('seo.title', draft.seo.title);
  localized('seo.description', draft.seo.description);
  if (draft.seo.shareImage) image('seo.shareImage', draft.seo.shareImage);
  if ('brand' in draft) {
    localized('bookingIntro', draft.bookingIntro);
    image('hero.desktop', draft.hero.desktop);
    image('hero.mobile', draft.hero.mobile);
    localized('servicesSection.title', draft.servicesSection.title);
    localized('servicesSection.description', draft.servicesSection.description);
    localized('storiesSection.title', draft.storiesSection.title);
    if (!draft.servicesSection.serviceIds.length) missing.push('servicesSection.serviceIds');
    if (!draft.storiesSection.items.length) missing.push('storiesSection.items');
    draft.storiesSection.items.forEach((item, index) => {
      const name = 'storiesSection.items.' + index;
      localized(name + '.caption', item.caption);
      if (item.image) image(name + '.image', item.image);
    });
    image('contactSection.background', draft.contactSection.background);
    draft.contacts.forEach((contact, index) => text('contacts.' + index + '.address', contact.address));
  } else {
    text('slug', draft.slug);
    localized('title', draft.title);
    localized('description', draft.description);
    if ('cover' in draft) {
      text('serviceId', draft.serviceId);
      localized('subtitle', draft.subtitle);
      image('cover', draft.cover);
      if (!photos.length) missing.push('items');
      photos.forEach((photo, index) => image('items.' + index + '.image', photo.image));
    } else {
      image('cardImage', draft.cardImage);
      if (draft.bookingEnabled && !draft.price) missing.push('price');
    }
  }
  return missing;
}

function occupiedSlugMessage(resource: Resource) {
  return resource === 'stories'
    ? 'Цю адресу вже використовує інша історія.'
    : 'Цей тип фотосесії вже використовується.';
}

function describeFailure(error: unknown, resource: Resource) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'PORTFOLIO_VERSION_CONFLICT': return 'Чернетку змінили в іншій сесії. Ваші зміни збережені у формі.';
      case 'PORTFOLIO_NOT_READY': return 'Заповніть обидві мови, перевірте готовність медіа й публікацію пов’язаних записів.';
      case 'PORTFOLIO_STORY_SERVICE_UNPUBLISHED': return storyServiceUnpublished;
      case 'PORTFOLIO_CONTENT_REFERENCED': return 'Запис ще використовується опублікованим контентом. Спочатку приберіть це посилання.';
      case 'PORTFOLIO_SLUG_IMMUTABLE': return 'Це поле зафіксовано після першої публікації.';
      case 'PORTFOLIO_SLUG_TAKEN': return occupiedSlugMessage(resource);
      case 'VALIDATION_FAILED': return 'Перевірте поля чернетки.';
    }
    if (error.status === 401) return 'Сесію завершено. Увійдіть повторно.';
  }
  return 'Не вдалося виконати дію. Спробуйте ще раз.';
}

function Editor({ resource, initial, media, services, stories, onDirty, onCreated, onOpenService }: {
  resource: Resource; initial?: Entity;
  media: ReturnType<typeof usePortfolioMedia>;
  services: ReturnType<typeof useEntries>;
  stories: ReturnType<typeof useEntries>;
  onDirty: (dirty: boolean) => void;
  onCreated: (id: string) => void;
  onOpenService: (id: string) => void;
}) {
  const client = useQueryClient();
  const [record, setRecord] = useState<Entity | undefined>(initial);
  const [draft, setDraft] = useState<Draft>(() => initial?.draft ?? (resource === 'stories' ? newStory() : newService()));
  const [photos, setPhotos] = useState<PortfolioStoryPhotoInputDto[]>(() => initial && 'photos' in initial ? initial.photos : []);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  const editorRef = useRef<HTMLDivElement>(null);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Entity | null>(null);
  const path = prefix + resource + (resource !== 'settings' && record ? '/' + record.id : '');
  const savedPhotos = record && 'photos' in record ? record.photos : [];
  const draftDirty = !same(draft, record?.draft ?? (resource === 'stories' ? newStory() : newService()));
  const photosDirty = !same(photos, savedPhotos);
  const dirty = draftDirty || photosDirty;
  const serviceRows = services.data?.pages.flatMap(page => page.items) ?? [];
  const storyService = 'serviceId' in draft ? serviceRows.find(item => item.id === draft.serviceId) : undefined;
  const publicationBlocked = storyService !== undefined && storyService.status !== 'PUBLISHED';
  const storyRows = stories.data?.pages.flatMap(page => page.items) ?? [];
  const mediaRows = media.data?.pages.flatMap(page => page.items) ?? [];
  const occupiedSlugs = (resource === 'stories' ? storyRows : serviceRows)
    .filter(item => item.id !== record?.id)
    .map(item => item.slug);

  useEffect(() => {
    onDirty(dirty);
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, onDirty]);

  useEffect(() => {
    if (pending || !fieldErrors.length) return;
    const field = editorRef.current?.querySelector<HTMLElement>('[data-portfolio-field][aria-invalid="true"]:not(:disabled)');
    if (!field) return;
    for (let parent = field.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    field.scrollIntoView({ block: 'center', behavior: 'instant' });
    field.focus({ preventScroll: true });
  }, [fieldErrors, pending]);

  function hasInvalidFields(form: ParentNode, missing: readonly string[] = [],
    message = 'Перевірте виділені поля.', selector = '[data-portfolio-field]:invalid') {
    // Descendants include cover/photo controls inside collapsed details in the draft form.
    const invalid = Array.from(form.querySelectorAll<HTMLElement>(selector),
      field => field.getAttribute('data-portfolio-field')!);
    if (!invalid.length && !missing.length) return false;
    setNotice('');
    setProblem(message);
    setFieldErrors([...invalid, ...missing]);
    return true;
  }

  async function run(action: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setNotice('');
    setProblem('');
    setFieldErrors([]);
    try {
      await action();
    } catch (error) {
      setProblem(describeFailure(error, resource));
      if (error instanceof ApiError) {
        setFieldErrors(error.code === 'PORTFOLIO_SLUG_TAKEN' ? ['slug'] : error.fields);
        if (error.code === 'PORTFOLIO_SLUG_TAKEN')
          void client.invalidateQueries({ queryKey: [...queryPrefix, resource], exact: true });
        if (error.code === 'PORTFOLIO_STORY_SERVICE_UNPUBLISHED')
          void client.invalidateQueries({ queryKey: [...queryPrefix, 'services'], exact: true });
        if (error.code === 'PORTFOLIO_VERSION_CONFLICT' || error.status === 409 && !error.code) {
          setConflict(true);
          setLatest(null);
        }
      }
    } finally { pendingRef.current = false; setPending(false); }
  }

  function updateRecord(next: Entity) {
    setRecord(next);
    if (resource !== 'settings') client.setQueryData([...queryPrefix, resource, next.id], next);
    else client.setQueryData([...queryPrefix, resource, 'singleton'], next);
    void client.invalidateQueries({ queryKey: queryPrefix });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || conflict) return;
    const occupied = 'slug' in draft && occupiedSlugs.includes(draft.slug);
    // Drafts require structural keys only; empty alt/translations are checked on publish.
    const missing: string[] = [];
    if ('slug' in draft && !draft.slug.trim()) missing.push('slug');
    if ('serviceId' in draft && !draft.serviceId) missing.push('serviceId');
    if (occupied) missing.push('slug');
    if (hasInvalidFields(event.currentTarget, missing, occupied ? occupiedSlugMessage(resource) : undefined)) return;
    if ('cover' in draft && photoCount(photos, draft.cover?.mediaId) > 10) {
      setProblem('Оберіть не більше 10 унікальних фото разом з обкладинкою.');
      return;
    }
    void run(async () => {
      const completeStory = resource === 'stories';
      const payload = completeStory ? { data: draft, items: photos } : { data: draft };
      const request = record ? jsonRequest('PUT', { expectedVersion: record.draftVersion, ...payload })
        : jsonRequest('POST', completeStory ? payload : draft);
      const next = await apiRequest<Entity>(path + (completeStory ? '/draft' : ''), request);
      updateRecord(next);
      setDraft(next.draft);
      if ('photos' in next) setPhotos(next.photos);
      setNotice(completeStory ? 'Чернетку історії збережено: опис, обкладинку, фото та порядок.' : 'Чернетку збережено.');
      if (!record) onCreated(next.id);
    });
  }

  function lifecycle(action: 'publish' | 'archive') {
    if (!record || dirty || pending || conflict) return;
    const draftForm = editorRef.current?.querySelector('form');
    if (action === 'publish' && draftForm && hasInvalidFields(draftForm, requiredDraftFields(draft, photos))) return;
    if (action === 'archive' && !window.confirm('Прибрати цей запис з публічного портфоліо?')) return;
    void run(async () => {
      const result = await apiRequest<PortfolioPublicationResponseDto>(path + '/' + action,
        jsonRequest('POST', { expectedVersion: record.draftVersion }));
      const next = {
        ...record, status: result.status, draftVersion: result.draftVersion, publishedVersion: result.publishedVersion,
        publishedAt: result.publishedAt, hasUnpublishedChanges: result.draftVersion !== result.publishedVersion,
      };
      updateRecord(next);
      setNotice(action === 'publish' ? 'Опубліковано.' : 'Запис перенесено в архів.');
    });
  }

  function resolveConflict(keepEdits: boolean) {
    if (!latest) return;
    if (keepEdits && !window.confirm('Наступне збереження замінить відповідні поля новішої чернетки. Використати її версію зі своїми змінами?')) return;
    updateRecord(latest);
    if (!keepEdits || !draftDirty) setDraft(latest.draft);
    if (!keepEdits || !photosDirty) setPhotos('photos' in latest ? latest.photos : []);
    setConflict(false); setLatest(null); setProblem(''); setFieldErrors([]);
  }

  return <div ref={editorRef} className="min-w-0 space-y-4">
    <section className={panel} aria-label="Стан чернетки">
      <h3 className="text-lg font-semibold">{record ? 'Редагування' : 'Нова чернетка'}</h3>
      <p className="text-sm text-zinc-700" role="status">
        {record ? statuses[record.status] + ' · збережена v' + record.draftVersion +
          (record.publishedVersion === null ? ' · ще не публікувалась' : ' · версія публікації v' + record.publishedVersion) : 'Ще не збережено'}
        {dirty ? ' · є незбережені зміни' : record?.hasUnpublishedChanges ? ' · є неопубліковані зміни' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={primary} type="button" disabled={!record || dirty || conflict || pending || publicationBlocked || record.status === 'PUBLISHED' && !record.hasUnpublishedChanges}
          onClick={() => lifecycle('publish')}>Опублікувати</button>
        <button className={button} type="button" disabled={!record || dirty || conflict || pending || record.status === 'ARCHIVED'}
          onClick={() => lifecycle('archive')}>Архівувати</button>
      </div>
      {publicationBlocked && <div className="flex flex-wrap items-center gap-2 text-sm">
        {problem !== storyServiceUnpublished && <p>{storyServiceUnpublished}</p>}
        <button className={button} type="button" onClick={() => onOpenService(storyService.id)}>Відкрити напрям</button>
      </div>}
      {pending && <p role="status">Зберігаємо зміни…</p>}
      {notice && <p role="status">{notice}</p>}
      {problem && <p role="alert" className="text-red-700">{problem}</p>}
      {conflict && record && <div className="space-y-2">
        <button className={button} type="button" disabled={pending} onClick={() => void run(async () => setLatest(await apiRequest<Entity>(path, { cache: 'no-store' })))}>Звірити збережену версію</button>
        {latest && <details open className="space-y-2">
          <summary>Поточна версія v{latest.draftVersion}</summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-zinc-200 p-2 text-sm">{JSON.stringify({ ...latest.draft, ...('photos' in latest ? { photos: latest.photos } : {}) }, null, 2)}</pre>
          <div className="flex flex-wrap gap-2">
            <button className={button} type="button" onClick={() => resolveConflict(true)}>Зберегти мої правки у формі</button>
            <button className={button} type="button" onClick={() => resolveConflict(false)}>Завантажити серверну чернетку</button>
          </div>
        </details>}
      </div>}
    </section>
    <FieldErrors.Provider value={fieldErrors}>
      <form className={panel} onSubmit={save} noValidate aria-label="Поля чернетки">
        <fieldset disabled={pending} className="space-y-4">
          {'brand' in draft ? <HomeFields value={draft} change={setDraft} media={mediaRows}
            services={choices(serviceRows.filter(item => item.status === 'PUBLISHED'))}
            stories={choices(storyRows.filter(item => item.status === 'PUBLISHED'))}
          /> : 'serviceId' in draft ? <StoryFields value={draft} change={setDraft} media={mediaRows}
            services={choices(serviceRows)} lockedSlug={record?.publishedVersion != null}
            occupiedSlugs={occupiedSlugs}
          /> : <ServiceFields value={draft} change={setDraft} media={mediaRows} lockedSlug={record?.publishedVersion != null}
            occupiedSlugs={occupiedSlugs} />}
          {resource !== 'services' && <ListMore query={services} label="напрями" />}
          {resource === 'settings' && <ListMore query={stories} label="історії" />}
          <p className="text-sm text-zinc-700">Чернетку можна зберегти без фото, перекладів та завершених текстів. Їх потрібно заповнити перед публікацією.</p>
          {resource === 'stories' && 'cover' in draft && <section className="space-y-4" aria-label="Фото та обкладинка історії">
            <h3 className="font-semibold">Фото та обкладинка історії</h3>
            <PhotoFields value={photos} change={setPhotos} media={mediaRows} cover={draft.cover}
              changeCover={cover => setDraft({ ...draft, cover })} />
          </section>}
          <button className={primary} type="submit" disabled={pending || conflict || Boolean(record && !dirty)}>
            Зберегти чернетку
          </button>
        </fieldset>
      </form>
    </FieldErrors.Provider>
    {record && <PortfolioPreview key={record.id + ':' + record.draftVersion} path={path} version={record.draftVersion} onInvalidFields={setFieldErrors} />}
  </div>;
}

export function PortfolioWorkspace() {
  const [section, setSection] = useState<Section>('services');
  const [id, setId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const media = usePortfolioMedia();
  const services = useEntries('services', section === 'services' || section === 'stories' || section === 'settings');
  const stories = useEntries('stories', section === 'stories' || section === 'settings');
  const sectionList = section === 'services' ? services : stories;
  const rows = sectionList.data?.pages.flatMap(page => page.items) ?? [];
  const editing = section !== 'media' && (section === 'settings' || Boolean(id));
  const record = useQuery({
    queryKey: [...queryPrefix, section, id ?? 'singleton'],
    enabled: editing && id !== 'new',
    queryFn: ({ signal }) => apiRequest<Entity>(prefix + section + (id ? '/' + id : ''), { signal, cache: 'no-store' }),
    retry: false,
  });

  function navigate(next: Section, account: string | null = null) {
    if (next === section && id === account) return;
    if (dirty && !window.confirm('Залишити редактор без збереження введених змін?')) return;
    setDirty(false); setSection(next); setId(account);
  }

  return <section className="mx-auto max-w-5xl space-y-5 pt-8 text-zinc-950">
    <div>
      <h2 className="text-2xl font-semibold">Портфоліо</h2>
      <p className="mt-1 text-sm text-zinc-700">Дві мови, чернетки та публікація.</p>
    </div>
    <nav className="flex flex-wrap gap-2" aria-label="Розділи портфоліо">
      {(Object.keys(names) as Section[]).map(name => <button key={name} type="button"
        className={name === section ? primary : button} aria-current={name === section ? 'page' : undefined} onClick={() => navigate(name)}>
        {names[name]}
      </button>)}
    </nav>
    {section === 'media' && <PortfolioMediaLibrary />}
    {(section === 'services' || section === 'stories') && <div className={panel}>
      <h3 className="font-semibold">{names[section]}</h3>
      <label className="block space-y-1 text-sm font-medium">Вибрати запис
        <select value={id ?? ''} onChange={e => navigate(section, e.target.value || null)}>
          <option value="">Оберіть чернетку чи публікацію</option>
          {id === 'new' && <option value="new">Новий запис</option>}
          {rows.map(row => <option value={row.id} key={row.id}>{row.title.uk || row.title.en || row.slug} · {statuses[row.status]}</option>)}
        </select>
      </label>
      {sectionList.isPending && <p role="status">Завантажуємо список…</p>}
      {sectionList.isError && <p role="alert">Список недоступний.</p>}
      {sectionList.isSuccess && !rows.length && <p>У цьому розділі ще немає записів.</p>}
      <button type="button" className={button} onClick={() => navigate(section, 'new')}>Створити {section === 'services' ? 'напрям' : 'історію'}</button>
      <ListMore query={sectionList} label={names[section]} />
    </div>}
    {editing && id !== 'new' && record.isPending && <p role="status">Завантажуємо чернетку…</p>}
    {editing && id !== 'new' && record.isError && <p role="alert">Чернетка недоступна. <button className={button} type="button" onClick={() => void record.refetch()}>Повторити</button></p>}
    {editing && (id === 'new' || record.data) && <Editor
      key={section + ':' + (id ?? 'settings')} resource={section} initial={id === 'new' ? undefined : record.data}
      media={media} services={services} stories={stories} onDirty={setDirty} onCreated={setId}
      onOpenService={serviceId => navigate('services', serviceId)}
    />}
  </section>;
}

