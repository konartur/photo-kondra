import { expect, test } from '@playwright/test';

const id = '12345678-1234-4234-8234-123456789012';
test('portfolio library and derivative preview require an admin cookie', async ({ request }) => {
  for (const path of ['/api/portfolio/media', `/api/portfolio/media/${id}/variants/${id}`]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control']).toBe('no-store');
  }
});
test('portfolio BFF rejects binary uploads, oversized metadata and invalid route IDs', async ({
  request,
}) => {
  const binary = await request.post('/api/portfolio/media/upload-url', {
    headers: { 'Content-Type': 'image/jpeg' },
    data: Buffer.from('synthetic'),
  });
  expect(binary.status()).toBe(415);
  const oversized = await request.post('/api/portfolio/media/upload-url', {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ filename: 'x'.repeat(65_536) }),
  });
  expect(oversized.status()).toBe(413);
  const invalid = await request.get('/api/portfolio/media/invalid/variants/invalid', {
    maxRedirects: 0,
  });
  expect(invalid.status()).toBe(400);
});
