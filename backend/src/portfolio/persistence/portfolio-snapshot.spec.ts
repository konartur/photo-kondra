import { describe, expect, it } from '@jest/globals';
import {
  fixtureId,
  homeDraftFixture,
  serviceDraftFixture,
  storyDraftFixture,
} from '../../../test/portfolio-contract.fixtures.js';
import {
  InvalidPortfolioSnapshotError,
  parsePortfolioSnapshot,
  snapshotJson,
  snapshotReferences,
} from './portfolio-snapshot.js';

describe('Versioned bilingual portfolio snapshots', () => {
  it.each([
    { schemaVersion: 1, entityType: 'SERVICE', data: serviceDraftFixture },
    { schemaVersion: 1, entityType: 'STORY', data: storyDraftFixture, photos: [] },
    { schemaVersion: 1, entityType: 'SETTINGS', data: homeDraftFixture },
  ])('validates and round-trips $entityType without URLs or ORM values', async (value) => {
    const snapshot = await parsePortfolioSnapshot(value);
    const roundTrip = await parsePortfolioSnapshot(snapshotJson(snapshot));
    expect(roundTrip).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toMatch(/storageKey|uploadUrl|previewUrl|originalKey/);
  });

  it.each([
    null,
    [],
    {},
    { schemaVersion: 0, entityType: 'SERVICE', data: serviceDraftFixture },
    { schemaVersion: 2, entityType: 'SERVICE', data: serviceDraftFixture },
    { schemaVersion: 1, entityType: 'GALLERY', data: serviceDraftFixture },
    { schemaVersion: 1, entityType: 'SERVICE', data: null },
    {
      schemaVersion: 1,
      entityType: 'SERVICE',
      data: { ...serviceDraftFixture, title: { uk: 'Текст' } },
    },
    {
      schemaVersion: 1,
      entityType: 'SERVICE',
      data: serviceDraftFixture,
      signedUrl: 'https://example.invalid',
    },
  ])('rejects invalid/unsupported payload %p', async (value) => {
    await expect(parsePortfolioSnapshot(value)).rejects.toBeInstanceOf(
      InvalidPortfolioSnapshotError,
    );
  });

  it('indexes all independent media placements and deduplicates shared cover/photo/SEO', async () => {
    const image = { mediaId: fixtureId, alt: { uk: 'Кадр', en: 'Frame' }, focalPoint: null };
    const snapshot = await parsePortfolioSnapshot({
      schemaVersion: 1,
      entityType: 'STORY',
      data: {
        ...storyDraftFixture,
        cover: image,
        seo: { ...storyDraftFixture.seo, shareImage: image },
      },
      photos: [{ id: fixtureId, image }],
    });
    expect(snapshotReferences(snapshot)).toEqual({
      mediaIds: [fixtureId],
      serviceIds: [fixtureId],
      storyIds: [],
    });
  });

  it('indexes home content and media separately from the mutable draft relations', async () => {
    const snapshot = await parsePortfolioSnapshot({
      schemaVersion: 1,
      entityType: 'SETTINGS',
      data: homeDraftFixture,
    });
    expect(snapshotReferences(snapshot)).toEqual({
      mediaIds: [],
      serviceIds: [fixtureId],
      storyIds: [fixtureId],
    });
  });

  it('rejects 10 story frames plus a different eleventh cover', async () => {
    const image = { mediaId: fixtureId, alt: { uk: '', en: '' }, focalPoint: null };
    const photos = Array.from({ length: 10 }, (_, index) => {
      const id = `12345678-1234-4234-8234-${String(index).padStart(12, '0')}`;
      return { id, image: { ...image, mediaId: id } };
    });
    await expect(
      parsePortfolioSnapshot({
        schemaVersion: 1,
        entityType: 'STORY',
        data: { ...storyDraftFixture, cover: image },
        photos,
      }),
    ).rejects.toBeInstanceOf(InvalidPortfolioSnapshotError);
  });
});
