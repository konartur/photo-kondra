import { expect, test } from '@playwright/test';

const id = '12345678-1234-4234-8234-123456789012';
const mediaId = '12345678-1234-4234-8234-123456789013';
const imageUrl = '/api/portfolio/media/' + mediaId + '/variants/' + id;
const now = '2026-11-22T12:00:00.000Z';
const readyMedia = {
  id: mediaId,
  filename: 'studio.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: '16',
  width: 480,
  height: 320,
  status: 'READY',
  createdAt: now,
  previewUrl: imageUrl,
};

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      name: 'photo_cloud_access_token',
      value: 'playwright-test',
      url: 'http://localhost:3002',
      httpOnly: true,
    },
  ]);
  await page.route('**/api/portfolio/media?*', (route) =>
    route.fulfill({ json: { items: [readyMedia], nextCursor: null } }),
  );
  await page.route('**/api/portfolio/media/*/variants/*', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"/>',
    }),
  );
});

test('retries the same direct upload and only then confirms the media with the backend', async ({
  page,
}) => {
  let requests = 0;
  let puts = 0;
  let completed = 0;
  await page.route('**/api/portfolio/media/upload-url', (route) => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({
      filename: 'test.jpg',
      mimeType: 'image/jpeg',
    });
    return route.fulfill({
      status: 201,
      json: {
        mediaId,
        expiresIn: 60,
        uploadUrl: 'http://localhost:3002/synthetic-storage/object',
        requiredHeaders: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' },
      },
    });
  });
  await page.route('**/synthetic-storage/object', (route) => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().headers()['if-none-match']).toBe('*');
    puts++;
    return route.fulfill({ status: puts === 1 ? 500 : 200 });
  });
  await page.route('**/api/portfolio/media/' + mediaId + '/upload-complete', (route) => {
    completed++;
    return route.fulfill({ status: 202, json: { ...readyMedia, status: 'PROCESSING' } });
  });
  await page.goto('/dashboard/portfolio');
  await page.getByRole('button', { name: 'Фотобібліотека', exact: true }).click();
  await page
    .getByLabel(/Нове фото/)
    .setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic') });
  await page.getByRole('button', { name: 'Завантажити фото', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Завантаження не завершено' }),
  ).toBeVisible();
  expect(completed).toBe(0);
  await page.getByRole('button', { name: 'Повторити завантаження' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Файл прийнято' })).toBeVisible();
  expect([requests, puts, completed]).toEqual([1, 2, 1]);
});
