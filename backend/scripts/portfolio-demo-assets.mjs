import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { imageMime } from '../dist/portfolio/media/portfolio-image-processor.js';
import { sha256 } from './portfolio-demo-plan.mjs';

export const maxBytes = 20_000_000;
const maxSourceBytes = 32_000_000;
const maxPixels = 40_000_000;
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function boundedResponse(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('Source download failed: HTTP ' + response.status);
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxSourceBytes) throw new Error('Source exceeds the 32 MB preparation limit');
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function prepareBytes(original) {
  const mimeType = imageMime(original);
  if (!mimeType) throw new Error('Source is not JPEG, PNG or WebP');
  const decoderOptions = { limitInputPixels: 80_000_000, failOn: 'warning' };
  const metadata = await sharp(original, decoderOptions).metadata();
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1)
    throw new Error('Source must be a still image');
  if (original.length <= maxBytes && metadata.width * metadata.height <= maxPixels)
    return { bytes: original, mimeType, transform: null };
  for (const [width, quality] of [[3200, 88], [2400, 82], [1600, 78]]) {
    const bytes = await sharp(original, decoderOptions).rotate()
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality }).toBuffer();
    if (bytes.length <= maxBytes) {
      return { bytes, mimeType: 'image/jpeg', transform: { kind: 'resize-jpeg', width, quality } };
    }
  }
  throw new Error('Source could not be prepared within the upload limits');
}

function receiptPath(dir, asset) {
  return join(dir, asset.source + '.json');
}

export async function readPrepared(dir, asset) {
  const receipt = JSON.parse(await readFile(receiptPath(dir, asset), 'utf8'));
  if (receipt.schemaVersion !== 1 || receipt.demo !== true || receipt.source !== asset.source ||
      receipt.sourceUrl !== asset.url || !/^[0-9a-f]{64}$/.test(receipt.sourceSha256) ||
      !/^[0-9a-f]{64}$/.test(receipt.sha256) || !Object.hasOwn(extensions, receipt.mimeType) ||
      (!receipt.transform && receipt.sourceSha256 !== receipt.sha256))
    throw new Error('Invalid provenance receipt for ' + asset.source);
  const ext = extensions[receipt.mimeType];
  const path = join(dir, receipt.sha256 + '.' + ext);
  const info = await stat(path);
  if (!info.isFile() || info.size < 1 || info.size > maxBytes || info.size !== receipt.bytes)
    throw new Error('Invalid size for ' + asset.source);
  const bytes = await readFile(path);
  if (sha256(bytes) !== receipt.sha256 || imageMime(bytes) !== receipt.mimeType)
    throw new Error('Checksum or media type does not match for ' + asset.source);
  return { bytes, receipt, ext };
}

async function writeBlob(dir, prepared, hash) {
  const path = join(dir, hash + '.' + extensions[prepared.mimeType]);
  try {
    await writeFile(path, prepared.bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await readFile(path);
    if (sha256(existing) !== hash) throw new Error('Existing content-addressed file is corrupted');
  }
}

export async function fetchDemoAssets(dir, assets) {
  await mkdir(dir, { recursive: true });
  for (const asset of assets) {
    try {
      await stat(receiptPath(dir, asset));
      await readPrepared(dir, asset);
      console.log('Already prepared: ' + asset.source);
      continue;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // A receipt with a missing blob is a partial/corrupt asset set. Do not replace it.
      try {
        await stat(receiptPath(dir, asset));
        throw new Error('Prepared blob is missing for ' + asset.source);
      } catch (receiptError) {
        if (receiptError.code !== 'ENOENT') throw receiptError;
      }
    }
    try {
      const original = await boundedResponse(asset.url);
      const prepared = await prepareBytes(original);
      const hash = sha256(prepared.bytes);
      await writeBlob(dir, prepared, hash);
      const receipt = {
        schemaVersion: 1, demo: true, source: asset.source, sourceUrl: asset.url,
        sourceSha256: sha256(original), sha256: hash, bytes: prepared.bytes.length,
        mimeType: prepared.mimeType, transform: prepared.transform,
      };
      await writeFile(receiptPath(dir, asset), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
      console.log('Prepared: ' + asset.source + (receipt.transform ? ' (resized)' : ''));
    } catch (error) {
      throw new Error(asset.source + ': ' + error.message, { cause: error });
    }
  }
}
