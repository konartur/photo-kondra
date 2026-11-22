import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from '@playwright/test';

const origin = 'http://127.0.0.1:19301';
const ingressKey = process.env.BFF_TRUST_SECRET;
assert(ingressKey, 'Provide the isolated frontend ingress key');
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, touch: false, latency: 20, kbps: 10000, cpu: 1 },
  mobile: { viewport: { width: 390, height: 844 }, touch: true, latency: 150, kbps: 1600, cpu: 4 },
};

async function measure(browser, path, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport, isMobile: profile.touch, hasTouch: profile.touch, deviceScaleFactor: 1,
    ignoreHTTPSErrors: true, // The local storage fixture uses a self-signed certificate.
  });
  try {
    const page = await context.newPage();
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return url.origin === 'https://127.0.0.1:19443' ? route.continue() : route.abort();
    });
    await page.route(origin + '/**', route => route.continue({
      headers: {
        ...route.request().headers(),
        'X-Photo-Ingress-Key': ingressKey,
        'X-Photo-Client-IP': '192.0.2.1',
      },
    }));
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.kbps * 125,
      uploadThroughput: profile.kbps * 125,
    });
    await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    const responseTypes = new Map();
    let jsBytes = 0;
    let imageBytes = 0;
    const imageResponses = [];
    page.on('requestfailed', (request) => {
      if (request.resourceType() === 'image')
        imageResponses.push({ origin: new URL(request.url()).origin, error: request.failure()?.errorText });
    });
    session.on('Network.responseReceived', ({ requestId, type, response }) => {
      responseTypes.set(requestId, { type, mime: response.mimeType });
      if (response.url.includes('/media/'))
        imageResponses.push({ origin: new URL(response.url).origin, status: response.status });
    });
    session.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      const response = responseTypes.get(requestId);
      if (response?.type === 'Script') jsBytes += encodedDataLength;
      if (response?.mime === 'image/webp') imageBytes += encodedDataLength;
    });
    await page.addInitScript(() => {
      const metrics = { lcp: 0, cls: 0 };
      window.portfolioLabMetrics = metrics;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      let windowStart = 0;
      let previous = 0;
      let score = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          if (!previous || entry.startTime - previous > 1000 || entry.startTime - windowStart > 5000) {
            windowStart = entry.startTime;
            score = 0;
          }
          previous = entry.startTime;
          score += entry.value;
          metrics.cls = Math.max(metrics.cls, score);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const response = await page.goto(origin + path, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.match(await response.text(), /\/api\/public\/portfolio\/media\//);
    const hero = page.locator('main img[fetchpriority="high"]');
    const imageOrigin = await hero.evaluate((image) => image.currentSrc && new URL(image.currentSrc).origin);
    await hero.evaluate((image) => image.decode(), undefined, { timeout: 5000 }).catch((error) => {
      throw new Error('Hero failed to load on ' + path + ': ' + JSON.stringify({ imageOrigin, imageResponses }), { cause: error });
    });
    assert.match(await hero.evaluate((image) => image.currentSrc), /\/api\/public\/portfolio\/media\//);
    const metrics = await page.evaluate(() => window.portfolioLabMetrics);
    assert(metrics.lcp > 0 && imageBytes > 0 && jsBytes > 0, 'Missing lab sample');
    return { lcpMs: Math.round(metrics.lcp), cls: metrics.cls, jsBytes, imageBytes };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
try {
  for (const path of ['/en', '/en/stories/love']) {
    for (const [name, profile] of Object.entries(profiles)) {
      const samples = [];
      for (let run = 0; run < 3; run++) samples.push(await measure(browser, path, profile));
      const medians = Object.fromEntries(Object.keys(samples[0]).map(key => [
        key, samples.map(sample => sample[key]).sort((a, b) => a - b)[1],
      ]));
      console.log(JSON.stringify({ chromium: browser.version(), path, profile: name, samples, medians }));
    }
  }
} finally {
  await browser.close();
}
