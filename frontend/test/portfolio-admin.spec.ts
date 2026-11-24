import { expect, test, type Page } from '@playwright/test';
const id = '12345678-1234-4234-8234-123456789012';
const mediaId = '12345678-1234-4234-8234-123456789013';
const text = { uk: 'Портрет', en: 'Portrait' };
const seo = { title: text, description: text, shareImage: null };
const image = { mediaId, alt: text, focalPoint: null };
const now = '2026-11-22T12:00:00.000Z';
const meta = {
  id,
  status: 'DRAFT',
  draftVersion: 1,
  publishedVersion: null,
  hasUnpublishedChanges: true,
  publishedAt: null,
  updatedAt: now,
};
const baseDraft = {
  slug: 'portrait',
  title: text,
  subtitle: text,
  description: text,
  serviceId: id,
  cover: image,
  seo,
};
const homeDraft = {
  brand: 'PhotoKondra',
  bookingIntro: text,
  contacts: [{ type: 'email', address: 'demo@example.invalid', visible: true }],
  hero: { desktop: image, mobile: image },
  servicesSection: { title: text, description: text, serviceIds: [id] },
  storiesSection: { title: text, items: [{ storyId: id, caption: { uk: '', en: '' } }] },
  contactSection: { title: text, description: text, buttonLabel: text, background: image },
  seo,
};
const variant = '/api/portfolio/media/' + mediaId + '/variants/' + id;
const publicImage = {
  mediaId,
  url: variant,
  alt: 'Portrait',
  width: 480,
  height: 320,
  sources: [{ url: variant, width: 480, height: 320 }],
  focalPoint: null,
};
const field = (page: Page, name: string) =>
  page
    .getByRole('group', { name, exact: true })
    .getByRole('textbox', { name: 'Українська', exact: true });
async function setup(
  page: Page,
  options: { incomplete?: boolean; photos?: number; conflict?: boolean; timeout?: boolean } = {},
) {
  const photos = Array.from({ length: options.photos ?? 1 }, (_, index) => ({
    id: '22345678-1234-4234-8234-' + String(index).padStart(12, '0'),
    image: {
      ...image,
      mediaId: index ? '32345678-1234-4234-8234-' + String(index).padStart(12, '0') : mediaId,
    },
  }));
  let entity = {
    ...meta,
    draft: { ...baseDraft, title: options.incomplete ? { uk: '', en: '' } : text },
    photos,
  };
  let settings = { ...meta, draft: structuredClone(homeDraft) };
  const calls = {
    saves: 0,
    publishes: 0,
    details: 0,
    list: [] as string[],
    timeout: options.timeout ?? false,
  };
  await page.context().addCookies([
    {
      name: 'photo_cloud_access_token',
      value: 'playwright-test',
      url: 'http://localhost:3002',
      httpOnly: true,
    },
  ]);
  await page.route('**/api/portfolio/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname,
      method = request.method();
    if (path.includes('/variants/'))
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"/>',
      });
    if (path === '/api/portfolio/media')
      return route.fulfill({
        json: {
          items: photos.map((photo) => ({
            id: photo.image.mediaId,
            filename: 'portrait.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: '16',
            width: 480,
            height: 320,
            status: 'READY',
            createdAt: now,
            previewUrl: variant,
          })),
          nextCursor: null,
        },
      });
    if (path.startsWith('/api/portfolio/media/')) {
      calls.details++;
      return route.fulfill({
        json: {
          id: path.split('/').at(-1),
          filename: 'portrait.jpg',
          status: 'READY',
          previewUrl: variant,
        },
      });
    }
    if (path === '/api/portfolio/settings') {
      if (method === 'PUT')
        settings = {
          ...settings,
          draft: request.postDataJSON().data,
          draftVersion: settings.draftVersion + 1,
        };
      return route.fulfill({ json: settings });
    }
    if (path === '/api/portfolio/services' || path === '/api/portfolio/stories') {
      calls.list.push(url.search);
      const published = path.endsWith('/services');
      return route.fulfill({
        json: {
          items: [
            {
              ...meta,
              title: entity.draft.title,
              slug: 'portrait',
              status: published ? 'PUBLISHED' : entity.status,
              hasUnpublishedChanges: !published,
              thumbnailMediaId: mediaId,
            },
          ],
          nextCursor: null,
        },
      });
    }
    if (path.endsWith('/publish')) {
      calls.publishes++;
      return route.fulfill({
        json: {
          ...meta,
          status: 'PUBLISHED',
          publishedVersion: entity.draftVersion,
          contentVersion: 2,
        },
      });
    }
    if (path.endsWith('/preview')) {
      if (options.incomplete)
        return route.fulfill({
          status: 409,
          json: {
            statusCode: 409,
            code: 'PORTFOLIO_NOT_READY',
            message: 'Incomplete',
            errors: [{ field: 'title.uk', code: 'REQUIRED' }],
          },
        });
      return route.fulfill({
        json: {
          draftVersion: entity.draftVersion,
          site: {
            brand: 'PhotoKondra',
            locale: url.searchParams.get('locale'),
            supportedLocales: ['uk', 'en'],
            contacts: [],
            booking: { intro: 'Intro', services: [] },
          },
          page: {
            id,
            slug: 'portrait',
            title:
              url.searchParams.get('locale') === 'en' ? 'English preview' : 'Приватний портрет',
            subtitle: 'Subtitle',
            description: 'Description',
            service: { id, slug: 'portrait', title: 'Session' },
            cover: publicImage,
            photos: entity.photos.map((photo) => ({ id: photo.id, image: publicImage })),
            seo: { title: '', description: '', shareImage: null },
            nextStory: null,
          },
        },
      });
    }
    if (path.endsWith('/draft')) {
      calls.saves++;
      const input = request.postDataJSON();
      if (options.conflict || (options.timeout && calls.saves === 2))
        return route.fulfill({
          status: 409,
          json: { statusCode: 409, code: 'PORTFOLIO_VERSION_CONFLICT', message: 'Changed' },
        });
      entity = {
        ...entity,
        draft: input.data,
        photos: input.items,
        draftVersion: entity.draftVersion + 1,
      };
      if (calls.timeout) {
        calls.timeout = false;
        return route.abort('failed');
      }
      return route.fulfill({ json: entity });
    }
    if (path.includes('/stories/')) return route.fulfill({ json: entity });
    if (path.includes('/services/'))
      return route.fulfill({ json: { ...meta, status: 'PUBLISHED' } });
    return route.fulfill({ status: 404, json: { message: 'Unknown fixture path' } });
  });
  return { calls, entity: () => entity, settings: () => settings };
}

test('opens thumbnail entries and sends server filters', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/dashboard/portfolio?section=stories');
  await expect(page.getByRole('heading', { name: 'Портрет', exact: true })).toBeVisible();
  await page.getByLabel('Пошук', { exact: true }).fill('portrait');
  await page.getByRole('combobox', { name: /^Статус/ }).selectOption('DRAFT');
  await expect
    .poll(() =>
      state.calls.list.some(
        (search) => search.includes('search=portrait') && search.includes('status=DRAFT'),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Відкрити · Портрет' }).click();
  await expect(page).toHaveURL(/entry=/);
  await page.getByRole('button', { name: '← До списку' }).first().click();
  await expect(page.getByLabel('Пошук', { exact: true })).toHaveValue('portrait');
});
test('saves an incomplete draft and explains preview and blocked publication', async ({ page }) => {
  const state = await setup(page, { incomplete: true });
  await page.goto('/dashboard/portfolio?section=stories&entry=' + id);
  await field(page, 'Опис').fill('Незавершений опис');
  await page.getByRole('button', { name: 'Зберегти й переглянути', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(
    'Чернетку збережено, але перегляд недоступний',
  );
  await expect(
    page
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: 'До публікації залишилось' }) }),
  ).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Опублікувати', exact: true }).click({ force: true });
  expect(state.calls.publishes).toBe(0);
  expect(state.calls.saves).toBe(1);
});
test('previews shared page content, changes locale and returns', async ({ page }) => {
  await setup(page);
  await page.goto('/dashboard/portfolio?section=stories&entry=' + id);
  await page.getByRole('button', { name: 'Переглянути чернетку' }).click();
  const preview = page.getByRole('dialog', { name: 'Приватний попередній перегляд' });
  await expect(preview).toBeVisible();
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Приватний портрет' }),
  ).toBeVisible();
  await preview.getByRole('button', { name: 'Телефон', exact: true }).click();
  await expect(preview.locator('iframe')).toHaveCSS('width', '375px');
  await preview.getByRole('combobox', { name: /^Мова/ }).selectOption('en');
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'English preview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Повернутися до редагування' }).click();
  await expect(field(page, 'Назва')).toHaveValue('Портрет');
});
test('keeps local edits during version conflict', async ({ page }) => {
  await setup(page, { conflict: true });
  await page.goto('/dashboard/portfolio?section=stories&entry=' + id);
  await field(page, 'Назва').fill('Мої зміни');
  await page.getByRole('button', { name: 'Зберегти чернетку' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('іншій сесії');
  await expect(field(page, 'Назва')).toHaveValue('Мої зміни');
});
test('recovers a completed save after timeout and retry conflict', async ({ page }) => {
  const state = await setup(page, { timeout: true });
  await page.goto('/dashboard/portfolio?section=stories&entry=' + id);
  await field(page, 'Назва').fill('Після timeout');
  await page.getByRole('button', { name: 'Зберегти чернетку' }).click();
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await page.getByRole('button', { name: 'Зберегти чернетку' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Чернетку збережено. На сайті' }),
  ).toBeVisible();
  expect(state.calls.saves).toBe(2);
});
test('shares settings across home and contacts and follows history', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/dashboard/portfolio?section=settings');
  await field(page, 'Заголовок фотосесій').fill('Нова головна');
  await page.getByRole('button', { name: 'Контакти та запис', exact: true }).click();
  await page.getByLabel('Email · адреса', { exact: true }).fill('changed@example.invalid');
  await page.goBack();
  await expect(field(page, 'Заголовок фотосесій')).toHaveValue('Нова головна');
  await page.getByRole('button', { name: 'Зберегти чернетку' }).click();
  await expect
    .poll(() => state.settings().draft.contacts[0].address)
    .toBe('changed@example.invalid');
  expect(state.settings().draft.servicesSection.title.uk).toBe('Нова головна');
});
test('bounds photo checks for 10 photos and saves their order atomically', async ({ page }) => {
  const state = await setup(page, { photos: 10 });
  await page.goto('/dashboard/portfolio?section=stories&entry=' + id);
  await page.getByRole('button', { name: 'Вище · фото 10' }).click();
  await page.getByRole('button', { name: 'Зберегти чернетку' }).click();
  await expect.poll(() => state.calls.saves).toBe(1);
  expect(state.entity().photos[8].id).toContain('000000000009');
  expect(state.calls.details).toBeLessThanOrEqual(10);
});
test('keeps publication text inside buttons on 375 and 320px at 200% text size', async ({
  page,
}) => {
  await setup(page);
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/dashboard/portfolio?section=stories&entry=' + id);
    const publish = page.getByRole('button', { name: 'Опублікувати', exact: true });
    await expect(publish).toBeVisible();
    for (const zoom of [100, 200]) {
      await page.evaluate((percent) => {
        document.documentElement.style.fontSize = percent + '%';
      }, zoom);
      expect(await publish.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    }
  }
});

test('creates an incomplete story and preserves save-and-preview result', async ({ page }) => {
  const state = await setup(page, { incomplete: true });
  await page.goto('/dashboard/portfolio?section=stories');
  await page.getByRole('button', { name: 'Додати історію', exact: true }).click();
  await page.getByRole('combobox', { name: 'Адреса історії', exact: true }).selectOption('family');
  await page.getByRole('combobox', { name: 'Фотосесія', exact: true }).selectOption(id);
  await field(page, 'Назва').fill('Нова чернетка');
  await page.getByRole('button', { name: 'Зберегти й переглянути', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('entry=' + id));
  await expect(page.locator('p[role="alert"]')).toContainText(
    'Чернетку збережено, але перегляд недоступний',
  );
  expect(state.calls.saves).toBe(1);
  await expect(field(page, 'Назва')).toHaveValue('Нова чернетка');
});

test('focuses a missing English translation and edits crop using keyboard', async ({ page }) => {
  await setup(page, { incomplete: true });
  await page.goto('/dashboard/portfolio?section=stories&entry=' + id);
  await page.locator('summary').filter({ hasText: 'До публікації залишилось' }).click();
  await page.getByRole('button', { name: /Назва · English —/ }).click();
  await expect(
    page
      .getByRole('group', { name: 'Назва', exact: true })
      .getByRole('textbox', { name: 'English', exact: true }),
  ).toBeFocused();
  await page.getByText('Замінити фото 1, опис і кадрування', { exact: true }).click();
  const point = page.locator('[data-portfolio-field="items.0.image.focalPoint"]');
  await point.focus();
  await page.keyboard.press('ArrowRight');
  await expect(point).toHaveAttribute('aria-label', /X 51%/);
  await page.keyboard.press('Shift+ArrowUp');
  await expect(point).toHaveAttribute('aria-label', /Y 40%/);
  await page.getByRole('button', { name: 'Зберегти чернетку' }).click();
});
