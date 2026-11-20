import { expect, test } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

test.use({
  viewport: { width: 414, height: 628 },
  screen: { width: 414, height: 736 },
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
});

function containsStaticBlock(source: string): boolean {
  const file = ts.createSourceFile('client.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node: ts.Node): boolean {
    return ts.isClassStaticBlockDeclaration(node) || Boolean(ts.forEachChild(node, visit));
  }
  return visit(file);
}

test('all production client chunks exclude class static blocks unsupported by Safari 15', async () => {
  const directory = path.resolve(process.env.PHOTO_CLOUD_E2E_DIST_DIR ?? '.next-e2e', 'static');
  const files = (await readdir(directory, { recursive: true })).filter((file) => file.endsWith('.js'));
  expect(files.length).toBeGreaterThan(0);
  const unsupported: string[] = [];
  for (const file of files) {
    if (containsStaticBlock(await readFile(path.join(directory, file), 'utf8'))) unsupported.push(file);
  }
  expect(unsupported).toEqual([]);
});

for (const path of ['/', '/stories/love', '/stories/portrait', '/stories/family', '/stories/events', '/stories/brand', '/stories/pets']) {
  test(`iPhone Safari 15 can tap menu and every booking CTA on ${path}`, async ({ page }) => {
    const unsupportedScripts: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('https://images.unsplash.com/**', (route) => route.abort());
    // Model Safari 15's parse rejection: changing only the UA does not emulate
    // its JavaScript engine. Never execute a bundle it cannot parse.
    await page.route('**/_next/static/**/*.js', async (route) => {
      const response = await route.fetch();
      if (containsStaticBlock(await response.text())) {
        unsupportedScripts.push(new URL(route.request().url()).pathname);
        await route.abort();
      } else {
        await route.fulfill({ response });
      }
    });
    await page.goto(path);
    const menuToggle = page.getByRole('button', { name: 'Меню', exact: true });
    await menuToggle.tap();
    const menu = page.getByRole('dialog', { name: 'Навігація' });
    await expect(menu, `Safari 15 rejected bundles: ${unsupportedScripts.join(', ')}`).toBeVisible();
    await menu.getByRole('button', { name: 'Закрити меню' }).tap();
    await expect(menu).toBeHidden();
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    const triggers = [
      page.getByRole('button', { name: 'Забронювати', exact: true }),
      page.getByRole('button', { name: 'Забронювати фотосесію', exact: true }),
    ];
    const booking = page.getByRole('dialog', { name: /Розкажіть.*свою історію/ });
    for (const trigger of triggers) {
      await trigger.tap();
      await expect(booking).toBeVisible();
      await expect(booking.getByLabel(/Тип фотосесії/)).toHaveValue(path === '/' ? '' : path.slice('/stories/'.length));
      await booking.getByRole('button', { name: 'Закрити форму' }).tap();
      await expect(booking).toBeHidden();
      await expect(trigger).toBeFocused();
    }
    expect(unsupportedScripts).toEqual([]);
    expect(errors).toEqual([]);
  });
}
