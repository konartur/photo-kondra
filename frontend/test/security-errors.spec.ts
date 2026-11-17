import { expect, test } from '@playwright/test';

test('isolates client quotas through real Next.js forwarding and rejects untrusted ingress', async ({
  request,
  playwright,
}) => {
  const path = '/api/public/galleries/client-isolation';
  expect((await request.get(path)).status()).toBe(200);
  expect((await request.get(path)).status()).toBe(200);
  expect((await request.get(path)).status()).toBe(429);
  const other = await playwright.request.newContext({
    baseURL: 'http://localhost:3002',
    extraHTTPHeaders: {
      'X-Photo-Ingress-Key': 'playwright-only-bff-secret-at-least-32-bytes',
      'X-Photo-Client-IP': '192.0.2.2',
    },
  });
  const forged = await playwright.request.newContext({
    baseURL: 'http://localhost:3002',
    extraHTTPHeaders: {
      'X-Photo-Client-IP': '192.0.2.3',
      'X-Forwarded-For': '192.0.2.3',
    },
  });
  try {
    expect((await other.get(path)).status()).toBe(200);
    expect((await forged.get(path)).status()).toBe(503);
  } finally {
    await other.dispose();
    await forged.dispose();
  }
});

test('keeps a temporarily unavailable dashboard out of the refresh flow', async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: 'photo_cloud_access_token',
      value: 'unavailable-admin',
      url: 'http://localhost:3002',
      httpOnly: true,
    },
    {
      name: 'photo_cloud_refresh_token',
      value: 'test-refresh-token',
      url: 'http://localhost:3002',
      httpOnly: true,
    },
  ]);
  let refreshes = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/auth/refresh')) refreshes++;
  });
  await page.goto('/dashboard');
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Authentication service is temporarily unavailable' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(refreshes).toBe(0);
});

test('keeps a throttled dashboard on its URL without attempting refresh', async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: 'photo_cloud_access_token',
      value: 'throttled-admin',
      url: 'http://localhost:3002',
      httpOnly: true,
    },
    {
      name: 'photo_cloud_refresh_token',
      value: 'test-refresh-token',
      url: 'http://localhost:3002',
      httpOnly: true,
    },
  ]);
  let refreshes = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/auth/refresh')) refreshes++;
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('alert').filter({ hasText: 'Too many requests' })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(refreshes).toBe(0);
});

test('preserves login throttling status and retry headers through Next.js', async ({ request }) => {
  const result = await request.post('/api/auth/login', {
    data: { email: 'admin@example.com', password: 'test-password' },
  });
  expect(result.status()).toBe(429);
  expect(result.headers()['retry-after']).toBe('30');
  expect(result.headers()['ratelimit']).toContain('remaining=0');
  expect((await result.json()).code).toBe('RATE_LIMIT_EXCEEDED');
});

test('keeps the refresh cookie and offers retry during a temporary outage', async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: 'photo_cloud_refresh_token',
      value: 'test-refresh-token',
      url: 'http://localhost:3002',
      httpOnly: true,
    },
  ]);
  await page.goto('/auth/refresh');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Service is temporarily unavailable' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  expect(
    (await context.cookies()).find((cookie) => cookie.name === 'photo_cloud_refresh_token')?.value,
  ).toBe('test-refresh-token');
  await expect(page).toHaveURL(/\/auth\/refresh$/);
});
