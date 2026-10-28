import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/galleries/demo', (route) =>
    route.fulfill({
      json: { id: 'gallery', title: 'Test gallery', description: null, createdAt: '2026-01-01' },
    }),
  );
  await page.route('**/api/public/galleries/demo/photos?*', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'photo',
            filename: 'photo.jpg',
            mimeType: 'image/jpeg',
            width: 10,
            height: 10,
            sortOrder: 0,
            thumbnailUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
            previewUrl: '/preview',
          },
        ],
        nextCursor: null,
      },
    }),
  );
});
const ready = {
  id: 'archive',
  status: 'READY',
  expiresAt: null,
  downloadUrl: 'http://localhost:3002/test.zip',
  expiresIn: 300,
};

test('downloads a prebuilt ZIP on the first click without any generation request', async ({
  page,
}) => {
  let writes = 0;
  let downloadChecks = 0;
  await page.route('**/api/public/galleries/demo/archive', (route) => {
    if (route.request().method() !== 'GET') writes++;
    return route.fulfill({ json: ready });
  });
  await page.route('**/api/public/galleries/demo/archives/archive', (route) => {
    downloadChecks++;
    return route.fulfill({ json: ready });
  });
  await page.route('**/test.zip', (route) =>
    route.fulfill({
      headers: { 'content-disposition': 'attachment; filename="gallery.zip"' },
      contentType: 'application/zip',
      body: 'zip-test-bytes',
    }),
  );
  await page.goto('/g/demo');
  const button = page.getByRole('button', { name: 'Download ZIP', exact: true });
  await expect(button).toBeEnabled();
  await expect(page.getByText('All originals are ready to download.')).toBeVisible();
  const download = page.waitForEvent('download');
  await button.click();
  expect((await download).suggestedFilename()).toBe('gallery.zip');
  expect(downloadChecks).toBe(1);
  expect(writes).toBe(0);
  await expect(page.getByText('Preparing ZIP…')).toHaveCount(0);
});

test('does not start generation when a photographer has not prepared the ZIP', async ({ page }) => {
  let writes = 0;
  let reads = 0;
  await page.route('**/api/public/galleries/demo/archive', (route) => {
    reads++;
    if (route.request().method() !== 'GET') writes++;
    return route.fulfill({
      status: 409,
      json: { message: 'ZIP is not prepared; contact the photographer' },
    });
  });
  await page.goto('/g/demo');
  await expect(page.getByRole('button', { name: 'Download ZIP', exact: true })).toBeDisabled();
  await expect(page.getByText('ZIP is not prepared; contact the photographer')).toBeVisible();
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect.poll(() => reads).toBe(2);
  expect(writes).toBe(0);
});

test('revalidates access at download time and blocks a revoked link', async ({ page }) => {
  let downloads = 0;
  await page.route('**/api/public/galleries/demo/archive', (route) =>
    route.fulfill({ json: ready }),
  );
  await page.route('**/api/public/galleries/demo/archives/archive', (route) =>
    route.fulfill({ status: 404, json: { message: 'Gallery not found' } }),
  );
  await page.route('**/test.zip', (route) => {
    downloads++;
    return route.abort();
  });
  await page.goto('/g/demo');
  await expect(page.getByRole('button', { name: 'Download ZIP', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click();
  await expect(page.getByText('Gallery not found', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download ZIP', exact: true })).toBeDisabled();
  expect(downloads).toBe(0);
});
