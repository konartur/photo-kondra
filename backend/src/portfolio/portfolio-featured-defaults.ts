import type {
  PortfolioHomeDraftInputDto,
  PortfolioStoryDraftInputDto,
} from './dto/admin-input.dto.js';

/** Resolve only from an already published STORY snapshot, then store the result in SETTINGS. */
export function resolveFeaturedStory(
  placement: PortfolioHomeDraftInputDto['storiesSection']['items'][number],
  published: PortfolioStoryDraftInputDto,
) {
  return {
    ...placement,
    caption:
      placement.caption.uk.trim() || placement.caption.en.trim()
        ? placement.caption
        : published.description,
    image: placement.image ?? published.cover,
  };
}
