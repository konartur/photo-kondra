import { expect, test } from '@playwright/test';

const fixture = 'http://127.0.0.1:3003/__portfolio_test';
const slug = 'new-story-from-db';

test.beforeEach(async ({ page, request }) => {
  await request.post(fixture);
  await page.route('**/api/public/portfolio/media/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"/>',
  }));
});

test('renders localized published DTOs, memoizes metadata and reflects publication without a build', async ({ page, request }) => {
  await page.goto('/en');
  await expect(page.getByRole('heading', { name: 'Published services 1' })).toBeVisible();
  await expect(page).toHaveTitle('Published portfolio 1');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://portfolio.example/en');
  expect(await (await request.get(fixture)).json()).toEqual({ reads: 1 });
  await expect(page.getByRole('link', { name: /send email/i })).toHaveAttribute('href', 'mailto:demo@example.invalid');
  await expect(page.locator('picture source').first()).toHaveAttribute('srcset', /480w.*960w/);

  await request.post(fixture + '?revision=2');
  await page.reload();
  await expect(page).toHaveTitle('Published portfolio 2');
  await expect(page.getByRole('heading', { name: 'Published services 2' })).toBeVisible();
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.headers()['cache-control']).toBe('no-store');
  const xml = await sitemap.text();
  expect(xml).toContain('https://portfolio.example/uk/stories/' + slug);
  expect(xml).toContain('hreflang="en"');
});

test('switches the public language on desktop and in the mobile menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/uk?from=menu#services');
  await page.evaluate(() => window.scrollTo({ top: 32, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(32);
  const language = page.getByRole('group', { name: 'Мова портфоліо' });
  await expect(language.getByRole('link', { name: 'Українська' })).toHaveAttribute('aria-current', 'page');
  await language.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\?from=menu#services$/);
  await expect(page.getByRole('group', { name: 'Portfolio language' }).getByRole('link', { name: 'English' }))
    .toHaveAttribute('aria-current', 'page');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(32);

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/en/stories/' + slug + '?from=menu#home');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Navigation' });
  await menu.getByRole('link', { name: 'Українська' }).click();
  await expect(page).toHaveURL('/uk/stories/' + slug + '?from=menu#home');
  await expect(page.locator('[data-portfolio]')).toHaveAttribute('lang', 'uk');
});

test('renders new story slugs and all ten photos and books using the published service', async ({ page, request }) => {
  await request.post(fixture + '?mode=draft');
  expect((await page.goto('/en/stories/' + slug))?.status()).toBe(404);
  await request.post(fixture + '?mode=published');
  expect((await page.goto('/en/stories/' + slug))?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Published story 1' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Frame / })).toHaveCount(10);
  await expect(page.getByRole('img', { name: 'Frame 9' })).toHaveAttribute('loading', 'lazy');
  const book = page.getByRole('button', { name: 'Book', exact: true });
  await book.click();
  const dialog = page.getByRole('dialog', { name: /Tell me.*your story/ });
  await expect(dialog.getByLabel(/Session type/)).toHaveValue('portrait');
  await expect(dialog.getByRole('button', { name: 'Close form' })).toBeFocused();
  await dialog.getByLabel(/Your name/).fill('Tester');
  await dialog.getByLabel(/Email or messenger/).fill('tester@example.invalid');
  await dialog.getByRole('button', { name: /prepare message/i }).click();
  await expect(dialog.getByLabel('Your message')).toHaveValue(/Price:.*2,400/);
  await page.keyboard.press('Escape');
  await expect(book).toBeFocused();
  await page.goto('/#story/' + slug);
  await expect(page).toHaveURL(new RegExp('/stories/' + slug + '$'));
});

test('keeps a general booking enquiry when no session types are bookable', async ({ page, request }) => {
  await request.post(fixture + '?mode=no-booking');
  await page.goto('/uk');
  await expect(page.getByRole('region', { name: 'Контакт' }).getByRole('button', { name: 'Забронювати фотосесію', exact: true })).toBeVisible();
  await page.goto('/en');
  await expect(page.getByRole('group', { name: 'Portfolio language' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Contact' }).getByRole('button', { name: 'Book a photo session', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Book', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Tell me.*your story/ });
  await dialog.getByLabel(/Your name/).fill('Tester');
  await dialog.getByLabel(/Email or messenger/).fill('tester@example.invalid');
  await expect(dialog.getByLabel(/Session type/)).toHaveCount(0);
  await dialog.getByRole('button', { name: /prepare message/i }).click();
  await expect(dialog.getByLabel('Your message')).toHaveValue(/discuss a photo session/);
  await expect(dialog.getByLabel('Your message')).not.toHaveValue(/Price:/);

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/en/stories/' + slug);
  await expect(page.getByRole('region', { name: 'Photo session enquiry' }).getByRole('button')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Book', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Navigation' }).getByRole('group', { name: 'Portfolio language' })).toBeVisible();
});

test('distinguishes missing, empty, malformed and unavailable published content', async ({ page, request }) => {
  expect((await page.goto('/en/stories/unknown'))?.status()).toBe(404);
  await request.post(fixture + '?mode=empty');
  await page.goto('/en');
  await expect(page.getByRole('heading', { name: 'Portfolio is coming soon' })).toBeVisible();
  for (const mode of ['invalid', 'down']) {
    await request.post(fixture + '?mode=' + mode);
    await page.goto('/en');
    await expect(page.getByRole('heading', { name: 'Portfolio temporarily unavailable' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect((await request.get('/sitemap.xml')).status()).toBe(503);
  }
});
