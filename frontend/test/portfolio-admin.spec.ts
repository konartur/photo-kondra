import { expect, test } from '@playwright/test';

const id = '12345678-1234-4234-8234-123456789012';
const mediaId = '12345678-1234-4234-8234-123456789013';
const imageUrl = '/api/portfolio/media/' + mediaId + '/variants/' + id;
const now = '2026-11-22T12:00:00.000Z';
const book = { uk: 'Портрет', en: 'Portrait' };
const seo = { title: book, description: book, shareImage: null };
const blank = { uk: '', en: '' };
const initialDraft = {
  slug: 'portrait', title: book, description: blank, price: null,
  cardImage: null, bookingEnabled: false, seo,
};
const readyMedia = {
  id: mediaId, filename: 'studio.jpg', mimeType: 'image/jpeg', sizeBytes: '16',
  width: 480, height: 320, status: 'READY', createdAt: now, previewUrl: imageUrl,
};

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{
    name: 'photo_cloud_access_token', value: 'playwright-test', url: 'http://localhost:3002', httpOnly: true,
  }]);
  await page.route('**/api/portfolio/media?*', route => route.fulfill({ json: { items: [readyMedia], nextCursor: null } }));
  await page.route('**/api/portfolio/media/*/variants/*', route => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"/>',
  }));
});

test('creates a bilingual service, previews the saved draft and publishes the expected version', async ({ page }) => {
  let created = false;
  let status = 'DRAFT';
  let submitted = initialDraft;
  const entity = () => ({
    id, draft: submitted, status, draftVersion: 1, publishedVersion: status === 'PUBLISHED' ? 1 : null,
    hasUnpublishedChanges: status === 'DRAFT', publishedAt: status === 'PUBLISHED' ? now : null, updatedAt: now,
  });
  await page.route('**/api/portfolio/services?*', route => route.fulfill({
    json: { items: created ? [{ ...entity(), title: submitted.title, slug: submitted.slug }] : [], nextCursor: null },
  }));
  await page.route('**/api/portfolio/services', async route => {
    submitted = route.request().postDataJSON();
    created = true;
    await route.fulfill({ status: 201, json: entity() });
  });
  await page.route('**/api/portfolio/services/' + id, route => route.fulfill({ json: entity() }));
  await page.route('**/api/portfolio/services/' + id + '/preview?locale=en', route => route.fulfill({
    json: {
      draftVersion: 1,
      site: { brand: 'Synthetic', locale: 'en', contacts: [], booking: { intro: '', services: [] } },
      page: {
        title: submitted.title.en, description: '', cardImage: { url: imageUrl, alt: 'Studio portrait' },
        seo: { title: '', description: '', shareImage: null }, stories: { items: [], nextCursor: null },
      },
    },
  }));
  await page.route('**/api/portfolio/services/' + id + '/publish', route => {
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: 1 });
    status = 'PUBLISHED';
    return route.fulfill({ json: { ...entity(), contentVersion: 2 } });
  });

  await page.goto('/dashboard/portfolio');
  await page.getByRole('button', { name: 'Створити напрям' }).click();
  await page.getByLabel('Slug', { exact: true }).fill('studio');
  await page.getByLabel('Назва · UK', { exact: true }).fill('Студія');
  await page.getByLabel('Назва · EN', { exact: true }).fill('Studio');
  await page.getByLabel('Фото напряму · файл').selectOption(mediaId);
  await page.getByLabel('Альтернативний опис · UK').fill('Студійний портрет');
  await page.getByLabel('Альтернативний опис · EN').fill('Studio portrait');
  await expect(page.getByRole('button', { name: 'Опублікувати' })).toBeDisabled();
  await page.getByRole('button', { name: 'Зберегти чернетку' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'збережена v1' })).toBeVisible();
  expect(submitted).toMatchObject({ slug: 'studio', title: { uk: 'Студія', en: 'Studio' }, cardImage: { mediaId } });
  await page.getByLabel('Мова').selectOption('en');
  await page.getByRole('button', { name: 'Показати чернетку' }).click();
  await expect(page.getByRole('heading', { name: 'Studio', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Studio portrait' })).toHaveAttribute('src', imageUrl);
  await page.getByRole('button', { name: 'Опублікувати' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'версія публікації v1' })).toBeVisible();
  await expect(page.getByLabel('Slug', { exact: true })).toBeDisabled();
});

test('keeps local input on version conflict and marks field errors', async ({ page }) => {
  let draftVersion = 1;
  const entity = () => ({ id, draft: initialDraft, status: 'DRAFT', draftVersion, publishedVersion: null,
    hasUnpublishedChanges: true, publishedAt: null, updatedAt: now });
  await page.route('**/api/portfolio/services?*', route => route.fulfill({
    json: { items: [{ ...entity(), title: book, slug: 'portrait' }], nextCursor: null },
  }));
  await page.route('**/api/portfolio/services/' + id, async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: entity() });
    const change = route.request().postDataJSON();
    if (change.expectedVersion === 1) {
      draftVersion = 2;
      return route.fulfill({ status: 409, json: { code: 'PORTFOLIO_VERSION_CONFLICT' } });
    }
    expect(change).toMatchObject({ expectedVersion: 2, data: { title: { en: 'Local edit' } } });
    return route.fulfill({ status: 400, json: { code: 'VALIDATION_FAILED', errors: [{ field: 'data.title.en', code: 'INVALID_FIELD' }] } });
  });
  await page.goto('/dashboard/portfolio');
  await page.getByLabel('Вибрати запис').selectOption(id);
  const title = page.getByLabel('Назва · EN', { exact: true });
  await title.fill('Local edit');
  const save = page.getByRole('button', { name: 'Зберегти чернетку' });
  await save.click();
  await expect(page.getByRole('region', { name: 'Стан чернетки' }).getByRole('alert')).toContainText('в іншій сесії');
  await expect(title).toHaveValue('Local edit');
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Звірити збережену версію' }).click();
  await expect(page.getByText('Поточна версія v2')).toBeVisible();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Зберегти мої правки у формі' }).click();
  await save.click();
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(title).toHaveValue('Local edit');
});

test('retries the same direct upload and only then confirms the media with the backend', async ({ page }) => {
  let requests = 0;
  let puts = 0;
  let completed = 0;
  await page.route('**/api/portfolio/media/upload-url', route => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ filename: 'test.jpg', mimeType: 'image/jpeg' });
    return route.fulfill({ status: 201, json: {
      mediaId, expiresIn: 60, uploadUrl: 'http://localhost:3002/synthetic-storage/object',
      requiredHeaders: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' },
    } });
  });
  await page.route('**/synthetic-storage/object', route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().headers()['if-none-match']).toBe('*');
    puts++;
    return route.fulfill({ status: puts === 1 ? 500 : 200 });
  });
  await page.route('**/api/portfolio/media/' + mediaId + '/upload-complete', route => {
    completed++;
    return route.fulfill({ status: 202, json: { ...readyMedia, status: 'PROCESSING' } });
  });
  await page.goto('/dashboard/portfolio');
  await page.getByRole('button', { name: 'Медіа', exact: true }).click();
  await page.getByLabel(/Файл JPEG/).setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic') });
  await page.getByRole('button', { name: 'Завантажити', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Завантаження не завершено' })).toBeVisible();
  expect(completed).toBe(0);
  await page.getByRole('button', { name: 'Повторити завантаження' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Файл прийнято' })).toBeVisible();
  expect([requests, puts, completed]).toEqual([1, 2, 1]);
});

test('reorders story photos with the keyboard and saves the current version', async ({ page }) => {
  const photo = (placement: string, asset: string) => ({
    id: placement, image: { mediaId: asset, alt: book, focalPoint: null },
  });
  const otherAsset = '12345678-1234-4234-8234-123456789014';
  const photos = [photo(id, mediaId), photo(mediaId, otherAsset)];
  const storyDraft = { slug: 'studio', title: book, subtitle: book, description: book, serviceId: id, cover: null, seo };
  const story = { id, draft: storyDraft, photos, status: 'DRAFT', draftVersion: 3, publishedVersion: null,
    hasUnpublishedChanges: true, publishedAt: null, updatedAt: now };
  await page.route('**/api/portfolio/stories?*', route => route.fulfill({
    json: { items: [{ ...story, title: book, slug: 'studio' }], nextCursor: null },
  }));
  await page.route('**/api/portfolio/services?*', route => route.fulfill({ json: { items: [], nextCursor: null } }));
  await page.route('**/api/portfolio/stories/' + id, route => route.fulfill({ json: story }));
  await page.route('**/api/portfolio/stories/' + id + '/photos', route => {
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: 3, items: [photos[1], photos[0]] });
    return route.fulfill({ json: { ...story, photos: [photos[1], photos[0]], draftVersion: 4 } });
  });
  await page.goto('/dashboard/portfolio');
  await page.getByRole('button', { name: 'Історії', exact: true }).click();
  await page.getByLabel('Вибрати запис').selectOption(id);
  const move = page.getByRole('button', { name: 'Вище · фото 2' });
  await move.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Опублікувати' })).toBeDisabled();
  await page.getByRole('button', { name: 'Зберегти порядок фото' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'збережена v4' })).toBeVisible();
});

test('edits the home draft and archives a saved revision explicitly', async ({ page }) => {
  const draft = {
    brand: 'PhotoKondra', bookingIntro: blank, contacts: [], seo,
    hero: { desktop: null, mobile: null },
    servicesSection: { title: blank, description: blank, serviceIds: [] },
    storiesSection: { title: blank, items: [] },
    contactSection: { title: blank, description: blank, buttonLabel: blank, background: null },
  };
  const settings = {
    id, draft, draftVersion: 5, publishedVersion: 4,
    status: 'PUBLISHED', hasUnpublishedChanges: true, publishedAt: now, updatedAt: now,
  };
  await page.route('**/api/portfolio/services?*', route => route.fulfill({ json: { items: [], nextCursor: null } }));
  await page.route('**/api/portfolio/stories?*', route => route.fulfill({ json: { items: [], nextCursor: null } }));
  await page.route('**/api/portfolio/settings', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: settings });
    const change = route.request().postDataJSON();
    expect(change).toMatchObject({
      expectedVersion: 5,
      data: { contacts: [{ type: 'email', label: { uk: 'Написати', en: 'Email me' }, address: 'synthetic@example.invalid', visible: true }] },
    });
    Object.assign(settings, { draft: change.data, draftVersion: 6 });
    return route.fulfill({ json: settings });
  });
  await page.route('**/api/portfolio/settings/archive', route => {
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: 6 });
    return route.fulfill({ json: { ...settings, status: 'ARCHIVED', contentVersion: 2 } });
  });
  await page.goto('/dashboard/portfolio');
  await page.getByRole('button', { name: 'Головна та контакти' }).click();
  await page.getByRole('button', { name: 'Додати Email' }).click();
  await page.getByLabel('Email · адреса').fill('synthetic@example.invalid');
  await page.getByLabel('Email · назва · UK').fill('Написати');
  await page.getByLabel('Email · назва · EN').fill('Email me');
  await page.getByRole('button', { name: 'Зберегти чернетку' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'збережена v6' })).toBeVisible();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Архівувати' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Запис перенесено в архів' })).toBeVisible();
});
