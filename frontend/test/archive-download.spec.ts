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

test('selects photos, waits for generation and downloads a separate ZIP', async ({ page }) => {
  let requests = 0;
  let checks = 0;
  await page.route('**/api/public/galleries/demo/archive', (route) =>
    route.fulfill({ json: ready }),
  );
  await page.route('**/api/public/galleries/demo/archives', (route) => {
    requests++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ photoIds: ['photo'] });
    return route.fulfill({
      status: 202,
      json: { id: 'selection', status: 'PENDING', expiresAt: null },
    });
  });
  await page.route('**/api/public/galleries/demo/archives/selection', (route) => {
    checks++;
    return route.fulfill({
      json:
        checks === 1
          ? { id: 'selection', status: 'PROCESSING', expiresAt: null }
          : { ...ready, id: 'selection' },
    });
  });
  await page.route('**/test.zip', (route) =>
    route.fulfill({
      headers: { 'content-disposition': 'attachment; filename="selected.zip"' },
      contentType: 'application/zip',
      body: 'selected-zip',
    }),
  );
  await page.goto('/g/demo');
  await expect(
    page.getByRole('button', { name: 'Download selected (0)', exact: true }),
  ).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Select photo.jpg' }).check();
  await page.getByRole('button', { name: 'Download selected (1)', exact: true }).click();
  await expect(
    page.getByText('Preparing 1 selected originals. You can keep browsing.'),
  ).toBeVisible();
  const save = page.getByRole('button', { name: 'Save selected ZIP' });
  await expect(save).toBeVisible();
  const download = page.waitForEvent('download');
  await save.click();
  expect((await download).suggestedFilename()).toBe('selected.zip');
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Select photo.jpg' })).not.toBeChecked();
});

test('allows retry after failed selection generation and rechecks revoked access before downloading', async ({
  page,
}) => {
  let requests = 0;
  let revoked = false;
  await page.route('**/api/public/galleries/demo/archive', (route) =>
    route.fulfill({ json: ready }),
  );
  await page.route('**/api/public/galleries/demo/archives', (route) => {
    requests++;
    return route.fulfill({
      status: 202,
      json: { id: `selection-${requests}`, status: 'PENDING', expiresAt: null },
    });
  });
  await page.route('**/api/public/galleries/demo/archives/selection-*', (route) => {
    if (revoked) return route.fulfill({ status: 404, json: { message: 'Gallery not found' } });
    return route.fulfill({
      json: { ...ready, id: `selection-${requests}`, status: requests === 1 ? 'FAILED' : 'READY' },
    });
  });
  await page.goto('/g/demo');
  await page.getByRole('checkbox', { name: 'Select photo.jpg' }).check();
  await page.getByRole('button', { name: 'Download selected (1)', exact: true }).click();
  await expect(page.getByText('Selected ZIP preparation failed. Please try again.')).toBeVisible();
  await page.getByRole('button', { name: 'Download selected (1)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save selected ZIP' })).toBeVisible();
  revoked = true;
  await page.getByRole('button', { name: 'Save selected ZIP' }).click();
  await expect(page.getByText('Gallery not found', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save selected ZIP' })).toHaveCount(0);
  expect(requests).toBe(2);
});

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
