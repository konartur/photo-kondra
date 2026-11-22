import { isDeepStrictEqual, parseArgs } from 'node:util';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { buildDemoPlan } from './portfolio-demo-plan.mjs';
import { fetchDemoAssets, readPrepared } from './portfolio-demo-assets.mjs';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { PortfolioPersistenceService, PORTFOLIO_SETTINGS_ID } from '../dist/portfolio/persistence/portfolio-persistence.service.js';
import { PortfolioAdminService } from '../dist/portfolio/portfolio-admin.service.js';
import { PortfolioPublicationService } from '../dist/portfolio/portfolio-publication.service.js';
import { createPortfolioMediaConfig } from '../dist/portfolio/media/portfolio-media.config.js';
import { PortfolioImageProcessor } from '../dist/portfolio/media/portfolio-image-processor.js';
import { PortfolioMediaProcessingService } from '../dist/portfolio/media/portfolio-media-processing.service.js';
import { S3StorageService } from '../dist/storage/s3-storage.service.js';

const localhost = new Set(['localhost', '127.0.0.1', '[::1]']);
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error('Set ' + name + ' for the dedicated local import environment');
  return value;
}

function localTargets() {
  const database = new URL(required('PORTFOLIO_IMPORT_DB_URL'));
  if (!localhost.has(database.hostname) || !['postgres:', 'postgresql:'].includes(database.protocol) ||
      !/^\/[a-z0-9_]+_(?:test|demo)$/.test(database.pathname) ||
      [...database.searchParams.keys()].some(key => key !== 'schema') ||
      (database.searchParams.has('schema') && database.searchParams.get('schema') !== 'public'))
    throw new Error('Import requires a local PostgreSQL database ending in _test or _demo');
  const endpoint = new URL(required('PORTFOLIO_IMPORT_S3_ENDPOINT'));
  if (!localhost.has(endpoint.hostname) || !['http:', 'https:'].includes(endpoint.protocol) ||
      endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash)
    throw new Error('Import requires a dedicated S3-compatible endpoint on loopback');
  const bucket = required('PORTFOLIO_IMPORT_S3_BUCKET');
  if (!/^[a-z0-9][a-z0-9-]{0,54}-(?:demo|test)$/.test(bucket))
    throw new Error('Import requires an S3 bucket ending in -demo or -test');
  const credentials = {
    accessKeyId: required('PORTFOLIO_IMPORT_S3_ACCESS_KEY'),
    secretAccessKey: required('PORTFOLIO_IMPORT_S3_SECRET_KEY'),
  };
  return { database, s3: { endpoint: endpoint.origin, bucket, credentials, region: 'us-east-1', forcePathStyle: true } };
}

async function importMedia(prisma, storage, processor, ownerId, asset, directory) {
  const { bytes, receipt, ext } = await readPrepared(directory, asset);
  const filename = 'unsplash-demo-' + asset.source + '.' + ext;
  const originalKey = 'portfolio/media/' + asset.id + '/original-' + receipt.sha256 + '.' + ext;
  const data = {
    id: asset.id, uploadedById: ownerId, filename, originalKey,
    sizeBytes: BigInt(bytes.length), mimeType: receipt.mimeType,
  };
  const mediaQuery = { where: { id: asset.id }, include: { variants: true } };
  let existing = await prisma.portfolioMedia.findUnique(mediaQuery);
  if (!existing) {
    try {
      existing = await prisma.portfolioMedia.create({ data, include: mediaQuery.include });
    } catch (error) {
      if (error.code !== 'P2002') throw error;
      existing = await prisma.portfolioMedia.findUniqueOrThrow(mediaQuery);
    }
  }
  if (existing.uploadedById !== ownerId || existing.originalKey !== originalKey ||
      existing.sizeBytes !== data.sizeBytes || existing.mimeType !== data.mimeType || existing.status === 'DELETED')
    throw new Error('Existing demo media differs or was deleted: ' + asset.source);

  if (existing.status === 'READY') {
    const keys = [originalKey, ...existing.variants.map(variant => variant.key)];
    const found = await Promise.all(keys.map(key => storage.exists(key)));
    if (!existing.variants.length || found.includes(false))
      throw new Error('Imported original or variants are missing: ' + asset.source);
    return 'reused';
  }
  if (!await storage.exists(originalKey)) {
    await storage.upload({
      key: originalKey, body: bytes, contentType: data.mimeType, cacheControl: 'private, no-store',
      signal: AbortSignal.timeout(30000),
    });
  }

  // Normal workers ignore UPLOADING. Expose the row to the existing processing
  // lease only after the private object has been written.
  await prisma.portfolioMedia.updateMany({
    where: { id: asset.id, status: 'UPLOADING' }, data: { status: 'PROCESSING' },
  });
  await processor.process({ mediaId: asset.id });
  const ready = await prisma.portfolioMedia.findUniqueOrThrow({ where: { id: asset.id }, include: { variants: true } });
  if (ready.status !== 'READY' || !ready.variants.length)
    throw new Error('Portfolio media is not ready: ' + asset.source);
  return 'imported';
}

async function ensureDraft(prisma, model, id, slug, create) {
  const table = prisma[model];
  const duplicate = await table.findUnique({ where: { slug }, select: { id: true } });
  if (duplicate && duplicate.id !== id) throw new Error('Slug already belongs to a different ' + model + ': ' + slug);
  if (await table.findUnique({ where: { id }, select: { id: true } })) return 'reused';
  await create();
  return 'imported';
}

async function applyPlan(plan, options) {
  const targets = localTargets();
  const ownerId = required('PORTFOLIO_IMPORT_OWNER_ID');
  // Preflight the entire input set before the first DB or storage write.
  for (const asset of plan.assets) await readPrepared(options.assets, asset);

  const prisma = new PrismaService({ datasources: { db: { url: targets.database.toString() } } });
  const client = new S3Client(targets.s3);
  const storage = new S3StorageService(client, targets.s3, getSignedUrl);
  const config = new ConfigService();
  const persistence = new PortfolioPersistenceService(prisma);
  const admin = new PortfolioAdminService(prisma, persistence, config);
  const publication = new PortfolioPublicationService(prisma, persistence);
  const mediaConfig = createPortfolioMediaConfig(config);
  const processor = new PortfolioMediaProcessingService(
    persistence, new PortfolioImageProcessor(storage, mediaConfig), storage, mediaConfig,
  );
  const totals = { media: 0, services: 0, stories: 0, settings: 0, published: 0 };

  try {
    const owner = await prisma.user.findFirst({ where: { id: ownerId, role: 'ADMIN' }, select: { id: true } });
    if (!owner) throw new Error('The local import owner must be an existing admin');
    const before = await admin.getSettings();
    // Fail on foreign slug collisions before uploading any originals.
    for (const entry of plan.stories) {
      const service = await prisma.portfolioService.findUnique({ where: { slug: entry.slug }, select: { id: true } });
      const story = await prisma.portfolioStory.findUnique({ where: { slug: entry.slug }, select: { id: true } });
      if ((service && service.id !== entry.serviceId) || (story && story.id !== entry.storyId))
        throw new Error('A non-demo draft or publication owns slug: ' + entry.slug);
    }
    for (const asset of plan.assets) {
      const action = await importMedia(prisma, storage, processor, owner.id, asset, options.assets);
      if (action === 'imported') totals.media++;
      console.log('Media ' + asset.source + ': ' + action);
    }
    for (const entry of plan.stories) {
      if (await ensureDraft(prisma, 'portfolioService', entry.serviceId, entry.slug, () =>
        admin.createService(owner.id, entry.service, { id: entry.serviceId, sortOrder: entry.sortOrder })) === 'imported') totals.services++;
    }
    for (const entry of plan.stories) {
      if (await ensureDraft(prisma, 'portfolioStory', entry.storyId, entry.slug, () =>
        admin.createStory(owner.id, entry.story, { id: entry.storyId, sortOrder: entry.sortOrder, photos: entry.photos })) === 'imported') totals.stories++;
    }

    if (before.draftVersion === 1 && before.status === 'DRAFT' && before.publishedVersion === null) {
      await admin.updateSettings(owner.id, 1, plan.settings);
      totals.settings++;
    }

    if (options.publish) {
      const targets = [];
      for (const entry of plan.stories) {
        const saved = await admin.getService(entry.serviceId);
        if (saved.draftVersion !== 1 || !isDeepStrictEqual(saved.draft, entry.service) || saved.status === 'ARCHIVED')
          throw new Error('Refusing to publish changed service: ' + entry.slug);
        targets.push({ type: 'SERVICE', saved });
      }
      for (const entry of plan.stories) {
        const saved = await admin.getStory(entry.storyId);
        if (saved.draftVersion !== 1 || !isDeepStrictEqual(saved.draft, entry.story) ||
            !isDeepStrictEqual(saved.photos, entry.photos) || saved.status === 'ARCHIVED')
          throw new Error('Refusing to publish changed story: ' + entry.slug);
        targets.push({ type: 'STORY', saved });
      }
      const saved = await admin.getSettings();
      if (saved.id !== PORTFOLIO_SETTINGS_ID || saved.draftVersion !== 2 ||
          !isDeepStrictEqual(saved.draft, plan.settings) || saved.status === 'ARCHIVED')
        throw new Error('Refusing to publish changed home settings');
      targets.push({ type: 'SETTINGS', saved });
      for (const { type, saved } of targets) {
        if (saved.status !== 'PUBLISHED' || saved.publishedVersion !== saved.draftVersion) {
          await publication.publish(type, saved.id, saved.draftVersion);
          totals.published++;
        }
      }
    }
    console.log(JSON.stringify({ mode: 'apply', manifestSha256: plan.manifestSha256, changes: totals }, null, 2));
  } finally {
    client.destroy();
    await prisma.$disconnect();
  }
}

async function main() {
  const { values: options } = parseArgs({
    options: {
      'dry-run': { type: 'boolean' }, 'fetch-assets': { type: 'boolean' },
      apply: { type: 'boolean' }, assets: { type: 'string' }, publish: { type: 'boolean' },
    },
  });
  if ([options['dry-run'], options['fetch-assets'], options.apply].filter(Boolean).length > 1 ||
      (options.publish && !options.apply) || ((options.apply || options['fetch-assets']) && !options.assets))
    throw new Error('Use --dry-run [--assets DIR], --fetch-assets --assets DIR, or --apply --assets DIR [--publish]');

  const plan = await buildDemoPlan();
  if (options['fetch-assets']) return fetchDemoAssets(options.assets, plan.assets);
  if (options.apply) return applyPlan(plan, options);
  const media = [];
  for (const asset of plan.assets) {
    const prepared = options.assets ? (await readPrepared(options.assets, asset)).receipt : undefined;
    media.push({ source: asset.source, id: asset.id, url: asset.url, prepared });
  }
  console.log(JSON.stringify({
    mode: 'dry-run', manifestSha256: plan.manifestSha256, stories: plan.stories.map(entry => ({
      slug: entry.slug, serviceId: entry.serviceId, storyId: entry.storyId, galleryPhotos: entry.photos.length,
    })), home: PORTFOLIO_SETTINGS_ID, media,
  }, null, 2));
}

main().catch(error => {
  console.error('Portfolio demo import failed:', error.code ?? error.message);
  process.exitCode = 1;
});
