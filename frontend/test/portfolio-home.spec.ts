import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // External prototype assets should not make the interaction tests depend on internet access.
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="100%" height="100%" fill="#586049"/></svg>',
  }));
});

test('shows the portfolio sections, six services and its own theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const portfolio = page.locator('[data-portfolio]');
  await expect(portfolio).toHaveAttribute('lang', 'uk');
  await expect(portfolio).toHaveCSS('background-color', 'rgb(247, 247, 244)');
  const fontLoaded = await portfolio.evaluate(async (element) => {
    const family = getComputedStyle(element).fontFamily.split(',')[0];
    const faces = await document.fonts.load(`300 48px ${family}`, 'І Ї і ї');
    return faces.some((face) => face.status === 'loaded');
  });
  expect(fontLoaded).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invisible Gallery — портфоліо фотографа');
  await expect(page.locator('main > section')).toHaveCount(4);
  expect(await page.locator('main > section').evaluateAll((sections) => sections.map((section) => section.id)))
    .toEqual(['home', 'services', 'stories', 'contact']);
  const services = page.locator('#services');
  await expect(services.getByText('3 000 грн / 1 год', { exact: true })).toHaveCount(6);
  await expect(services.getByRole('link', { name: /Фотосесія з улюбленцем/ })).toHaveAttribute('href', '/stories/pets');
  await expect(page.locator('#stories').getByRole('link', { name: /Двоє. Одна історія/ })).toHaveAttribute('href', '/stories/love');
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toBeHidden();
  await page.goto('/login');
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toBeChecked();
});

test('supports keyboard menu navigation, Escape and focus restoration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const toggle = page.locator('button[aria-controls="portfolio-menu"]');
  const dialog = page.getByRole('dialog', { name: 'Навігація' });
  const close = dialog.getByRole('button', { name: 'Закрити меню' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(close).toBeFocused();
  await expect(dialog).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('link', { name: 'Головна' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Enter');
  await dialog.getByRole('link', { name: 'Послуги' }).click();
  await expect(page).toHaveURL(/#services$/);
  await expect(dialog).toBeHidden();
  await expect(page.locator('#services')).toBeFocused();
});

test('uses the reference booking styles and animates each menu opening', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const headerBooking = page.getByRole('banner').locator('a[href="#contact"]');
  const finaleBooking = page.locator('#contact a');
  await expect(headerBooking).toHaveCSS('min-height', '44px');
  await expect(headerBooking).toHaveCSS('border-bottom-width', '1px');
  await expect(headerBooking).toHaveCSS('padding', '8px 0px');
  await expect(headerBooking).toHaveCSS('font-size', '12px');
  await expect(finaleBooking).toHaveCSS('column-gap', '45px');
  await expect(page.locator('#services')).toHaveCSS('padding-top', '115.2px');
  await expect(page.locator('#services-title')).toHaveCSS('letter-spacing', '0px');
  await expect(page.locator('#services-title')).toHaveCSS('font-optical-sizing', 'none');

  const toggle = page.locator('button[aria-controls="portfolio-menu"]');
  const dialog = page.getByRole('dialog', { name: 'Навігація' });
  for (let opening = 0; opening < 2; opening++) {
    await toggle.click();
    await expect.poll(() => dialog.evaluate((element) => element.getAnimations()
      .some((animation) => animation.effect?.getTiming().duration === 350))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(finaleBooking).toHaveCSS('column-gap', '20px');
  await expect(page.locator('#services')).toHaveCSS('padding-top', '64px');
});

test('reveals the heading and service card when scrolling on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const heading = page.locator('#services > header');
  const card = page.locator('#services a[href="/stories/love"]');
  for (const target of [heading, card]) {
    await expect(target).toHaveAttribute('data-reveal-state', 'pending');
  }

  await page.locator('#services').evaluate((section) => {
    for (const target of section.querySelectorAll('[data-portfolio-reveal]')) {
      target.addEventListener('animationstart', () => target.setAttribute('data-test-animation-started', ''), { once: true });
    }
    section.scrollIntoView({ behavior: 'instant' });
  });
  for (const target of [heading, card]) {
    await expect(target).toHaveAttribute('data-test-animation-started', '');
    await expect(target).toHaveCSS('opacity', '1');
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(card).toHaveCSS('opacity', '1');
  await expect(card).toHaveCSS('animation-name', 'none');
});

test('scrolls back to the top and brings back the header when scrolling up', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const header = page.getByRole('banner');
  const back = page.getByRole('button', { name: 'Повернутися нагору' });
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(header).toHaveAttribute('data-hidden', 'true');
  await expect(back).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect(header).toHaveAttribute('data-hidden', 'false');
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await expect(back).toBeHidden();
  await page.keyboard.press('Escape');
  await back.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(back).toBeHidden();
});

for (const width of [320, 390, 768, 1440]) {
  test.describe(`portfolio at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: width <= 760 });

    test('selects the right hero crop and fits the viewport', async ({ page }) => {
      await page.goto('/');
      const hero = page.locator('#home img');
      await expect.poll(() => hero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      const source = await hero.evaluate((image: HTMLImageElement) => image.currentSrc);
      expect(new URL(source).searchParams.get('h')).toBe(width <= 760 ? '1200' : null);
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth).toBe(width);

      if (width <= 760) {
        await page.getByRole('button', { name: 'Меню', exact: true }).tap();
        const dialog = page.getByRole('dialog', { name: 'Навігація' });
        await dialog.getByRole('link', { name: 'Історії' }).tap();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/#stories$/);
      }
    });
  });
}
