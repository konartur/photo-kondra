import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
import { URL } from 'node:url';
import sharp from 'sharp';
import { buildDemoPlan } from '../scripts/portfolio-demo-plan.mjs';

const api = 'http://127.0.0.1:19300/api/v1';
const web = 'http://127.0.0.1:19301';
const { fetch } = globalThis;
const token = process.env.PORTFOLIO_DEMO_ACCESS_TOKEN;
const ingressKey = process.env.BFF_TRUST_SECRET;
assert(token, 'Provide an access token from the isolated demo API');
assert(ingressKey, 'Provide the isolated frontend ingress key');

function webRequest(path) {
  return fetch(web + path, {
    headers: { 'X-Photo-Ingress-Key': ingressKey, 'X-Photo-Client-IP': '192.0.2.1' },
    redirect: 'manual',
  });
}

async function request(path, status, { method = 'GET', body, admin = false } = {}) {
  const response = await fetch(api + path, {
    method,
    headers: {
      ...(admin && { Authorization: 'Bearer ' + token }),
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await response.text();
  assert.equal(response.status, status, method + ' ' + path + ': ' + text);
  return text ? JSON.parse(text) : null;
}

const plan = await buildDemoPlan();
const importedMedia = new Set();
for (const { slug: importedSlug } of plan.stories) {
  const { page } = await request('/public/portfolio/stories/' + importedSlug + '?locale=en', 200);
  importedMedia.add(page.cover.mediaId);
  for (const photo of page.photos) importedMedia.add(photo.image.mediaId);
}
assert.deepEqual(importedMedia, new Set(plan.assets.map(({ id }) => id)));
assert.equal(importedMedia.size, 21);
const sitemap = await webRequest('/sitemap.xml');
assert.equal(sitemap.status, 200);
const xml = await sitemap.text();
assert.equal((xml.match(/<url>/g) ?? []).length, 14);
assert.doesNotMatch(xml, /\/dashboard|\/g\/|\/auth\/|\/stories\/acceptance-/);

const source = plan.stories[0];
const slug = 'acceptance-' + randomUUID();
const publicPath = '/public/portfolio/stories/' + slug + '?locale=en';
const title = { uk: 'Перевірка публікації', en: 'Publication acceptance' };
const draft = { ...source.story, slug, title, cover: null };
await request('/portfolio/stories', 401);
const story = await request('/portfolio/stories', 201, { method: 'POST', admin: true, body: draft });
const storyPath = '/portfolio/stories/' + story.id;

try {
  await request(publicPath, 404);
  await request(storyPath + '/publish', 409, {
    method: 'POST', admin: true, body: { expectedVersion: story.draftVersion },
  });
  const bytes = await sharp({
    create: { width: 1800, height: 1200, channels: 3, background: '#75618a' },
  }).jpeg().toBuffer();
  const upload = await request('/portfolio/media/upload-url', 201, {
    method: 'POST', admin: true,
    body: { filename: slug + '.jpg', mimeType: 'image/jpeg', sizeBytes: bytes.length },
  });
  const storageUrl = new URL(upload.uploadUrl);
  assert.equal(storageUrl.origin, 'https://127.0.0.1:19443');
  assert.equal(Number(storageUrl.searchParams.get('X-Amz-Expires')), upload.expiresIn);
  const put = await fetch(storageUrl, { method: 'PUT', headers: upload.requiredHeaders, body: bytes });
  assert.equal(put.status, 200);
  const mediaPath = '/portfolio/media/' + upload.mediaId;
  await request(mediaPath + '/upload-complete', 202, { method: 'POST', admin: true });
  let media;
  for (let i = 0; i < 40; i++) {
    media = await request(mediaPath, 200, { admin: true });
    if (media.status === 'READY' || media.status === 'FAILED') break;
    await setTimeout(250);
  }
  assert.equal(media?.status, 'READY');
  const cover = { ...source.story.cover, mediaId: upload.mediaId };
  const data = { ...draft, cover };
  let saved = await request(storyPath, 200, {
    method: 'PUT', admin: true, body: { expectedVersion: story.draftVersion, data },
  });
  const photos = plan.assets.slice(0, 10).map(({ id }) => ({
    id: randomUUID(), image: { ...cover, mediaId: id },
  }));
  const writePhotos = (items, status) => request(storyPath + '/photos', status, {
    method: 'PUT', admin: true, body: { expectedVersion: saved.draftVersion, items },
  });
  assert.equal((await request(storyPath + '/preview?locale=en', 200, { admin: true })).page.photos.length, 0);
  saved = await writePhotos(photos.slice(0, 9), 200);
  await writePhotos(photos, 400);
  const preview = await request(storyPath + '/preview?locale=en', 200, { admin: true });
  assert.equal(preview.page.photos.length, 9);
  assert.equal(preview.page.title, title.en);
  const publish = () => request(storyPath + '/publish', 200, {
    method: 'POST', admin: true, body: { expectedVersion: saved.draftVersion },
  });
  await publish();
  const published = await request(publicPath, 200);
  assert.equal(published.page.photos.length, 9);
  assert.doesNotMatch(JSON.stringify(published), /originalKey|storageKey|uploadedById|X-Amz-Signature/);
  assert.deepEqual(published.page.cover.sources.map(({ width }) => width).sort((a, b) => a - b), [480, 960, 1600]);
  const webPath = '/en/stories/' + slug;
  const page = await webRequest(webPath);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Publication acceptance/);
  assert.match(html, new RegExp('<link rel="canonical" href="https://[^/"]+' + webPath + '"'));
  assert.match(html, /<meta property="og:title"/);
  assert((await (await webRequest('/sitemap.xml')).text()).includes(webPath));
  const redirect = await webRequest(published.page.cover.url);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('cache-control'), 'no-store');
  const variant = new URL(redirect.headers.get('location'));
  assert.equal(variant.origin, storageUrl.origin);
  assert(Number(variant.searchParams.get('X-Amz-Expires')) > 0);
  const image = await fetch(variant);
  assert.equal(image.headers.get('content-type'), 'image/webp');
  await image.arrayBuffer();

  const revised = { ...data, title: { uk: 'Оновлена чернетка', en: 'Updated draft' } };
  const update = (status) => request(storyPath, status, {
    method: 'PUT', admin: true, body: { expectedVersion: saved.draftVersion, data: revised },
  });
  const concurrent = await Promise.allSettled([update(200), update(200)]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(String(concurrent.find(result => result.status === 'rejected').reason), /PORTFOLIO_VERSION_CONFLICT/);
  saved = concurrent.find(result => result.status === 'fulfilled').value;
  assert.equal((await request(publicPath, 200)).page.title, title.en);
  await publish();
  assert.equal((await request(publicPath, 200)).page.title, revised.title.en);
  await request(storyPath + '/archive', 200, {
    method: 'POST', admin: true, body: { expectedVersion: saved.draftVersion },
  });
  await request(publicPath, 404);
  assert(!(await (await webRequest('/sitemap.xml')).text()).includes(webPath));
  assert.equal((await webRequest(webPath)).status, 404);
  assert.equal((await webRequest(published.page.cover.url)).status, 404);
  console.log('Passed: direct upload, worker, preview, publication, version race, archive, public media and responsive WebP.');
} catch (error) {
  const current = await request(storyPath, 200, { admin: true });
  if (current.status === 'PUBLISHED') {
    await request(storyPath + '/archive', 200, {
      method: 'POST', admin: true, body: { expectedVersion: current.draftVersion },
    });
  }
  throw error;
}
