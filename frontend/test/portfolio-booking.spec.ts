import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://images.unsplash.com/**', (route) => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('booking with the iPhone keyboard open', () => {
  test.use({ viewport: { width: 414, height: 628 }, isMobile: true, hasTouch: true });

  for (const path of ['/', '/stories/pets']) {
    test(`keeps the form and focused field inside the visible viewport on ${path}`, async ({ page }) => {
      await page.addInitScript(() => {
        const viewport = window.visualViewport;
        if (!viewport) throw new Error('VisualViewport is required by this regression scenario');
        let height = window.innerHeight;
        let offsetTop = 0;
        // Desktop WebKit does not open an iOS keyboard. Model both viewport
        // shrinkage and Safari's focus-induced panning, keeping the layout fixed.
        Object.defineProperties(viewport, {
          height: { get: () => height },
          offsetTop: { get: () => offsetTop },
        });
        window.addEventListener('test-keyboard-viewport', (event) => {
          if (!(event instanceof CustomEvent)) return;
          height = event.detail.height;
          offsetTop = event.detail.offsetTop;
          viewport.dispatchEvent(new Event(event.detail.event ?? 'resize'));
        });
      });
      await page.goto(path);
      await page.getByRole('button', { name: 'Забронювати', exact: true }).tap();
      const dialog = page.getByRole('dialog', { name: /Розкажіть.*свою історію/ });
      const scrollPanel = dialog.locator(':scope > div');
      const name = dialog.getByLabel(/Ваше ім’я/);
      const note = dialog.getByLabel(/Ваші побажання/);
      await name.fill('Марія');
      // Safari can scroll the layout document to reveal a focused input even
      // with overflow:hidden. The background must stay locked under the modal.
      const lockedScroll = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
      expect(await page.evaluate(() => window.scrollY)).toBe(lockedScroll);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-keyboard-viewport', {
        detail: { height: 300, offsetTop: 120 },
      })));
      await expect(dialog).toHaveCSS('top', '0px');
      await expect(dialog).toHaveCSS('height', '628px');
      await expect(scrollPanel).toHaveCSS('top', '120px');
      await expect(scrollPanel).toHaveCSS('height', '300px');
      const expectFieldVisible = async (field: typeof name) => {
        await expect.poll(async () => {
          const panel = await scrollPanel.boundingBox();
          const input = await field.boundingBox();
          return Boolean(panel && input && input.y >= panel.y && input.y + input.height <= panel.y + panel.height);
        }).toBe(true);
      };
      await expectFieldVisible(name);
      await note.fill('Зйомка на природі');
      // Safari can pan without a resize while switching between fields.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-keyboard-viewport', {
        detail: { height: 280, offsetTop: 170, event: 'scroll' },
      })));
      await expect(dialog).toHaveCSS('top', '0px');
      await expect(scrollPanel).toHaveCSS('top', '170px');
      await expect(scrollPanel).toHaveCSS('height', '280px');
      await expectFieldVisible(note);
      await expect(dialog.getByRole('button', { name: 'Закрити форму' })).toBeInViewport();
      await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
      await note.evaluate((element) => element.blur());
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-keyboard-viewport', {
        detail: { height: 628, offsetTop: 0 },
      })));
      await expect(dialog).toHaveCSS('top', '0px');
      await expect(dialog).toHaveCSS('height', '628px');
      await expect(scrollPanel).toHaveCSS('top', '0px');
      await expect(scrollPanel).toHaveCSS('height', '628px');
      await expect(name).toHaveValue('Марія');
      await expect(note).toHaveValue('Зйомка на природі');
      await dialog.getByRole('button', { name: 'Закрити форму' }).tap();
      await expect(dialog).toBeHidden();
      await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
    });
  }
});

test('opens the same booking form from both CTAs and returns focus', async ({ page }) => {
  for (const path of ['/', '/stories/pets']) {
    await page.goto(path);
    const dialog = page.getByRole('dialog', { name: /Розкажіть.*свою історію/ });
    const triggers = [
      page.getByRole('button', { name: 'Забронювати', exact: true }),
      page.getByRole('button', { name: 'Забронювати фотосесію' }),
    ];
    for (const trigger of triggers) {
      await trigger.click();
      const close = dialog.getByRole('button', { name: 'Закрити форму' });
      await expect(close).toBeFocused();
      await expect(dialog.getByLabel(/Тип фотосесії/)).toHaveValue(path === '/' ? '' : 'pets');
      await expect(dialog.getByRole('option')).toHaveCount(7);
      await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByRole('button', { name: 'ПІДГОТУВАТИ ЗАЯВКУ' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  }
});

for (const clipboardAvailable of [true, false]) {
  test(`prepares a local message and handles ${clipboardAvailable ? 'clipboard success' : 'manual copy'}`, async ({ page }) => {
    await page.addInitScript((available) => {
      Object.defineProperty(navigator, 'clipboard', { value: available ? {
        writeText: async (text: string) => { document.body.dataset.copiedBooking = text; },
      } : undefined });
    }, clipboardAvailable);
    await page.setViewportSize({ width: 390, height: 650 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Забронювати', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Розкажіть.*свою історію/ });
    const submit = dialog.getByRole('button', { name: 'ПІДГОТУВАТИ ЗАЯВКУ' });
    await submit.click();
    await expect(dialog.getByLabel(/Ваше ім’я/)).toBeFocused();
    await expect(dialog.getByLabel(/Ваше ім’я/)).toHaveAccessibleDescription('Вкажіть ваше ім’я.');
    await expect(dialog.getByLabel(/Email або месенджер/)).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByLabel(/Тип фотосесії/)).toHaveAttribute('aria-invalid', 'true');

    const marker = 'booking-private-r3qz';
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url() + (request.postData() ?? '')));
    await dialog.getByLabel(/Ваше ім’я/).fill('Марія');
    await dialog.getByLabel(/Email або месенджер/).fill(marker);
    await dialog.getByLabel(/Тип фотосесії/).selectOption('pets');
    await submit.click();
    const message = dialog.getByLabel('Текст вашої заявки');
    await expect(message).toHaveValue(new RegExp(`${marker}[\\s\\S]*Фотосесія з улюбленцем`));
    await dialog.getByRole('button', { name: 'Скопіювати текст заявки' }).click();
    if (clipboardAvailable) {
      await expect(dialog.getByRole('status')).toHaveText(/Текст скопійовано/);
      await expect(page.locator('body')).toHaveAttribute('data-copied-booking', new RegExp(marker));
    } else {
      await expect(dialog.getByRole('status')).toHaveText(/Скопіюйте його вручну/);
      await expect(message).toBeFocused();
      expect(await message.evaluate((field: HTMLTextAreaElement) => field.selectionEnd - field.selectionStart)).toBeGreaterThan(0);
    }
    expect(requests.some((request) => request.includes(marker))).toBe(false);
    await expect(page).toHaveURL(/\/$/);
    await dialog.getByLabel(/Ваші побажання/).fill('Оновлені побажання');
    await expect(message).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Закрити форму' }).click();
    await expect(dialog).toBeHidden();
  });
}
