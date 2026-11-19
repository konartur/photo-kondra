import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://images.unsplash.com/**', (route) => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
