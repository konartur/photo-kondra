'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api/client';
import type {
  AdminPortfolioEntityBaseDto, AdminPortfolioServiceDto, AdminPortfolioSettingsDto, AdminPortfolioStoryDto,
  AdminPortfolioSummaryDto, PortfolioPublicationResponseDto, PortfolioStoryPhotoInputDto,
} from '@/lib/portfolio/contracts';
import { button, FieldErrors, input, panel, primary } from './editor-fields';
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
function describeFailure(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'PORTFOLIO_VERSION_CONFLICT': return 'Чернетку змінили в іншій сесії. Ваші зміни збережені у формі.';
      case 'PORTFOLIO_NOT_READY': return 'Заповніть обидві мови, перевірте готовність медіа й публікацію пов’язаних записів.';
      case 'PORTFOLIO_CONTENT_REFERENCED': return 'Запис ще використовується опублікованим контентом. Спочатку приберіть це посилання.';
      case 'PORTFOLIO_SLUG_IMMUTABLE': return 'Slug зафіксовано після першої публікації.';
      case 'VALIDATION_FAILED': return 'Перевірте поля чернетки.';
    }
    if (error.status === 401) return 'Сесію завершено. Увійдіть повторно.';
  }
  return 'Не вдалося виконати дію. Спробуйте ще раз.';
}

function Editor({ resource, initial, media, services, stories, onDirty, onCreated }: {
  resource: Resource; initial?: Entity;
  media: ReturnType<typeof usePortfolioMedia>;
  services: ReturnType<typeof useEntries>;
  stories: ReturnType<typeof useEntries>;
  onDirty: (dirty: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const client = useQueryClient();
  const [record, setRecord] = useState<Entity | undefined>(initial);
  const [draft, setDraft] = useState<Draft>(() => initial?.draft ?? (resource === 'stories' ? newStory() : newService()));
  const [photos, setPhotos] = useState<PortfolioStoryPhotoInputDto[]>(() => initial && 'photos' in initial ? initial.photos : []);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Entity | null>(null);
  const path = prefix + resource + (resource !== 'settings' && record ? '/' + record.id : '');
  const savedPhotos = record && 'photos' in record ? record.photos : [];
  const savedCover = record && 'cover' in record.draft ? record.draft.cover?.mediaId : undefined;
  const draftDirty = !same(draft, record?.draft ?? (resource === 'stories' ? newStory() : newService()));
  const photosDirty = !same(photos, savedPhotos);
  const dirty = draftDirty || photosDirty;
  const serviceRows = services.data?.pages.flatMap(page => page.items) ?? [];
  const storyRows = stories.data?.pages.flatMap(page => page.items) ?? [];
  const mediaRows = media.data?.pages.flatMap(page => page.items) ?? [];

  useEffect(() => {
    onDirty(dirty);
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, onDirty]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setNotice('');
    setProblem('');
    setFieldErrors([]);
    try {
      await action();
    } catch (error) {
      setProblem(describeFailure(error));
      if (error instanceof ApiError) {
        setFieldErrors(error.fields);
        if (error.code === 'PORTFOLIO_VERSION_CONFLICT' || error.status === 409 && !error.code) {
          setConflict(true);
          setLatest(null);
        }
      }
    } finally { setPending(false); }
  }

  function updateRecord(next: Entity) {
    setRecord(next);
    if (resource !== 'settings') client.setQueryData([...queryPrefix, resource, next.id], next);
    else client.setQueryData([...queryPrefix, resource, 'singleton'], next);
    void client.invalidateQueries({ queryKey: queryPrefix });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (pending || conflict) return;
    if ('cover' in draft && photoCount(savedPhotos, draft.cover?.mediaId) > 10) {
      setProblem('Нова обкладинка перевищує ліміт. Спочатку скоротіть і збережіть поточний список фото.');
      return;
    }
    void run(async () => {
      const request = record ? jsonRequest('PUT', { expectedVersion: record.draftVersion, data: draft }) : jsonRequest('POST', draft);
      const next = await apiRequest<Entity>(path, request);
      updateRecord(next);
      setDraft(next.draft);
      setNotice('Чернетку збережено.');
      if (!record) onCreated(next.id);
    });
  }

  function savePhotos(event: FormEvent) {
    event.preventDefault();
    if (!record || pending || conflict) return;
    if (!photos.length || photoCount(photos, savedCover) > 10) {
      setProblem('Додайте щонайменше одне фото. Разом зі збереженою обкладинкою допускається до 10 унікальних фото.');
      return;
    }
    void run(async () => {
      const next = await apiRequest<AdminPortfolioStoryDto>(path + '/photos', jsonRequest('PUT', { expectedVersion: record.draftVersion, items: photos }));
      updateRecord(next);
      setPhotos(next.photos);
      setNotice('Порядок фото збережено.');
    });
  }

  function lifecycle(action: 'publish' | 'archive') {
    if (!record || dirty || pending || conflict) return;
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

  return <div className="min-w-0 space-y-4">
    <section className={panel} aria-label="Стан чернетки">
      <h3 className="text-lg font-semibold">{record ? 'Редагування' : 'Нова чернетка'}</h3>
      <p className="text-sm text-zinc-700" role="status">
        {record ? statuses[record.status] + ' · збережена v' + record.draftVersion +
          (record.publishedVersion === null ? ' · ще не публікувалась' : ' · версія публікації v' + record.publishedVersion) : 'Ще не збережено'}
        {dirty ? ' · є незбережені зміни' : record?.hasUnpublishedChanges ? ' · є неопубліковані зміни' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={primary} type="button" disabled={!record || dirty || conflict || pending || record.status === 'PUBLISHED' && !record.hasUnpublishedChanges}
          onClick={() => lifecycle('publish')}>Опублікувати</button>
        <button className={button} type="button" disabled={!record || dirty || conflict || pending || record.status === 'ARCHIVED'}
          onClick={() => lifecycle('archive')}>Архівувати</button>
      </div>
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
      <form className={panel} onSubmit={save} aria-label="Поля чернетки">
        <fieldset disabled={pending} className="space-y-4">
          {'brand' in draft ? <HomeFields value={draft} change={setDraft} media={mediaRows}
            services={choices(serviceRows.filter(item => item.status === 'PUBLISHED'))}
            stories={choices(storyRows.filter(item => item.status === 'PUBLISHED'))}
          /> : 'serviceId' in draft ? <StoryFields value={draft} change={setDraft} media={mediaRows}
            services={choices(serviceRows)} lockedSlug={record?.publishedVersion != null}
          /> : <ServiceFields value={draft} change={setDraft} media={mediaRows} lockedSlug={record?.publishedVersion != null} />}
          {resource !== 'services' && <ListMore query={services} label="напрями" />}
          {resource === 'settings' && <ListMore query={stories} label="історії" />}
          <button className={primary} type="submit" disabled={pending || conflict || Boolean(record && !draftDirty)}>Зберегти чернетку</button>
        </fieldset>
      </form>
      {resource === 'stories' && record && <form className={panel} onSubmit={savePhotos} aria-label="Порядок фото">
        <fieldset disabled={pending} className="space-y-4">
          <legend className="font-semibold">Фото історії</legend>
          <PhotoFields value={photos} change={setPhotos} media={mediaRows} coverId={savedCover} />
          <button className={primary} type="submit" disabled={pending || conflict || !photosDirty}>Зберегти порядок фото</button>
        </fieldset>
      </form>}
    </FieldErrors.Provider>
    {record && <PortfolioPreview key={record.id + ':' + record.draftVersion} path={path} version={record.draftVersion} />}
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
    <PortfolioMediaLibrary query={media} library={section === 'media'} />
    {(section === 'services' || section === 'stories') && <div className={panel}>
      <h3 className="font-semibold">{names[section]}</h3>
      <label className="block space-y-1 text-sm font-medium">Вибрати запис
        <select className={input} value={id ?? ''} onChange={e => navigate(section, e.target.value || null)}>
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
    />}
  </section>;
}
