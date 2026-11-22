import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // External prototype assets should not make the interaction tests depend on internet access.
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="100%" height="100%" fill="#586049"/></svg>',
  }));
});

test('serves all six public stories and returns 404 for an unknown story', async ({ page }) => {
  const stories = [
    ['love', 'Love Story'], ['portrait', 'Portrait'], ['family', 'Family'],
    ['events', 'Events / Lifestyle'], ['brand', 'Brand / Commercial'], ['pets', 'Фотосесія з улюбленцем'],
  ];
  await page.goto('/');
  for (const [slug] of stories) {
    await expect(page.locator(`#services a[href="/stories/${slug}"]`)).toHaveCount(1);
  }
  for (const [slug, title] of stories) {
    expect((await page.goto(`/stories/${slug}`))?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page).toHaveTitle(`${title} — PhotoKondra`);
    await expect(page.locator('main img')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Забронювати фотосесію' })).toHaveAttribute('aria-controls', 'portfolio-booking');
  }
  expect((await page.goto('/stories/unknown'))?.status()).toBe(404);
});

test('redirects legacy story URLs and preserves navigation history', async ({ page }) => {
  await page.goto('/#story/pets');
  await expect(page).toHaveURL(/\/stories\/pets$/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Фотосесія з улюбленцем' })).toBeVisible();
  const next = page.getByRole('region', { name: 'НАСТУПНА ІСТОРІЯ →' });
  await next.getByRole('link').click();
  await expect(page).toHaveURL(/\/stories\/love$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/stories\/pets$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/stories\/love$/);
  await page.getByRole('link', { name: /ПОВЕРНУТИСЯ НА ГОЛОВНУ/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/портфоліо фотографа/);
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
  await expect(page).toHaveTitle('PhotoKondra — Photography');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('PhotoKondra — портфоліо фотографа');
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
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link', { name: 'Контакти' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
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

  const headerBooking = page.getByRole('banner').getByRole('button', { name: 'Забронювати', exact: true });
  const finaleBooking = page.locator('#contact').getByRole('button', { name: 'Забронювати фотосесію' });
  await expect(headerBooking).toHaveCSS('min-height', '44px');
  await expect(headerBooking).toHaveCSS('border-bottom-width', '1px');
  await expect(headerBooking).toHaveCSS('padding', '8px 0px');
  await expect(headerBooking).toHaveCSS('font-size', '12px');
  await expect(finaleBooking).toHaveCSS('column-gap', '45px');
  await expect.poll(() => page.locator('#services').evaluate((element) =>
    parseFloat(getComputedStyle(element).paddingTop))).toBeCloseTo(115.2, 2);
  // CSS optimization can serialize zero tracking as either 0px or normal.
  await expect(page.locator('#services-title')).toHaveCSS('letter-spacing', /^(0px|normal)$/);
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
  await expect(page.locator('[data-portfolio-reveal]').first()).toHaveAttribute('data-reveal-state', /pending|visible/);
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

test('keeps the header steady around the services boundary and ignores small scroll reversals', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 800 });
  await page.goto('/');
  await expect(page.locator('[data-portfolio-reveal]').first()).toHaveAttribute('data-reveal-state', /pending|visible/);
  const header = page.getByRole('banner');
  const boundary = await page.locator('#home').evaluate((hero: HTMLElement) => hero.offsetHeight);
  const scrollTo = async (y: number) => {
    await page.evaluate(async (top) => {
      window.scrollTo({ top, behavior: 'instant' });
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, y);
  };
  await scrollTo(boundary - 10);
  await expect(header).toHaveAttribute('data-hidden', 'false');
  await scrollTo(boundary + 4);
  await expect(header).toHaveAttribute('data-hidden', 'false');
  await scrollTo(boundary + 70);
  await expect(header).toHaveAttribute('data-hidden', 'true');
  for (const offset of [64, 70, 62, 68]) {
    await scrollTo(boundary + offset);
    await expect(header).toHaveAttribute('data-hidden', 'true');
  }
  await scrollTo(boundary + 40);
  await expect(header).toHaveAttribute('data-hidden', 'false');
  await scrollTo(boundary + 52);
  await expect(header).toHaveAttribute('data-hidden', 'false');
  await expect(header).toHaveCSS('transition-duration', '0.65s, 0.35s, 0.35s');
});

test('does not toggle the mobile header during browser chrome viewport changes', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Browser chrome emulation uses the Chromium DevTools protocol.');
  const context = await browser.newContext({
    viewport: { width: 402, height: 714 }, screen: { width: 402, height: 874 }, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"/>',
  }));
  try {
    await page.goto('/');
    await expect(page.locator('[data-portfolio-reveal]').first()).toHaveAttribute('data-reveal-state', /pending|visible/);
    const header = page.getByRole('banner');
    await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'true');
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 402, height: 754, screenWidth: 402, screenHeight: 874, deviceScaleFactor: 1, mobile: true,
    });
    await page.evaluate(async () => {
      window.scrollTo({ top: 900, behavior: 'instant' });
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await expect(header).toHaveAttribute('data-hidden', 'true');
    await expect(header).toHaveCSS('position', 'sticky');
    // Resume deliberate scrolling after the browser chrome has settled.
    await page.waitForTimeout(220);
    await page.evaluate(() => window.scrollTo({ top: 850, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'false');
  } finally {
    await context.close();
  }
});

test('keeps safe-area spacing inside the mobile hero, including before hydration', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Safe-area emulation uses the Chromium DevTools protocol.');
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 402, height: 673 }, javaScriptEnabled });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 67 } });
    await page.route('https://images.unsplash.com/**', (route) => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"/>',
    }));
    try {
      await page.goto('/');
      await expect.poll(() => page.locator('#home img').evaluate((image) => ({
        bottom: image.getBoundingClientRect().bottom,
        servicesTop: document.getElementById('services')?.getBoundingClientRect().top,
      }))).toEqual({ bottom: 673, servicesTop: 673 });
      const hint = await page.locator('#home a[href="#services"]').boundingBox();
      expect(hint).not.toBeNull();
      expect(hint!.y + hint!.height).toBeLessThanOrEqual(673);
    } finally {
      await context.close();
    }
  }
});

test('keeps the hero flow and caption stable while its photo paints behind phone chrome', async ({ browser, browserName }) => {
  const context = await browser.newContext({
    viewport: { width: 402, height: 714 },
    screen: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  if (browserName === 'chromium') {
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 67 } });
  }
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"/>',
  }));
  try {
    await page.goto('/');
    await expect(page.locator('#home')).toHaveCSS('height', '714px');
    await expect.poll(() => page.locator('#home img').evaluate((image) => ({
      bottom: image.getBoundingClientRect().bottom,
      servicesTop: document.getElementById('services')?.getBoundingClientRect().top,
    }))).toEqual({ bottom: 874, servicesTop: 714 });
    const hint = await page.locator('#home a[href="#services"]').boundingBox();
    expect(hint).not.toBeNull();
    expect(hint!.y + hint!.height).toBeLessThanOrEqual(714);
    const caption = page.locator('#home a[href="#services"]');
    const captionBefore = await caption.boundingBox();
    await expect(page.locator('[data-portfolio-reveal]').first()).toHaveAttribute('data-reveal-state', /pending|visible/);
    if (browserName === 'chromium') {
      // setViewportSize also changes screen.height. A collapsing toolbar changes
      // only the viewport, so keep the emulated physical screen unchanged.
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: 402, height: 754, screenWidth: 402, screenHeight: 874,
        deviceScaleFactor: 1, mobile: true,
      });
      await session.send('Emulation.setSmallViewportHeightDifferenceOverride', { difference: 40 });
      await expect(page.locator('#home')).toHaveCSS('height', '714px');
      expect(await caption.boundingBox()).toEqual(captionBefore);
      await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }));
      await expect.poll(() => caption.evaluate((element) => Math.round(element.getBoundingClientRect().bottom + window.scrollY)))
        .toBe(Math.round(captionBefore!.y + captionBefore!.height));
      await expect(page.locator('[data-portfolio]')).toHaveAttribute('data-portfolio-scrolled', '');
    }
  } finally {
    await context.close();
  }
});

test('paints the photo beyond the layout viewport at the top without covering services when scrolling', async ({ browser }) => {
  // Expose the area normally obscured by browser chrome so hit testing can
  // verify that the photo actually paints there, rather than only measuring it.
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 }, screen: { width: 402, height: 874 }, isMobile: true, hasTouch: true,
  });
  await context.addInitScript(() => Object.defineProperty(window.visualViewport, 'height', { get: () => 714 }));
  const page = await context.newPage();
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"/>',
  }));
  try {
    await page.goto('/');
    await expect(page.locator('#home')).toHaveCSS('height', '714px');
    expect(await page.evaluate(() => Boolean(document.elementFromPoint(10, 800)?.closest('#home')))).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 100, behavior: 'instant' }));
    await expect(page.locator('[data-portfolio]')).toHaveAttribute('data-portfolio-scrolled', '');
    expect(await page.evaluate(() => Boolean(document.elementFromPoint(10, 700)?.closest('#home')))).toBe(false);
  } finally {
    await context.close();
  }
});

test('sizes the phone hero before hydration and keeps its size when hydration finishes', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 402, height: 714 },
    screen: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  let releaseScripts = () => {};
  const scriptsReady = new Promise<void>((resolve) => { releaseScripts = resolve; });
  await page.route('**/_next/**/*.js*', async (route) => {
    await scriptsReady;
    await route.continue();
  });
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"/>',
  }));
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('#home')).toHaveCSS('height', '714px');
    // WebKit waits for the blocked scripts before resolving document.fonts.ready.
    // Load only the font whose metrics the assertion compares.
    await page.locator('#home a[href="#services"]').evaluate(async (element) => {
      const style = getComputedStyle(element);
      await document.fonts.load(`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`, element.textContent ?? '');
    });
    const before = await page.locator('#home img').boundingBox();
    const hintBefore = await page.locator('#home a[href="#services"]').boundingBox();
    releaseScripts();
    // This attribute is added by a React effect, so it confirms hydration ran.
    await expect(page.locator('[data-portfolio-reveal]').first()).toHaveAttribute('data-reveal-state', /pending|visible/);
    expect(await page.locator('#home img').boundingBox()).toEqual(before);
    expect(await page.locator('#home a[href="#services"]').boundingBox()).toEqual(hintBefore);
  } finally {
    releaseScripts();
    await context.close();
  }
});

test('keeps the mobile hero full height and the header visible throughout it', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 780 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const hero = page.locator('#home');
  const header = page.getByRole('banner');
  const back = page.getByRole('button', { name: 'Повернутися нагору' });
  await expect(hero).toHaveCSS('height', '780px');
  await page.setViewportSize({ width: 402, height: 874 });
  await expect.poll(() => hero.locator('img').evaluate((image) => {
    const { top, bottom } = image.getBoundingClientRect();
    return [top, bottom, document.getElementById('services')?.getBoundingClientRect().top];
  })).toEqual([0, 874, 874]);
  await expect(back).toBeHidden();

  const booking = await header.getByRole('button', { name: 'Забронювати', exact: true }).boundingBox();
  const menu = await header.getByRole('button', { name: 'Меню', exact: true }).boundingBox();
  expect(booking?.y).toBe(menu?.y);

  await page.evaluate(async () => {
    for (let y = 4; y <= 420; y += 4) {
      window.scrollTo(0, y);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
  });
  await expect(header).toHaveAttribute('data-hidden', 'false');
  await expect(back).toBeInViewport();

  await page.evaluate(() => window.scrollTo(0, 930));
  await expect(header).toHaveAttribute('data-hidden', 'true');
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(header).toHaveAttribute('data-hidden', 'false');
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
