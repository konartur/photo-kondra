import { expect, test } from '@playwright/test';

const url = 'http://localhost:3002/g/test-client-token';
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
        title: 'Published gallery',
        description: null,
        status: 'READY',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    }),
  );
  await page.route('**/api/galleries/gallery/archive', (route) =>
    route.fulfill({
      json: { id: 'archive', status: 'READY', canPublish: true, pendingPhotoCount: 0 },
    }),
  );
});

test('copies a private URL for READY and reuses it on repeated clicks', async ({ page }) => {
  let created = 0;
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copiedLink = text;
        },
      },
    }),
  );
  await page.route('**/api/galleries/gallery/access-links', (route) => {
    created++;
    return route.fulfill({ status: 201, json: { id: 'link', url } });
  });
  await page.goto('/dashboard/galleries/gallery');
  await page.getByRole('button', { name: 'Copy private link', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Private link copied.' })).toBeVisible();
  await expect(page.getByLabel('Private gallery link')).toHaveValue(url);
  expect(await page.locator('html').getAttribute('data-copied-link')).toBe(url);
  await page.getByRole('button', { name: 'Copy again', exact: true }).click();
  expect(created).toBe(1);
});

test('shows the URL for manual copying when clipboard permission is denied', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Denied');
        },
      },
    }),
  );
  await page.route('**/api/galleries/gallery/access-links', (route) =>
    route.fulfill({ status: 201, json: { id: 'link', url } }),
  );
  await page.goto('/dashboard/galleries/gallery');
  await page.getByRole('button', { name: 'Copy private link', exact: true }).click();
  await expect(page.getByLabel('Private gallery link')).toHaveValue(url);
  await expect(page.getByRole('alert')).toContainText('copy it manually');
});

test('reports a rejected link creation without displaying a URL', async ({ page }) => {
  await page.route('**/api/galleries/gallery/access-links', (route) =>
    route.fulfill({ status: 409, json: { message: 'Publish gallery first' } }),
  );
  await page.goto('/dashboard/galleries/gallery');
  await page.getByRole('button', { name: 'Copy private link', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Publish gallery first');
  await expect(page.getByLabel('Private gallery link')).toHaveCount(0);
});

for (const status of ['DRAFT', 'PROCESSING'])
  test(`does not offer sharing for ${status}`, async ({ page }) => {
    await page.route('**/api/galleries/gallery', (route) =>
      route.fulfill({ json: { id: 'gallery', title: 'Not published', description: null, status } }),
    );
    await page.route('**/api/galleries/gallery/photos?*', (route) =>
      route.fulfill({ json: { items: [], nextCursor: null } }),
    );
    await page.goto('/dashboard/galleries/gallery');
    await expect(page.getByRole('heading', { name: 'Gallery details' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Share with client' })).toHaveCount(0);
  });
