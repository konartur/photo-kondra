import { describe, expect, it } from '@jest/globals';
import { resolveFeaturedStory } from './portfolio-featured-defaults.js';
import { portfolioReadinessErrors } from './portfolio-readiness.js';
import { homeDraftFixture, storyDraftFixture } from '../../test/portfolio-contract.fixtures.js';

describe('Featured story defaults', () => {
  it('takes caption from published description and cover while preserving explicit overrides', () => {
    const cover = {
      mediaId: 'published-cover',
      alt: { uk: 'Фото', en: 'Photo' },
      focalPoint: null,
    };
    const published = { ...storyDraftFixture, cover };
    const automatic = { storyId: 'story', caption: { uk: '', en: '' } };
    expect(resolveFeaturedStory(automatic, published)).toEqual({
      ...automatic,
      caption: published.description,
      image: cover,
    });
    const override = {
      ...automatic,
      caption: { uk: 'Інший', en: 'Custom' },
      image: { ...cover, mediaId: 'override' },
    };
    expect(resolveFeaturedStory(override, published)).toEqual(override);
  });
  it('does not hide an incomplete override and does not require a duplicate automatic caption', () => {
    const draft = {
      ...homeDraftFixture,
      storiesSection: {
        ...homeDraftFixture.storiesSection,
        items: [{ storyId: 'story', caption: { uk: '', en: '' } }],
      },
    };
    expect(portfolioReadinessErrors(draft).some((error) => error.field.includes('.caption'))).toBe(
      false,
    );
    draft.storiesSection.items[0].caption.uk = 'Custom';
    expect(portfolioReadinessErrors(draft)).toContainEqual({
      field: 'storiesSection.items.0.caption.en',
      code: 'REQUIRED_FOR_PUBLICATION',
    });
  });
});
