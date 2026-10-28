import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      name: 'photo_cloud_access_token',
      value: 'playwright-test',
      url: 'http://localhost:3002',
      httpOnly: true,
    },
  ]);
  await page.route('**/api/galleries/gallery', (route) =>
    route.fulfill({
      json: {
        id: 'gallery',
        title: 'Upload test',
        description: null,
        status: 'DRAFT',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    }),
  );
});

test('disables publication immediately on selection and enables only after server READY', async ({
  page,
}) => {
  let processing = false;
  let ready = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/galleries/gallery/archive', (route) =>
    route.fulfill({
      json: {
        id: null,
        status: 'NOT_PREPARED',
        canPublish: !processing || ready,
        pendingPhotoCount: processing && !ready ? 1 : 0,
      },
    }),
  );
  await page.route('**/api/galleries/gallery/photos?*', (route) =>
    route.fulfill({
      json: {
        items: processing
          ? [{ id: 'new-photo', filename: 'new.png', status: ready ? 'READY' : 'PROCESSING' }]
          : [],
        nextCursor: null,
      },
    }),
  );
  await page.route('**/api/galleries/gallery/photos/upload-url', async (route) => {
    await gate;
    await route.fulfill({
      json: { photoId: 'new-photo', uploadUrl: 'https://storage.example/upload', expiresIn: 900 },
    });
  });
  await page.route('https://storage.example/upload', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'PUT, OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
      body: '',
    }),
  );
  await page.route('**/api/photos/new-photo/upload-complete', (route) => {
    processing = true;
    return route.fulfill({ json: { id: 'new-photo', status: 'PROCESSING' } });
  });
  await page.goto('/dashboard/galleries/gallery');
  const publish = page.getByRole('button', {
    name: 'Publish gallery and prepare ZIP',
    exact: true,
  });
  await expect(publish).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'new.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake test image'),
    });
  await expect(publish).toBeDisabled();
  release();
  await expect.poll(() => processing).toBe(true);
  await expect(publish).toBeDisabled();
  await expect(
    page.getByText('Wait until all uploaded photos are Ready.', { exact: false }),
  ).toBeVisible();
  ready = true;
  await expect(publish).toBeEnabled({ timeout: 15000 });
});

test('keeps publication disabled for incomplete server uploads after page reload', async ({
  page,
}) => {
  await page.route('**/api/galleries/gallery/archive', (route) =>
    route.fulfill({
      json: { id: null, status: 'NOT_PREPARED', canPublish: false, pendingPhotoCount: 1 },
    }),
  );
  await page.route('**/api/galleries/gallery/photos?*', (route) =>
    route.fulfill({ json: { items: [{ id: 'old', status: 'UPLOADING' }], nextCursor: null } }),
  );
  await page.goto('/dashboard/galleries/gallery');
  const publish = page.getByRole('button', {
    name: 'Publish gallery and prepare ZIP',
    exact: true,
  });
  await expect(publish).toBeDisabled();
  await page.reload();
  await expect(publish).toBeDisabled();
});
