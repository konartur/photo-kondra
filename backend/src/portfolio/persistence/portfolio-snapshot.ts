import { Type, plainToInstance } from 'class-transformer';
import { Equals, IsArray, IsDefined, IsObject, ValidateNested, validate } from 'class-validator';
import { PortfolioEntityType, Prisma } from '@prisma/client';
import { ArrayMaxSize, ArrayUnique } from 'class-validator';
import {
  PortfolioHomeDraftInputDto,
  PortfolioServiceDraftInputDto,
  PortfolioStoryDraftInputDto,
  PortfolioStoryPhotoInputDto,
  storyPhotoLimitSatisfied,
} from '../dto/admin-input.dto.js';

export const PORTFOLIO_SNAPSHOT_SCHEMA_VERSION = 1;

class SnapshotBase {
  @Equals(PORTFOLIO_SNAPSHOT_SCHEMA_VERSION) schemaVersion!: 1;
}
export class PortfolioServiceSnapshotV1 extends SnapshotBase {
  @Equals('SERVICE') entityType!: 'SERVICE';
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PortfolioServiceDraftInputDto)
  data!: PortfolioServiceDraftInputDto;
}
export class PortfolioStorySnapshotV1 extends SnapshotBase {
  @Equals('STORY') entityType!: 'STORY';
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PortfolioStoryDraftInputDto)
  data!: PortfolioStoryDraftInputDto;
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique((photo: PortfolioStoryPhotoInputDto) => photo?.id)
  @ArrayUnique((photo: PortfolioStoryPhotoInputDto) => photo?.image?.mediaId)
  @ValidateNested({ each: true })
  @Type(() => PortfolioStoryPhotoInputDto)
  photos!: PortfolioStoryPhotoInputDto[];
}
export class PortfolioSettingsSnapshotV1 extends SnapshotBase {
  @Equals('SETTINGS') entityType!: 'SETTINGS';
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PortfolioHomeDraftInputDto)
  data!: PortfolioHomeDraftInputDto;
}
export type PortfolioSnapshotV1 =
  PortfolioServiceSnapshotV1 | PortfolioStorySnapshotV1 | PortfolioSettingsSnapshotV1;

export class InvalidPortfolioSnapshotError extends Error {
  constructor() {
    super('Invalid or unsupported portfolio snapshot');
  }
}

/** Shape validation on both write and read; publication completeness is a domain operation. */
export async function parsePortfolioSnapshot(value: unknown): Promise<PortfolioSnapshotV1> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('entityType' in value))
    throw new InvalidPortfolioSnapshotError();
  let snapshot: PortfolioSnapshotV1;
  switch (value.entityType) {
    case PortfolioEntityType.SERVICE:
      snapshot = plainToInstance(PortfolioServiceSnapshotV1, value);
      break;
    case PortfolioEntityType.STORY:
      snapshot = plainToInstance(PortfolioStorySnapshotV1, value);
      break;
    case PortfolioEntityType.SETTINGS:
      snapshot = plainToInstance(PortfolioSettingsSnapshotV1, value);
      break;
    default:
      throw new InvalidPortfolioSnapshotError();
  }
  const errors = await validate(snapshot, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    validationError: { target: false, value: false },
  });
  if (
    errors.length ||
    (snapshot.entityType === 'STORY' &&
      !storyPhotoLimitSatisfied(
        snapshot.data.cover?.mediaId ?? null,
        snapshot.photos.map((photo) => photo.image.mediaId),
      ))
  )
    throw new InvalidPortfolioSnapshotError();
  return snapshot;
}

export function snapshotJson(snapshot: PortfolioSnapshotV1): Prisma.InputJsonObject {
  // Validated wire fields contain only JSON-compatible primitives/objects/arrays.
  return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonObject;
}

export function snapshotReferences(snapshot: PortfolioSnapshotV1): {
  mediaIds: string[];
  serviceIds: string[];
  storyIds: string[];
} {
  const media = new Set<string>();
  const services = new Set<string>();
  const stories = new Set<string>();
  const addMedia = (ref: { mediaId: string } | null) => {
    if (ref) media.add(ref.mediaId);
  };
  addMedia(snapshot.data.seo.shareImage);
  switch (snapshot.entityType) {
    case 'SERVICE':
      addMedia(snapshot.data.cardImage);
      break;
    case 'STORY':
      services.add(snapshot.data.serviceId);
      addMedia(snapshot.data.cover);
      for (const photo of snapshot.photos) addMedia(photo.image);
      break;
    case 'SETTINGS':
      addMedia(snapshot.data.hero.desktop);
      addMedia(snapshot.data.hero.mobile);
      addMedia(snapshot.data.contactSection.background);
      for (const id of snapshot.data.servicesSection.serviceIds) services.add(id);
      for (const item of snapshot.data.storiesSection.items) {
        stories.add(item.storyId);
        addMedia(item.image ?? null);
      }
      break;
  }
  return {
    mediaIds: [...media].sort(),
    serviceIds: [...services].sort(),
    storyIds: [...stories].sort(),
  };
}
