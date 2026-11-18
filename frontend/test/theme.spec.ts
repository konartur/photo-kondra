import { expect, test } from '@playwright/test';

test('keeps an accessible fixed toggle and saved choice across Photo Cloud routes', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  const toggle = page.getByRole('switch', { name: 'Dark mode' });
  await expect(toggle).toBeChecked();
  await expect(page.locator('section')).toHaveCSS('background-color', 'rgb(24, 24, 27)');
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('section')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeVisible();
  await expect(page.locator('section')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.screenshot({ path: testInfo.outputPath('login-light.png') });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await expect(page.locator('section')).toHaveCSS('background-color', 'rgb(24, 24, 27)');
  await page.screenshot({ path: testInfo.outputPath('login-dark.png') });
  await context.addCookies([
    {
      name: 'photo_cloud_access_token',
      value: 'playwright-test',
      url: 'http://localhost:3002',
      httpOnly: true,
    },
  ]);
  await page.route('**/api/galleries?*', (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.goto('/dashboard');
  await expect(toggle).toBeChecked();
  await expect(toggle).toHaveCSS('position', 'fixed');
  await page.screenshot({ path: testInfo.outputPath('dashboard-dark.png') });
  await page.goto('/missing-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(250, 250, 250)');
  expect(errors).toEqual([]);
});

test('follows system preference until selected and syncs changes between tabs', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');
  const toggle = page.getByRole('switch', { name: 'Dark mode' });
  await expect(toggle).not.toBeChecked();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(toggle).not.toBeChecked();
  const second = await context.newPage();
  await second.goto('/login');
  await expect(second.getByRole('switch', { name: 'Dark mode' })).not.toBeChecked();
  await second.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(toggle).toBeChecked();
  await second.evaluate(() => localStorage.removeItem('photo-cloud-theme'));
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(toggle).not.toBeChecked();
  await second.close();
});

test('still switches when browser storage is blocked', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');
  const toggle = page.getByRole('switch', { name: 'Dark mode' });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(toggle).toBeChecked();
  expect(errors).toEqual([]);
});

for (const width of [320, 1280]) {
  test(`switches inside the photo viewer and keeps controls separate at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme: 'light' });
    const preview = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#4f6a82"/><circle cx="400" cy="300" r="120" fill="#e4c58e"/></svg>')}`;
    await page.route('**/api/public/galleries/theme', (route) =>
      route.fulfill({
        json: {
          id: 'gallery',
          title: 'Theme gallery',
          description: 'Private photo delivery',
          createdAt: '2026-01-01',
        },
      }),
    );
    await page.route('**/api/public/galleries/theme/photos?*', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: 'photo',
              filename: 'sample.jpg',
              mimeType: 'image/jpeg',
              width: 800,
              height: 600,
              thumbnailUrl: preview,
              previewUrl: preview,
              sortOrder: 0,
            },
          ],
          nextCursor: null,
        },
      }),
    );
    await page.route('**/api/public/galleries/theme/archive', (route) =>
      route.fulfill({
        json: {
          id: 'archive',
          status: 'READY',
          downloadUrl: '/test.zip',
          expiresIn: 300,
          expiresAt: null,
        },
      }),
    );
    await page.goto('/g/theme');
    await expect(page.getByRole('heading', { name: 'Theme gallery' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('gallery-light.png') });
    await page.getByRole('button', { name: 'Open sample.jpg' }).click();
    const dialog = page.getByRole('dialog');
    const toggle = dialog.getByRole('switch', { name: 'Dark mode' });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Dark mode' })).toHaveCount(1);
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();
    const buttonBox = await toggle.boundingBox();
    const downloadBox = await dialog
      .getByRole('button', { name: 'Download original' })
      .boundingBox();
    expect(buttonBox!.x).toBeGreaterThan(downloadBox!.x + downloadBox!.width);
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Next photo' })).not.toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Download original' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('viewer-dark.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('switch', { name: 'Dark mode' })).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath('gallery-dark.png') });
  });
}
