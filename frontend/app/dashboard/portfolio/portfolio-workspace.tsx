'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api/client';
import type {
  AdminPortfolioEntityBaseDto,
  AdminPortfolioServiceDto,
  AdminPortfolioSettingsDto,
  AdminPortfolioStoryDto,
  AdminPortfolioSummaryDto,
  PortfolioPublicationResponseDto,
  PortfolioStoryPhotoInputDto,
} from '@/lib/portfolio/contracts';
import { PortfolioEntryRow } from './portfolio-entry-list';
import { button, EditorLocale, FieldErrors, panel, primary } from './editor-fields';
import {
  choices,
  HomeFields,
  newService,
  newStory,
  photoCount,
  PhotoFields,
  ServiceFields,
  StoryFields,
} from './editor-forms';
import { jsonRequest, PortfolioMediaLibrary, usePortfolioMedia } from './portfolio-media-library';
import { PortfolioPreview, type PortfolioPreviewData } from './portfolio-preview';
import {
  describePortfolioField,
  requiredDraftFields,
  translationProgress,
  usePortfolioReadiness,
} from './portfolio-editor-readiness';
import styles from './portfolio-editor.module.css';
import { deriveEditorStatus, retainUnchangedFieldErrors } from './portfolio-editor-state';
import { mediaKey } from './portfolio-media-data';
import { publicUrl } from '@/lib/portfolio/public-url';
import { usePortfolioNavigation, type PortfolioSection } from './portfolio-navigation-state';
import { portfolioSiteSettings } from '@/lib/portfolio/site-settings';

type Entity = AdminPortfolioServiceDto | AdminPortfolioStoryDto | AdminPortfolioSettingsDto;
type Draft = Entity['draft'];
type Resource = 'services' | 'stories' | 'settings';
type Section = PortfolioSection;

const prefix = '/api/portfolio/';
const queryPrefix = ['portfolio-admin'] as const;
const names: Record<Section, string> = {
  services: 'Фотосесії',
  stories: 'Історії',
  settings: 'Головна сторінка',
  contacts: 'Контакти та запис',
  media: 'Фотобібліотека',
};
const statuses: Record<AdminPortfolioEntityBaseDto['status'], string> = {
  DRAFT: 'Чернетка',
  PUBLISHED: 'Опубліковано',
  ARCHIVED: 'В архіві',
};
const storyServiceUnpublished = 'Спочатку опублікуйте напрям, до якого належить ця історія.';

function useEntries(resource: 'services' | 'stories', enabled: boolean, search = '', status = '') {
  return useInfiniteQuery({
    queryKey: [...queryPrefix, resource, 'list', search.trim(), status],
    enabled,
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      apiRequest<{ items: AdminPortfolioSummaryDto[]; nextCursor: string | null }>(
        prefix +
          resource +
          '?limit=24&search=' +
          encodeURIComponent(search.trim()) +
          (status ? '&status=' + status : '') +
          (pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''),
        { signal, cache: 'no-store' },
      ),
    getNextPageParam: (result) => result.nextCursor ?? undefined,
    retry: false,
  });
}

function ListMore({ query, label }: { query: ReturnType<typeof useEntries>; label: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {query.isError && (
        <button className={button} type="button" onClick={() => void query.refetch()}>
          Повторити · {label}
        </button>
      )}
      {query.hasNextPage && (
        <button
          className={button}
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Більше · {label}
        </button>
      )}
    </div>
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function occupiedSlugMessage(resource: Resource) {
  return resource === 'stories'
    ? 'Цю адресу вже використовує інша історія.'
    : 'Цей тип фотосесії вже використовується.';
}

function describeFailure(error: unknown, resource: Resource) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'PORTFOLIO_VERSION_CONFLICT':
        return 'Чернетку змінили в іншій сесії. Ваші зміни збережені у формі.';
      case 'PORTFOLIO_NOT_READY':
        return 'Заповніть обидві мови, перевірте готовність медіа й публікацію пов’язаних записів.';
      case 'PORTFOLIO_STORY_SERVICE_UNPUBLISHED':
        return storyServiceUnpublished;
      case 'PORTFOLIO_CONTENT_REFERENCED':
        return 'Запис ще використовується опублікованим контентом. Спочатку приберіть це посилання.';
      case 'PORTFOLIO_SLUG_IMMUTABLE':
        return 'Це поле зафіксовано після першої публікації.';
      case 'PORTFOLIO_SLUG_TAKEN':
        return occupiedSlugMessage(resource);
      case 'VALIDATION_FAILED':
        return 'Перевірте поля чернетки.';
    }
    if (error.status === 401) return 'Сесію завершено. Увійдіть повторно.';
  }
  return 'Не вдалося виконати дію. Спробуйте ще раз.';
}

function Editor({
  resource,
  initial,
  media,
  services,
  stories,
  onDirty,
  onCreated,
  onOpenService,
  settingsView = 'home',
  onSettingsView,
}: {
  resource: Resource;
  settingsView?: 'home' | 'contacts';
  onSettingsView: (view: 'home' | 'contacts') => void;
  initial?: Entity;
  media: ReturnType<typeof usePortfolioMedia>;
  services: ReturnType<typeof useEntries>;
  stories: ReturnType<typeof useEntries>;
  onDirty: (dirty: boolean) => void;
  onCreated: (id: string) => void;
  onOpenService: (id: string) => void;
}) {
  const client = useQueryClient();
  const [record, setRecord] = useState<Entity | undefined>(initial);
  const [draft, setDraft] = useState<Draft>(
    () => initial?.draft ?? (resource === 'stories' ? newStory() : newService()),
  );
  const [photos, setPhotos] = useState<PortfolioStoryPhotoInputDto[]>(() =>
    initial && 'photos' in initial ? initial.photos : [],
  );
  const [locale, setLocale] = useState<'uk' | 'en'>('uk');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const [readinessProblem, setReadinessProblem] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  const editorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const toolbarRef = useRef<HTMLElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  const [preview, setPreview] = useState<PortfolioPreviewData | null>(null);
  const [operation, setOperation] = useState<
    'save' | 'preview' | 'save-preview' | 'publish' | 'archive' | 'conflict'
  >('save');
  const [conflict, setConflict] = useState(false);
  const currentRecord = useRef(initial);
  const [latest, setLatest] = useState<Entity | null>(null);
  const path = prefix + resource + (resource !== 'settings' && record ? '/' + record.id : '');
  const savedPhotos = record && 'photos' in record ? record.photos : [];
  const draftDirty = !same(
    draft,
    record?.draft ?? (resource === 'stories' ? newStory() : newService()),
  );
  const photosDirty = !same(photos, savedPhotos);
  const dirty = draftDirty || photosDirty;
  const serviceRows = services.data?.pages.flatMap((page) => page.items) ?? [];
  const storyRows = stories.data?.pages.flatMap((page) => page.items) ?? [];
  const mediaRows = media.data?.pages.flatMap((page) => page.items) ?? [];
  const readiness = usePortfolioReadiness(draft, photos, mediaRows, serviceRows, storyRows);
  const knownFields = new Set(readiness.issues.map((issue) => issue.field));
  const checklist = [
    ...readiness.issues,
    ...[...new Set(fieldErrors.map((field) => field.replace(/^data\./, '')))]
      .filter((field) => !knownFields.has(field))
      .map((field) => ({
        field,
        label: describePortfolioField(field),
        message: 'Перевірте значення поля',
      })),
  ];
  const needsSave = !record || dirty;
  const { statusText, publishReason, canPublish, publishedClean } = deriveEditorStatus({
    record,
    dirty,
    conflict,
    readiness,
    checklist,
    pending,
  });
  const editorTitle =
    'title' in draft ? draft.title.uk || draft.title.en || 'Новий запис' : 'Головна та контакти';
  const occupiedSlugs = (resource === 'stories' ? storyRows : serviceRows)
    .filter((item) => item.id !== record?.id)
    .map((item) => item.slug);

  useEffect(() => {
    onDirty(dirty);
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, onDirty]);

  useEffect(() => {
    const root = editorRef.current;
    const toolbar = toolbarRef.current;
    const actions = actionsRef.current;
    if (!root || !toolbar || !actions) return;
    const measure = () => {
      root.style.setProperty(
        '--portfolio-actions-height',
        actions.getBoundingClientRect().height + 'px',
      );
      root.style.setProperty(
        '--portfolio-toolbar-height',
        toolbar.getBoundingClientRect().height + 'px',
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    observer.observe(actions);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (pending || !fieldErrors.length) return;
    const field = editorRef.current?.querySelector<HTMLElement>(
      '[data-portfolio-field][aria-invalid="true"]:not(:disabled)',
    );
    if (!field) return;
    for (let parent = field.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    focusField(field.getAttribute('data-portfolio-field')!);
  }, [fieldErrors, pending]);

  function hasInvalidFields(
    form: ParentNode,
    missing: readonly string[] = [],
    message = 'Перевірте виділені поля.',
    selector = '[data-portfolio-field]:invalid',
  ) {
    // Descendants include cover/photo controls inside collapsed details in the draft form.
    const invalid = Array.from(form.querySelectorAll<HTMLElement>(selector), (field) =>
      field.getAttribute('data-portfolio-field')!,
    );
    if (!invalid.length && !missing.length) return false;
    setNotice('');
    setProblem(message);
    setFieldErrors([...invalid, ...missing]);
    return true;
  }

  async function run(action: () => Promise<void>, kind: typeof operation = 'save') {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setOperation(kind);
    setPending(true);
    setNotice('');
    setProblem('');
    setReadinessProblem(false);
    setFieldErrors([]);
    try {
      await action();
    } catch (error) {
      setProblem(describeFailure(error, resource));
      if (error instanceof ApiError) {
        const notReady =
          error.status === 409 &&
          (error.code === 'PORTFOLIO_NOT_READY' ||
            error.code === 'PORTFOLIO_STORY_SERVICE_UNPUBLISHED');
        setReadinessProblem(notReady);
        if (
          error.status === 409 &&
          error.code === 'PORTFOLIO_NOT_READY' &&
          (kind === 'preview' || kind === 'save-preview')
        )
          setProblem(
            'Чернетку збережено, але перегляд недоступний: заповніть обов’язкові поля й дочекайтесь готовності фото.',
          );
        setFieldErrors(error.code === 'PORTFOLIO_SLUG_TAKEN' ? ['slug'] : error.fields);
        if (error.code === 'PORTFOLIO_SLUG_TAKEN')
          void client.invalidateQueries({ queryKey: [...queryPrefix, resource, 'list'] });
        if (error.code === 'PORTFOLIO_STORY_SERVICE_UNPUBLISHED')
          void client.invalidateQueries({ queryKey: [...queryPrefix, 'services', 'list'] });
        if (notReady) {
          const active = currentRecord.current;
          if (active)
            void client.invalidateQueries({
              queryKey: [
                ...queryPrefix,
                resource,
                resource === 'settings' ? 'singleton' : active.id,
              ],
              exact: true,
            });
          void client.invalidateQueries({ queryKey: mediaKey });
        }
        if (error.code === 'PORTFOLIO_VERSION_CONFLICT' || (error.status === 409 && !error.code)) {
          setConflict(true);
          setLatest(null);
        }
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function updateRecord(next: Entity) {
    currentRecord.current = next;
    setRecord(next);
    if (resource !== 'settings') client.setQueryData([...queryPrefix, resource, next.id], next);
    else client.setQueryData([...queryPrefix, resource, 'singleton'], next);
    if (resource !== 'settings')
      void client.invalidateQueries({ queryKey: [...queryPrefix, resource], exact: true });
  }

  function validateDraft(form: HTMLFormElement) {
    const occupied = 'slug' in draft && occupiedSlugs.includes(draft.slug);
    const missing: string[] = [];
    if ('slug' in draft && !draft.slug.trim()) missing.push('slug');
    if ('serviceId' in draft && !draft.serviceId) missing.push('serviceId');
    if (occupied) missing.push('slug');
    if (hasInvalidFields(form, missing, occupied ? occupiedSlugMessage(resource) : undefined))
      return false;
    if ('cover' in draft && photoCount(photos, draft.cover?.mediaId) > 10) {
      setProblem('Оберіть не більше 10 унікальних фото разом з обкладинкою.');
      return false;
    }
    return true;
  }

  async function persistDraft() {
    const completeStory = resource === 'stories';
    const payload = completeStory ? { data: draft, items: photos } : { data: draft };
    const request = record
      ? jsonRequest('PUT', { expectedVersion: record.draftVersion, ...payload })
      : jsonRequest('POST', completeStory ? payload : draft);
    const next = await apiRequest<Entity>(path + (completeStory ? '/draft' : ''), request);
    updateRecord(next);
    setDraft(next.draft);
    if ('photos' in next) setPhotos(next.photos);
    setPreview(null);
    setNotice('Чернетку збережено. На сайті зміни з’являться після публікації.');
    if (!record) onCreated(next.id);
    return next;
  }

  async function loadPreview(
    source: Entity,
    locale: 'uk' | 'en' = portfolioSiteSettings.defaultLocale,
  ) {
    setPreview(null);
    const sourcePath = prefix + resource + (resource === 'settings' ? '' : '/' + source.id);
    const result = await apiRequest<PortfolioPreviewData>(
      sourcePath + '/preview?locale=' + locale,
      { cache: 'no-store' },
    );
    if (result.draftVersion !== source.draftVersion)
      throw new ApiError('Draft version changed', 409, 'PORTFOLIO_VERSION_CONFLICT');
    setPreview(result);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || conflict || !validateDraft(event.currentTarget)) return;
    void run(async () => {
      await persistDraft();
    });
  }

  function showPreview() {
    if (pending || conflict || !formRef.current) return;
    if (needsSave && !validateDraft(formRef.current)) return;
    void run(
      async () => {
        const source = needsSave ? await persistDraft() : record;
        if (source)
          await loadPreview(source, preview?.site.locale ?? portfolioSiteSettings.defaultLocale);
      },
      needsSave ? 'save-preview' : 'preview',
    );
  }

  function focusField(name: string) {
    if (name.endsWith('.uk')) setLocale('uk');
    if (name.endsWith('.en')) setLocale('en');
    if (resource === 'settings')
      onSettingsView(
        name.startsWith('contacts.') || name.startsWith('bookingIntro.') ? 'contacts' : 'home',
      );
    requestAnimationFrame(() => focusVisibleField(name));
  }

  function focusVisibleField(name: string) {
    const fields = Array.from(
      editorRef.current?.querySelectorAll<HTMLElement>('[data-portfolio-field]:not(:disabled)') ??
        [],
    );
    const field =
      fields.find((field) => field.dataset.portfolioField === name) ??
      fields.find((field) => name.startsWith(field.dataset.portfolioField + '.'));
    if (!field) {
      const fallback =
        editorRef.current?.querySelector<HTMLElement>('[data-story-photos-section]') ??
        formRef.current;
      fallback?.scrollIntoView({ block: 'start', behavior: 'instant' });
      setNotice('Поле не знайдено на екрані: ' + describePortfolioField(name));
      return;
    }
    for (let parent = field.parentElement; parent; parent = parent.parentElement)
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    field.scrollIntoView({ block: 'center', behavior: 'instant' });
    field.focus({ preventScroll: true });
  }

  function editDraft(next: Draft) {
    setFieldErrors((errors) => retainUnchangedFieldErrors(errors, draft, next));
    setDraft(next);
    if (!conflict) {
      setProblem('');
      setReadinessProblem(false);
    }
  }
  function editPhotos(next: PortfolioStoryPhotoInputDto[]) {
    setFieldErrors((errors) =>
      retainUnchangedFieldErrors(errors, { items: photos }, { items: next }),
    );
    setPhotos(next);
    if (!conflict) {
      setProblem('');
      setReadinessProblem(false);
    }
  }

  function lifecycle(action: 'publish' | 'archive') {
    if (!record || dirty || pending || conflict || (action === 'publish' && !canPublish)) return;
    const draftForm = editorRef.current?.querySelector('form');
    if (
      action === 'publish' &&
      draftForm &&
      hasInvalidFields(draftForm, requiredDraftFields(draft, photos))
    )
      return;
    if (action === 'archive' && !window.confirm('Прибрати цей запис з публічного портфоліо?'))
      return;
    void run(async () => {
      const result = await apiRequest<PortfolioPublicationResponseDto>(
        path + '/' + action,
        jsonRequest('POST', { expectedVersion: record.draftVersion }),
      );
      const next = {
        ...record,
        status: result.status,
        draftVersion: result.draftVersion,
        publishedVersion: result.publishedVersion,
        publishedAt: result.publishedAt,
        hasUnpublishedChanges: result.draftVersion !== result.publishedVersion,
      };
      updateRecord(next);
      setNotice(action === 'publish' ? 'Опубліковано.' : 'Запис перенесено в архів.');
      setPreview(null);
    }, action);
  }

  function resolveConflict(keepEdits: boolean) {
    if (!latest || pendingRef.current) return;
    if (
      keepEdits &&
      !window.confirm(
        'Наступне збереження замінить відповідні поля новішої чернетки. Використати її версію зі своїми змінами?',
      )
    )
      return;
    updateRecord(latest);
    if (!keepEdits || !draftDirty) setDraft(latest.draft);
    if (!keepEdits || !photosDirty) setPhotos('photos' in latest ? latest.photos : []);
    setConflict(false);
    setLatest(null);
    setProblem('');
    setFieldErrors([]);
    setPreview(null);
  }

  return (
    <div
      ref={editorRef}
      inert={preview ? true : undefined}
      className={styles.editor + ' space-y-4'}
    >
      <header ref={toolbarRef} tabIndex={-1} className={styles.toolbar} aria-label="Дії редактора">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="break-words text-lg font-semibold">{editorTitle}</h3>
          <p className="text-sm text-zinc-700" role="status">
            {statusText}
          </p>
          <p className="text-sm text-zinc-700" id={formId + '-toolbar-publish-reason'}>
            {publishReason}
          </p>
        </div>
        <details className={styles.more}>
          <summary>Ще</summary>
          <div className={styles.menu + ' space-y-3'}>
            <button
              className={button + ' text-red-700'}
              type="button"
              disabled={!record || dirty || conflict || pending || record.status === 'ARCHIVED'}
              onClick={() => lifecycle('archive')}
            >
              Архівувати
            </button>
            <p className="text-sm text-zinc-700">
              Архівація прибирає цей запис із сайту. Спочатку збережіть правки.
            </p>
            {record && (
              <p className="text-sm text-zinc-700">
                Версія чернетки: {record.draftVersion}. Версія публікації:{' '}
                {record.publishedVersion ?? 'ще немає'}.
              </p>
            )}
          </div>
        </details>
        <div ref={actionsRef} className={styles.actions}>
          <button
            className={needsSave ? primary : button}
            type="submit"
            form={formId}
            disabled={pending || conflict || !needsSave}
            aria-label={!pending ? 'Зберегти чернетку' : undefined}
          >
            {pending && (operation === 'save' || operation === 'save-preview')
              ? 'Зберігаємо…'
              : 'Зберегти'}
          </button>
          <button
            className={button}
            type="button"
            disabled={pending || conflict}
            onClick={showPreview}
            aria-label={
              !pending ? (needsSave ? 'Зберегти й переглянути' : 'Переглянути чернетку') : undefined
            }
          >
            {pending && (operation === 'preview' || operation === 'save-preview')
              ? 'Відкриваємо…'
              : 'Переглянути'}
          </button>
          {publishedClean ? (
            <a
              className={button}
              href={publicUrl(
                resource,
                'slug' in draft ? draft.slug : undefined,
                preview?.site.locale ?? portfolioSiteSettings.defaultLocale,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Відкрити сайт
            </a>
          ) : (
            <button
              className={(!needsSave ? primary : button) + ' aria-disabled:opacity-50'}
              type="button"
              aria-disabled={!canPublish}
              aria-label={record?.publishedVersion == null ? 'Опублікувати' : 'Опублікувати зміни'}
              aria-describedby={formId + '-toolbar-publish-reason'}
              onClick={() => {
                if (!canPublish) {
                  setNotice(publishReason);
                  return;
                }
                lifecycle('publish');
              }}
            >
              {pending && operation === 'publish' ? 'Публікуємо…' : 'Опублікувати'}
            </button>
          )}
        </div>
      </header>
      <section className={panel} aria-label="Стан чернетки">
        <p className="text-sm text-zinc-700">
          {record?.status === 'ARCHIVED'
            ? 'Запис в архіві. Публікація поверне його на сайт.'
            : record?.publishedVersion != null && !publishedClean
              ? 'На сайті попередня версія. Ці зміни ще не опубліковані.'
              : publishedClean
                ? 'На сайті актуальна версія. Нові правки спочатку збережуться як чернетка.'
                : 'Чернетку бачите лише ви. На сайті зміни з’являться після публікації.'}
        </p>
        <p className="text-sm text-zinc-700">
          {resource === 'settings'
            ? 'Головна сторінка та контакти мають спільну чернетку й публікуються разом. Перевірте обидва розділи перед публікацією.'
            : 'Публікується лише цей запис. Добірки головної оновлюються окремо.'}
        </p>
        {readiness.checking && (
          <p role="status">Перевіряємо готовність фото й пов’язаних записів…</p>
        )}
        {checklist.length > 0 && (
          <details open={fieldErrors.length > 0 || readinessProblem || undefined}>
            <summary className="min-h-11 cursor-pointer py-2 font-medium">
              До публікації залишилось · {checklist.length}
            </summary>
            <ul className="space-y-2">
              {checklist.map((issue) => (
                <li key={issue.field}>
                  <button
                    type="button"
                    className="min-h-11 text-left text-sm underline underline-offset-4 disabled:opacity-50"
                    disabled={pending}
                    onClick={() => focusField(issue.field)}
                  >
                    {issue.label} — {issue.message}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={button}
              disabled={pending}
              onClick={() => {
                setFieldErrors([]);
                setProblem('');
                setReadinessProblem(false);
                readiness.retry();
                if (resource !== 'services') void services.refetch();
                if (resource === 'settings') void stories.refetch();
              }}
            >
              Повторити перевірку готовності
            </button>
          </details>
        )}
        {'serviceId' in draft &&
          draft.serviceId &&
          checklist.some((issue) => issue.field === 'serviceId') && (
            <button
              type="button"
              className={button}
              disabled={pending}
              onClick={() => onOpenService(draft.serviceId)}
            >
              Відкрити фотосесію
            </button>
          )}
        {pending && (
          <p role="status">
            {operation === 'publish'
              ? 'Публікуємо…'
              : operation === 'archive'
                ? 'Архівуємо…'
                : operation === 'preview'
                  ? 'Відкриваємо перегляд…'
                  : operation === 'save-preview'
                    ? 'Зберігаємо та відкриваємо перегляд…'
                    : operation === 'conflict'
                      ? 'Звіряємо версії…'
                      : 'Зберігаємо зміни…'}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {problem && (
          <p role="alert" className="text-red-700">
            {problem}
          </p>
        )}
        {conflict && record && (
          <div className="space-y-2">
            <button
              className={button}
              type="button"
              disabled={pending}
              onClick={() =>
                void run(
                  async () => setLatest(await apiRequest<Entity>(path, { cache: 'no-store' })),
                  'conflict',
                )
              }
            >
              Звірити збережену версію
            </button>
            {latest && (
              <div className="space-y-2">
                <details>
                  <summary className="min-h-11 cursor-pointer py-2">
                    Деталі збереженої версії
                  </summary>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-zinc-200 p-2 text-sm">
                    {JSON.stringify(
                      { ...latest.draft, ...('photos' in latest ? { photos: latest.photos } : {}) },
                      null,
                      2,
                    )}
                  </pre>
                </details>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={button}
                    type="button"
                    disabled={pending}
                    onClick={() => resolveConflict(true)}
                  >
                    Залишити мої правки у формі
                  </button>
                  <button
                    className={button}
                    type="button"
                    disabled={pending}
                    onClick={() => resolveConflict(false)}
                  >
                    Завантажити збережену чернетку
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Мова контенту">
        {translationProgress(draft, photos).map((progress) => (
          <button
            type="button"
            className={locale === progress.locale ? primary : button}
            aria-pressed={locale === progress.locale}
            key={progress.locale}
            onClick={() => setLocale(progress.locale)}
          >
            {progress.locale === 'uk' ? 'Українська' : 'English'} · {progress.filled}/
            {progress.total}
          </button>
        ))}
      </div>
      <EditorLocale.Provider value={locale}>
        <FieldErrors.Provider value={fieldErrors}>
          <form
            id={formId}
            ref={formRef}
            className={panel}
            onSubmit={save}
            noValidate
            aria-label="Поля чернетки"
          >
            <fieldset disabled={pending} className="space-y-4">
              {'brand' in draft ? (
                <HomeFields
                  value={draft}
                  view={settingsView}
                  change={editDraft}
                  media={mediaRows}
                  services={choices(serviceRows.filter((item) => item.status === 'PUBLISHED'))}
                  stories={choices(storyRows.filter((item) => item.status === 'PUBLISHED'))}
                />
              ) : 'serviceId' in draft ? (
                <StoryFields
                  value={draft}
                  change={editDraft}
                  media={mediaRows}
                  services={choices(serviceRows)}
                  lockedSlug={record?.publishedVersion != null}
                  occupiedSlugs={occupiedSlugs}
                />
              ) : (
                <ServiceFields
                  value={draft}
                  change={editDraft}
                  media={mediaRows}
                  lockedSlug={record?.publishedVersion != null}
                  occupiedSlugs={occupiedSlugs}
                />
              )}
              {resource !== 'services' && <ListMore query={services} label="фотосесії" />}
              {resource === 'settings' && <ListMore query={stories} label="історії" />}
              <p className="text-sm text-zinc-700">
                Чернетку можна зберегти без фото, перекладів та завершених текстів. Їх потрібно
                заповнити перед публікацією.
              </p>
              {resource === 'stories' && 'cover' in draft && (
                <section
                  className="space-y-4"
                  aria-label="Фото та обкладинка історії"
                  data-story-photos-section
                >
                  <h3 className="font-semibold">Фото та обкладинка історії</h3>
                  <PhotoFields
                    value={photos}
                    change={editPhotos}
                    media={mediaRows}
                    cover={draft.cover}
                    changeCover={(cover) => editDraft({ ...draft, cover })}
                  />
                </section>
              )}
            </fieldset>
          </form>
        </FieldErrors.Provider>
      </EditorLocale.Provider>
      {preview && record && (
        <PortfolioPreview
          preview={preview}
          version={record.draftVersion}
          dirty={dirty}
          disabled={pending || conflict || dirty}
          closeDisabled={pending}
          onLocaleChange={(locale) => {
            if (!pending && !dirty && !conflict)
              void run(() => loadPreview(record, locale), 'preview');
          }}
          onClose={() => {
            setPreview(null);
            requestAnimationFrame(() => toolbarRef.current?.focus({ preventScroll: true }));
          }}
        />
      )}
    </div>
  );
}

export function PortfolioWorkspace() {
  const [dirty, setDirty] = useState(false);
  const { section, id, navigate, ready, session: editorKey } = usePortfolioNavigation(dirty);
  const resource = section === 'contacts' ? 'settings' : section;
  const media = usePortfolioMedia();
  const services = useEntries(
    'services',
    section === 'services' || section === 'stories' || resource === 'settings',
  );
  const stories = useEntries('stories', section === 'stories' || resource === 'settings');
  const [filters, setFilters] = useState<Record<string, { search: string; status: string }>>({});
  const filter = filters[section] ?? { search: '', status: '' };
  const sectionList = useEntries(
    section === 'services' ? 'services' : 'stories',
    section === 'services' || section === 'stories',
    filter.search,
    filter.status,
  );
  const updateFilter = (next: Partial<typeof filter>) =>
    setFilters((previous) => ({ ...previous, [section]: { ...filter, ...next } }));
  const rows = sectionList.data?.pages.flatMap((page) => page.items) ?? [];
  const editing = resource !== 'media' && (resource === 'settings' || Boolean(id));
  const record = useQuery({
    queryKey: [...queryPrefix, resource, id ?? 'singleton'],
    enabled: ready && editing && id !== 'new',
    queryFn: ({ signal }) =>
      apiRequest<Entity>(prefix + resource + (id ? '/' + id : ''), { signal, cache: 'no-store' }),
    retry: false,
  });

  useEffect(() => {
    setDirty(false);
  }, [editorKey]);

  if (!ready) return <p role="status">Відкриваємо розділ…</p>;

  return (
    <section className="mx-auto max-w-5xl space-y-5 pt-8 text-zinc-950">
      <div>
        <h2 className="text-2xl font-semibold">Портфоліо</h2>
        <p className="mt-1 text-sm text-zinc-700">Дві мови, чернетки та публікація.</p>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Розділи портфоліо">
        {(Object.keys(names) as Section[]).map((name) => (
          <button
            key={name}
            type="button"
            className={name === section ? primary : button}
            aria-current={name === section ? 'page' : undefined}
            onClick={() => navigate(name)}
          >
            {names[name]}
          </button>
        ))}
      </nav>
      {section === 'media' && <PortfolioMediaLibrary />}
      {(section === 'services' || section === 'stories') && !id && (
        <div className={panel}>
          <h3 className="font-semibold">{names[section]}</h3>
          <div className="flex flex-wrap gap-3">
            <label>
              Пошук
              <input
                className="block rounded border border-zinc-300 p-2"
                value={filter.search}
                maxLength={120}
                onChange={(event) => updateFilter({ search: event.target.value })}
              />
            </label>
            <label>
              Статус
              <select
                className="block rounded border border-zinc-300 p-2"
                value={filter.status}
                onChange={(event) => updateFilter({ status: event.target.value })}
              >
                <option value="">Усі</option>
                <option value="DRAFT">Чернетки</option>
                <option value="PUBLISHED">Опубліковані</option>
                <option value="ARCHIVED">Архів</option>
              </select>
            </label>
            <button type="button" className={button} onClick={() => navigate(section, 'new')}>
              {section === 'services' ? 'Додати фотосесію' : 'Додати історію'}
            </button>
          </div>
          <ul className="space-y-3">
            {rows.map((row) => (
              <PortfolioEntryRow key={row.id} row={row} open={() => navigate(section, row.id)} />
            ))}
          </ul>
          {sectionList.isPending && <p role="status">Завантажуємо список…</p>}
          {sectionList.isError && <p role="alert">Список недоступний.</p>}
          {sectionList.isSuccess && !rows.length && <p>У цьому розділі ще немає записів.</p>}
          <ListMore query={sectionList} label={names[section]} />
        </div>
      )}
      {editing && (section === 'services' || section === 'stories') && (
        <button type="button" className={button} onClick={() => navigate(section)}>
          ← До списку
        </button>
      )}
      {editing && id !== 'new' && record.isPending && <p role="status">Завантажуємо чернетку…</p>}
      {editing && id !== 'new' && record.isError && (
        <p role="alert">
          Чернетка недоступна.{' '}
          <button className={button} type="button" onClick={() => void record.refetch()}>
            Повторити
          </button>
        </p>
      )}
      {editing && (id === 'new' || record.data) && (
        <Editor
          key={resource + ':' + editorKey}
          resource={resource as Resource}
          initial={id === 'new' ? undefined : record.data}
          media={media}
          services={services}
          stories={stories}
          onDirty={setDirty}
          onCreated={(id) => navigate(section, id, true)}
          settingsView={section === 'contacts' ? 'contacts' : 'home'}
          onSettingsView={(view) => navigate(view === 'contacts' ? 'contacts' : 'settings')}
          onOpenService={(serviceId) => navigate('services', serviceId)}
        />
      )}
    </section>
  );
}
