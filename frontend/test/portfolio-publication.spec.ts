import { expect, test } from '@playwright/test';

const id = '12345678-1234-4234-8234-123456789012';

test('portfolio preview and lifecycle BFF require an admin cookie and avoid cache', async ({ request }) => {
  const paths = [
    `/api/portfolio/services/${id}/preview?locale=uk`,
    `/api/portfolio/stories/${id}/preview?locale=en`,
    '/api/portfolio/settings/preview?locale=uk',
  ];
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control']).toBe('no-store');
  }
  const publish = await request.post(`/api/portfolio/services/${id}/publish`, {
    headers: { 'Content-Type': 'application/json' },
    data: { expectedVersion: 1 },
  });
  expect(publish.status()).toBe(401);
  expect(publish.headers()['cache-control']).toBe('no-store');
});

test('portfolio publication BFF rejects invalid IDs before forwarding', async ({ request }) => {
  const preview = await request.get('/api/portfolio/stories/invalid/preview?locale=en');
  expect(preview.status()).toBe(400);
  const archive = await request.post('/api/portfolio/services/invalid/archive', {
    headers: { 'Content-Type': 'application/json' },
    data: { expectedVersion: 1 },
  });
  expect(archive.status()).toBe(400);
});
