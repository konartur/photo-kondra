-- All portfolio DDL, constraints and singleton seeds are atomic.
BEGIN;

-- CreateEnum
CREATE TYPE "PortfolioPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PortfolioMediaStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "PortfolioEntityType" AS ENUM ('SERVICE', 'STORY', 'SETTINGS');

-- CreateEnum
CREATE TYPE "PortfolioContactType" AS ENUM ('instagram', 'telegram', 'email');

-- CreateTable
CREATE TABLE "PortfolioService" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "titleUk" VARCHAR(120) NOT NULL DEFAULT '',
    "titleEn" VARCHAR(120) NOT NULL DEFAULT '',
    "descriptionUk" VARCHAR(4000) NOT NULL DEFAULT '',
    "descriptionEn" VARCHAR(4000) NOT NULL DEFAULT '',
    "amountMinor" INTEGER,
    "currency" VARCHAR(3),
    "durationMinutes" INTEGER,
    "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cardMediaId" TEXT,
    "cardAltUk" VARCHAR(500) NOT NULL DEFAULT '',
    "cardAltEn" VARCHAR(500) NOT NULL DEFAULT '',
    "cardFocalX" DOUBLE PRECISION,
    "cardFocalY" DOUBLE PRECISION,
    "seoTitleUk" VARCHAR(120) NOT NULL DEFAULT '',
    "seoTitleEn" VARCHAR(120) NOT NULL DEFAULT '',
    "seoDescriptionUk" VARCHAR(320) NOT NULL DEFAULT '',
    "seoDescriptionEn" VARCHAR(320) NOT NULL DEFAULT '',
    "shareMediaId" TEXT,
    "shareAltUk" VARCHAR(500) NOT NULL DEFAULT '',
    "shareAltEn" VARCHAR(500) NOT NULL DEFAULT '',
    "shareFocalX" DOUBLE PRECISION,
    "shareFocalY" DOUBLE PRECISION,
    "status" "PortfolioPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "draftVersion" BIGINT NOT NULL DEFAULT 1,
    "publishedVersion" BIGINT,
    "publishedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioStory" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "serviceId" TEXT NOT NULL,
    "titleUk" VARCHAR(120) NOT NULL DEFAULT '',
    "titleEn" VARCHAR(120) NOT NULL DEFAULT '',
    "subtitleUk" VARCHAR(200) NOT NULL DEFAULT '',
    "subtitleEn" VARCHAR(200) NOT NULL DEFAULT '',
    "descriptionUk" VARCHAR(4000) NOT NULL DEFAULT '',
    "descriptionEn" VARCHAR(4000) NOT NULL DEFAULT '',
    "coverMediaId" TEXT,
    "coverAltUk" VARCHAR(500) NOT NULL DEFAULT '',
    "coverAltEn" VARCHAR(500) NOT NULL DEFAULT '',
    "coverFocalX" DOUBLE PRECISION,
    "coverFocalY" DOUBLE PRECISION,
    "seoTitleUk" VARCHAR(120) NOT NULL DEFAULT '',
    "seoTitleEn" VARCHAR(120) NOT NULL DEFAULT '',
    "seoDescriptionUk" VARCHAR(320) NOT NULL DEFAULT '',
    "seoDescriptionEn" VARCHAR(320) NOT NULL DEFAULT '',
    "shareMediaId" TEXT,
    "shareAltUk" VARCHAR(500) NOT NULL DEFAULT '',
    "shareAltEn" VARCHAR(500) NOT NULL DEFAULT '',
    "shareFocalX" DOUBLE PRECISION,
    "shareFocalY" DOUBLE PRECISION,
    "status" "PortfolioPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "draftVersion" BIGINT NOT NULL DEFAULT 1,
    "publishedVersion" BIGINT,
    "publishedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioMedia" (
    "id" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "originalKey" TEXT,
    "filename" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(32) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "PortfolioMediaStatus" NOT NULL DEFAULT 'UPLOADING',
    "processingLockId" TEXT,
    "processingLockExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioMediaVariant" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "format" VARCHAR(16) NOT NULL DEFAULT 'webp',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioMediaVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioStoryPhoto" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "altUk" VARCHAR(500) NOT NULL DEFAULT '',
    "altEn" VARCHAR(500) NOT NULL DEFAULT '',
    "focalX" DOUBLE PRECISION,
    "focalY" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "PortfolioStoryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSettings" (
    "id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
    "brand" VARCHAR(120) NOT NULL DEFAULT '',
    "bookingIntroUk" VARCHAR(4000) NOT NULL DEFAULT '',
    "bookingIntroEn" VARCHAR(4000) NOT NULL DEFAULT '',
    "servicesTitleUk" VARCHAR(120) NOT NULL DEFAULT '',
    "servicesTitleEn" VARCHAR(120) NOT NULL DEFAULT '',
    "servicesDescriptionUk" VARCHAR(4000) NOT NULL DEFAULT '',
    "servicesDescriptionEn" VARCHAR(4000) NOT NULL DEFAULT '',
    "storiesTitleUk" VARCHAR(120) NOT NULL DEFAULT '',
    "storiesTitleEn" VARCHAR(120) NOT NULL DEFAULT '',
    "contactTitleUk" VARCHAR(120) NOT NULL DEFAULT '',
    "contactTitleEn" VARCHAR(120) NOT NULL DEFAULT '',
    "contactDescriptionUk" VARCHAR(4000) NOT NULL DEFAULT '',
    "contactDescriptionEn" VARCHAR(4000) NOT NULL DEFAULT '',
    "contactButtonLabelUk" VARCHAR(120) NOT NULL DEFAULT '',
    "contactButtonLabelEn" VARCHAR(120) NOT NULL DEFAULT '',
    "desktopMediaId" TEXT,
    "desktopAltUk" VARCHAR(500) NOT NULL DEFAULT '',
    "desktopAltEn" VARCHAR(500) NOT NULL DEFAULT '',
    "desktopFocalX" DOUBLE PRECISION,
    "desktopFocalY" DOUBLE PRECISION,
    "mobileMediaId" TEXT,
    "mobileAltUk" VARCHAR(500) NOT NULL DEFAULT '',
    "mobileAltEn" VARCHAR(500) NOT NULL DEFAULT '',
    "mobileFocalX" DOUBLE PRECISION,
    "mobileFocalY" DOUBLE PRECISION,
    "backgroundMediaId" TEXT,
    "backgroundAltUk" VARCHAR(500) NOT NULL DEFAULT '',
    "backgroundAltEn" VARCHAR(500) NOT NULL DEFAULT '',
    "backgroundFocalX" DOUBLE PRECISION,
    "backgroundFocalY" DOUBLE PRECISION,
    "seoTitleUk" VARCHAR(120) NOT NULL DEFAULT '',
    "seoTitleEn" VARCHAR(120) NOT NULL DEFAULT '',
    "seoDescriptionUk" VARCHAR(320) NOT NULL DEFAULT '',
    "seoDescriptionEn" VARCHAR(320) NOT NULL DEFAULT '',
    "shareMediaId" TEXT,
    "shareAltUk" VARCHAR(500) NOT NULL DEFAULT '',
    "shareAltEn" VARCHAR(500) NOT NULL DEFAULT '',
    "shareFocalX" DOUBLE PRECISION,
    "shareFocalY" DOUBLE PRECISION,
    "status" "PortfolioPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "draftVersion" BIGINT NOT NULL DEFAULT 1,
    "publishedVersion" BIGINT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioContact" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "type" "PortfolioContactType" NOT NULL,
    "labelUk" VARCHAR(120) NOT NULL DEFAULT '',
    "labelEn" VARCHAR(120) NOT NULL DEFAULT '',
    "address" VARCHAR(2048) NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "PortfolioContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioHomeService" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "PortfolioHomeService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioFeaturedStory" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "captionUk" VARCHAR(4000) NOT NULL DEFAULT '',
    "captionEn" VARCHAR(4000) NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "PortfolioFeaturedStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioPublishedDocument" (
    "id" TEXT NOT NULL,
    "entityType" "PortfolioEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "serviceId" TEXT,
    "storyId" TEXT,
    "settingsId" TEXT,
    "schemaVersion" INTEGER NOT NULL,
    "sourceDraftVersion" BIGINT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioPublishedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioPublishedMediaReference" (
    "documentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,

    CONSTRAINT "PortfolioPublishedMediaReference_pkey" PRIMARY KEY ("documentId","mediaId")
);

-- CreateTable
CREATE TABLE "PortfolioPublishedServiceReference" (
    "documentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "PortfolioPublishedServiceReference_pkey" PRIMARY KEY ("documentId","serviceId")
);

-- CreateTable
CREATE TABLE "PortfolioPublishedStoryReference" (
    "documentId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,

    CONSTRAINT "PortfolioPublishedStoryReference_pkey" PRIMARY KEY ("documentId","storyId")
);

-- CreateTable
CREATE TABLE "PortfolioContentState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "contentVersion" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioContentState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioCacheInvalidation" (
    "id" TEXT NOT NULL,
    "contentVersion" BIGINT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioCacheInvalidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioService_slug_key" ON "PortfolioService"("slug");

-- CreateIndex
CREATE INDEX "PortfolioService_status_sortOrder_id_idx" ON "PortfolioService"("status", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "PortfolioService_cardMediaId_idx" ON "PortfolioService"("cardMediaId");

-- CreateIndex
CREATE INDEX "PortfolioService_shareMediaId_idx" ON "PortfolioService"("shareMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioStory_slug_key" ON "PortfolioStory"("slug");

-- CreateIndex
CREATE INDEX "PortfolioStory_serviceId_status_sortOrder_id_idx" ON "PortfolioStory"("serviceId", "status", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "PortfolioStory_status_sortOrder_id_idx" ON "PortfolioStory"("status", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "PortfolioStory_coverMediaId_idx" ON "PortfolioStory"("coverMediaId");

-- CreateIndex
CREATE INDEX "PortfolioStory_shareMediaId_idx" ON "PortfolioStory"("shareMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMedia_originalKey_key" ON "PortfolioMedia"("originalKey");

-- CreateIndex
CREATE INDEX "PortfolioMedia_uploadedById_idx" ON "PortfolioMedia"("uploadedById");

-- CreateIndex
CREATE INDEX "PortfolioMedia_status_createdAt_id_idx" ON "PortfolioMedia"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PortfolioMedia_processingLockExpiresAt_idx" ON "PortfolioMedia"("processingLockExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMediaVariant_key_key" ON "PortfolioMediaVariant"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMediaVariant_mediaId_width_format_key" ON "PortfolioMediaVariant"("mediaId", "width", "format");

-- CreateIndex
CREATE INDEX "PortfolioStoryPhoto_mediaId_idx" ON "PortfolioStoryPhoto"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioStoryPhoto_storyId_mediaId_key" ON "PortfolioStoryPhoto"("storyId", "mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioStoryPhoto_storyId_sortOrder_key" ON "PortfolioStoryPhoto"("storyId", "sortOrder");

-- CreateIndex
CREATE INDEX "PortfolioSettings_desktopMediaId_idx" ON "PortfolioSettings"("desktopMediaId");

-- CreateIndex
CREATE INDEX "PortfolioSettings_mobileMediaId_idx" ON "PortfolioSettings"("mobileMediaId");

-- CreateIndex
CREATE INDEX "PortfolioSettings_backgroundMediaId_idx" ON "PortfolioSettings"("backgroundMediaId");

-- CreateIndex
CREATE INDEX "PortfolioSettings_shareMediaId_idx" ON "PortfolioSettings"("shareMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioContact_settingsId_type_key" ON "PortfolioContact"("settingsId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioContact_settingsId_sortOrder_key" ON "PortfolioContact"("settingsId", "sortOrder");

-- CreateIndex
CREATE INDEX "PortfolioHomeService_serviceId_idx" ON "PortfolioHomeService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioHomeService_settingsId_serviceId_key" ON "PortfolioHomeService"("settingsId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioHomeService_settingsId_sortOrder_key" ON "PortfolioHomeService"("settingsId", "sortOrder");

-- CreateIndex
CREATE INDEX "PortfolioFeaturedStory_storyId_idx" ON "PortfolioFeaturedStory"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioFeaturedStory_settingsId_storyId_key" ON "PortfolioFeaturedStory"("settingsId", "storyId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioFeaturedStory_settingsId_sortOrder_key" ON "PortfolioFeaturedStory"("settingsId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPublishedDocument_serviceId_key" ON "PortfolioPublishedDocument"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPublishedDocument_storyId_key" ON "PortfolioPublishedDocument"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPublishedDocument_settingsId_key" ON "PortfolioPublishedDocument"("settingsId");

-- CreateIndex
CREATE INDEX "PortfolioPublishedDocument_entityType_publishedAt_id_idx" ON "PortfolioPublishedDocument"("entityType", "publishedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPublishedDocument_entityType_entityId_key" ON "PortfolioPublishedDocument"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "PortfolioPublishedMediaReference_mediaId_idx" ON "PortfolioPublishedMediaReference"("mediaId");

-- CreateIndex
CREATE INDEX "PortfolioPublishedServiceReference_serviceId_idx" ON "PortfolioPublishedServiceReference"("serviceId");

-- CreateIndex
CREATE INDEX "PortfolioPublishedStoryReference_storyId_idx" ON "PortfolioPublishedStoryReference"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioCacheInvalidation_contentVersion_key" ON "PortfolioCacheInvalidation"("contentVersion");

-- CreateIndex
CREATE INDEX "PortfolioCacheInvalidation_processedAt_nextAttemptAt_id_idx" ON "PortfolioCacheInvalidation"("processedAt", "nextAttemptAt", "id");

-- AddForeignKey
ALTER TABLE "PortfolioService" ADD CONSTRAINT "PortfolioService_cardMediaId_fkey" FOREIGN KEY ("cardMediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioService" ADD CONSTRAINT "PortfolioService_shareMediaId_fkey" FOREIGN KEY ("shareMediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioStory" ADD CONSTRAINT "PortfolioStory_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "PortfolioService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioStory" ADD CONSTRAINT "PortfolioStory_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioStory" ADD CONSTRAINT "PortfolioStory_shareMediaId_fkey" FOREIGN KEY ("shareMediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioMedia" ADD CONSTRAINT "PortfolioMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioMediaVariant" ADD CONSTRAINT "PortfolioMediaVariant_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioStoryPhoto" ADD CONSTRAINT "PortfolioStoryPhoto_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "PortfolioStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioStoryPhoto" ADD CONSTRAINT "PortfolioStoryPhoto_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSettings" ADD CONSTRAINT "PortfolioSettings_desktopMediaId_fkey" FOREIGN KEY ("desktopMediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSettings" ADD CONSTRAINT "PortfolioSettings_mobileMediaId_fkey" FOREIGN KEY ("mobileMediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSettings" ADD CONSTRAINT "PortfolioSettings_backgroundMediaId_fkey" FOREIGN KEY ("backgroundMediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSettings" ADD CONSTRAINT "PortfolioSettings_shareMediaId_fkey" FOREIGN KEY ("shareMediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioContact" ADD CONSTRAINT "PortfolioContact_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "PortfolioSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioHomeService" ADD CONSTRAINT "PortfolioHomeService_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "PortfolioSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioHomeService" ADD CONSTRAINT "PortfolioHomeService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "PortfolioService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioFeaturedStory" ADD CONSTRAINT "PortfolioFeaturedStory_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "PortfolioSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioFeaturedStory" ADD CONSTRAINT "PortfolioFeaturedStory_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "PortfolioStory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPublishedDocument" ADD CONSTRAINT "PortfolioPublishedDocument_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "PortfolioService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPublishedDocument" ADD CONSTRAINT "PortfolioPublishedDocument_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "PortfolioStory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPublishedDocument" ADD CONSTRAINT "PortfolioPublishedDocument_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "PortfolioSettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPublishedMediaReference" ADD CONSTRAINT "PortfolioPublishedMediaReference_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PortfolioPublishedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPublishedMediaReference" ADD CONSTRAINT "PortfolioPublishedMediaReference_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPublishedServiceReference" ADD CONSTRAINT "PortfolioPublishedServiceReference_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PortfolioPublishedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPublishedServiceReference" ADD CONSTRAINT "PortfolioPublishedServiceReference_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "PortfolioService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPublishedStoryReference" ADD CONSTRAINT "PortfolioPublishedStoryReference_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PortfolioPublishedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPublishedStoryReference" ADD CONSTRAINT "PortfolioPublishedStoryReference_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "PortfolioStory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints or immutability triggers. Keep these
-- additive portfolio-only invariants when generating later migrations.
ALTER TABLE "PortfolioService"
  ADD CONSTRAINT "PortfolioService_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "PortfolioService_order_check" CHECK ("sortOrder" >= 0),
  ADD CONSTRAINT "PortfolioService_versions_check" CHECK (
    "draftVersion" BETWEEN 1 AND 9007199254740991
    AND ("publishedVersion" IS NULL OR "publishedVersion" BETWEEN 1 AND "draftVersion")
    AND (("publishedVersion" IS NULL) = ("publishedAt" IS NULL))
    AND ("status" <> 'PUBLISHED' OR "publishedVersion" IS NOT NULL)
  ),
  ADD CONSTRAINT "PortfolioService_price_check" CHECK (
    ("amountMinor" IS NULL AND "currency" IS NULL AND "durationMinutes" IS NULL)
    OR ("amountMinor" IS NOT NULL AND "currency" IS NOT NULL AND "durationMinutes" IS NOT NULL
      AND "amountMinor" BETWEEN 0 AND 100000000 AND "currency" = 'UAH' AND "durationMinutes" BETWEEN 1 AND 1440)
  ),
  ADD CONSTRAINT "PortfolioService_card_focal_check" CHECK (
    ("cardFocalX" IS NULL AND "cardFocalY" IS NULL) OR
    ("cardFocalX" IS NOT NULL AND "cardFocalY" IS NOT NULL AND "cardFocalX" BETWEEN 0 AND 1 AND "cardFocalY" BETWEEN 0 AND 1)
  ),
  ADD CONSTRAINT "PortfolioService_share_focal_check" CHECK (
    ("shareFocalX" IS NULL AND "shareFocalY" IS NULL) OR
    ("shareFocalX" IS NOT NULL AND "shareFocalY" IS NOT NULL AND "shareFocalX" BETWEEN 0 AND 1 AND "shareFocalY" BETWEEN 0 AND 1)
  );

ALTER TABLE "PortfolioStory"
  ADD CONSTRAINT "PortfolioStory_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "PortfolioStory_order_check" CHECK ("sortOrder" >= 0),
  ADD CONSTRAINT "PortfolioStory_versions_check" CHECK (
    "draftVersion" BETWEEN 1 AND 9007199254740991
    AND ("publishedVersion" IS NULL OR "publishedVersion" BETWEEN 1 AND "draftVersion")
    AND (("publishedVersion" IS NULL) = ("publishedAt" IS NULL))
    AND ("status" <> 'PUBLISHED' OR "publishedVersion" IS NOT NULL)
  ),
  ADD CONSTRAINT "PortfolioStory_cover_focal_check" CHECK (
    ("coverFocalX" IS NULL AND "coverFocalY" IS NULL) OR
    ("coverFocalX" IS NOT NULL AND "coverFocalY" IS NOT NULL AND "coverFocalX" BETWEEN 0 AND 1 AND "coverFocalY" BETWEEN 0 AND 1)
  ),
  ADD CONSTRAINT "PortfolioStory_share_focal_check" CHECK (
    ("shareFocalX" IS NULL AND "shareFocalY" IS NULL) OR
    ("shareFocalX" IS NOT NULL AND "shareFocalY" IS NOT NULL AND "shareFocalX" BETWEEN 0 AND 1 AND "shareFocalY" BETWEEN 0 AND 1)
  );

ALTER TABLE "PortfolioMedia"
  ADD CONSTRAINT "PortfolioMedia_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 10000000),
  ADD CONSTRAINT "PortfolioMedia_mime_check" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD CONSTRAINT "PortfolioMedia_dimensions_check" CHECK (
    ("width" IS NULL AND "height" IS NULL) OR
    ("width" IS NOT NULL AND "height" IS NOT NULL AND "width" > 0 AND "height" > 0)
  ),
  ADD CONSTRAINT "PortfolioMedia_lock_check" CHECK (("processingLockId" IS NULL) = ("processingLockExpiresAt" IS NULL));

ALTER TABLE "PortfolioMediaVariant"
  ADD CONSTRAINT "PortfolioMediaVariant_dimensions_check" CHECK ("width" BETWEEN 1 AND 1600 AND "height" > 0),
  ADD CONSTRAINT "PortfolioMediaVariant_format_check" CHECK ("format" = 'webp');

ALTER TABLE "PortfolioStoryPhoto"
  ADD CONSTRAINT "PortfolioStoryPhoto_order_check" CHECK ("sortOrder" BETWEEN 0 AND 9),
  ADD CONSTRAINT "PortfolioStoryPhoto_focal_check" CHECK (
    ("focalX" IS NULL AND "focalY" IS NULL) OR
    ("focalX" IS NOT NULL AND "focalY" IS NOT NULL AND "focalX" BETWEEN 0 AND 1 AND "focalY" BETWEEN 0 AND 1)
  );

ALTER TABLE "PortfolioSettings"
  ADD CONSTRAINT "PortfolioSettings_singleton_check" CHECK ("id" = '00000000-0000-4000-8000-000000000001'),
  ADD CONSTRAINT "PortfolioSettings_versions_check" CHECK (
    "draftVersion" BETWEEN 1 AND 9007199254740991
    AND ("publishedVersion" IS NULL OR "publishedVersion" BETWEEN 1 AND "draftVersion")
    AND (("publishedVersion" IS NULL) = ("publishedAt" IS NULL))
    AND ("status" <> 'PUBLISHED' OR "publishedVersion" IS NOT NULL)
  ),
  ADD CONSTRAINT "PortfolioSettings_desktop_focal_check" CHECK (
    ("desktopFocalX" IS NULL AND "desktopFocalY" IS NULL) OR
    ("desktopFocalX" IS NOT NULL AND "desktopFocalY" IS NOT NULL AND "desktopFocalX" BETWEEN 0 AND 1 AND "desktopFocalY" BETWEEN 0 AND 1)
  ),
  ADD CONSTRAINT "PortfolioSettings_mobile_focal_check" CHECK (
    ("mobileFocalX" IS NULL AND "mobileFocalY" IS NULL) OR
    ("mobileFocalX" IS NOT NULL AND "mobileFocalY" IS NOT NULL AND "mobileFocalX" BETWEEN 0 AND 1 AND "mobileFocalY" BETWEEN 0 AND 1)
  ),
  ADD CONSTRAINT "PortfolioSettings_background_focal_check" CHECK (
    ("backgroundFocalX" IS NULL AND "backgroundFocalY" IS NULL) OR
    ("backgroundFocalX" IS NOT NULL AND "backgroundFocalY" IS NOT NULL AND "backgroundFocalX" BETWEEN 0 AND 1 AND "backgroundFocalY" BETWEEN 0 AND 1)
  ),
  ADD CONSTRAINT "PortfolioSettings_share_focal_check" CHECK (
    ("shareFocalX" IS NULL AND "shareFocalY" IS NULL) OR
    ("shareFocalX" IS NOT NULL AND "shareFocalY" IS NOT NULL AND "shareFocalX" BETWEEN 0 AND 1 AND "shareFocalY" BETWEEN 0 AND 1)
  );

ALTER TABLE "PortfolioContact" ADD CONSTRAINT "PortfolioContact_order_check" CHECK ("sortOrder" BETWEEN 0 AND 2);
ALTER TABLE "PortfolioHomeService" ADD CONSTRAINT "PortfolioHomeService_order_check" CHECK ("sortOrder" BETWEEN 0 AND 19);
ALTER TABLE "PortfolioFeaturedStory" ADD CONSTRAINT "PortfolioFeaturedStory_order_check" CHECK ("sortOrder" BETWEEN 0 AND 11);

ALTER TABLE "PortfolioPublishedDocument"
  ADD CONSTRAINT "PortfolioPublishedDocument_owner_check" CHECK (
    ("entityType" = 'SERVICE' AND "serviceId" IS NOT NULL AND "entityId" = "serviceId" AND "storyId" IS NULL AND "settingsId" IS NULL)
    OR ("entityType" = 'STORY' AND "storyId" IS NOT NULL AND "entityId" = "storyId" AND "serviceId" IS NULL AND "settingsId" IS NULL)
    OR ("entityType" = 'SETTINGS' AND "settingsId" IS NOT NULL AND "entityId" = "settingsId" AND "serviceId" IS NULL AND "storyId" IS NULL)
  ),
  ADD CONSTRAINT "PortfolioPublishedDocument_version_check" CHECK ("sourceDraftVersion" BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT "PortfolioPublishedDocument_schema_check" CHECK (
    "schemaVersion" = 1 AND jsonb_typeof("snapshot") = 'object'
    AND "snapshot" ?& ARRAY['schemaVersion', 'entityType', 'data']
    AND jsonb_typeof("snapshot"->'schemaVersion') = 'number'
    AND jsonb_typeof("snapshot"->'entityType') = 'string'
    AND "snapshot"->>'schemaVersion' = '1' AND "snapshot"->>'entityType' = "entityType"::text
    AND jsonb_typeof("snapshot"->'data') = 'object'
    AND ("entityType" <> 'STORY' OR ("snapshot" ? 'photos' AND jsonb_typeof("snapshot"->'photos') = 'array'))
  );

ALTER TABLE "PortfolioContentState"
  ADD CONSTRAINT "PortfolioContentState_singleton_check" CHECK ("id" = 1),
  ADD CONSTRAINT "PortfolioContentState_version_check" CHECK ("contentVersion" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "PortfolioCacheInvalidation"
  ADD CONSTRAINT "PortfolioCacheInvalidation_version_check" CHECK ("contentVersion" BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT "PortfolioCacheInvalidation_attempts_check" CHECK ("attempts" >= 0);

CREATE FUNCTION "portfolio_guard_entity_versions"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."draftVersion" < OLD."draftVersion"
    OR (OLD."publishedVersion" IS NOT NULL AND (NEW."publishedVersion" IS NULL OR NEW."publishedVersion" < OLD."publishedVersion")) THEN
    RAISE EXCEPTION 'Portfolio versions must not decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PortfolioService_versions_guard" BEFORE UPDATE ON "PortfolioService"
  FOR EACH ROW EXECUTE FUNCTION "portfolio_guard_entity_versions"();
CREATE TRIGGER "PortfolioStory_versions_guard" BEFORE UPDATE ON "PortfolioStory"
  FOR EACH ROW EXECUTE FUNCTION "portfolio_guard_entity_versions"();
CREATE TRIGGER "PortfolioSettings_versions_guard" BEFORE UPDATE ON "PortfolioSettings"
  FOR EACH ROW EXECUTE FUNCTION "portfolio_guard_entity_versions"();

CREATE FUNCTION "portfolio_guard_published_slug"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL AND NEW."slug" IS DISTINCT FROM OLD."slug" THEN
    RAISE EXCEPTION 'Published portfolio slug is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PortfolioService_slug_guard" BEFORE UPDATE ON "PortfolioService"
  FOR EACH ROW EXECUTE FUNCTION "portfolio_guard_published_slug"();
CREATE TRIGGER "PortfolioStory_slug_guard" BEFORE UPDATE ON "PortfolioStory"
  FOR EACH ROW EXECUTE FUNCTION "portfolio_guard_published_slug"();

CREATE FUNCTION "portfolio_guard_snapshot"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."entityType" IS DISTINCT FROM OLD."entityType"
    OR NEW."entityId" IS DISTINCT FROM OLD."entityId"
    OR NEW."sourceDraftVersion" < OLD."sourceDraftVersion"
    OR (NEW."sourceDraftVersion" = OLD."sourceDraftVersion" AND
      (NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion")) THEN
    RAISE EXCEPTION 'Portfolio snapshot revision is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PortfolioPublishedDocument_snapshot_guard" BEFORE UPDATE ON "PortfolioPublishedDocument"
  FOR EACH ROW EXECUTE FUNCTION "portfolio_guard_snapshot"();

CREATE FUNCTION "portfolio_guard_variant"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Portfolio derivative is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PortfolioMediaVariant_immutable_guard" BEFORE UPDATE ON "PortfolioMediaVariant"
  FOR EACH ROW EXECUTE FUNCTION "portfolio_guard_variant"();

CREATE FUNCTION "portfolio_guard_content_version"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."contentVersion" < OLD."contentVersion" THEN
    RAISE EXCEPTION 'Portfolio content version must not decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PortfolioContentState_version_guard" BEFORE UPDATE ON "PortfolioContentState"
  FOR EACH ROW EXECUTE FUNCTION "portfolio_guard_content_version"();

-- Bootstrap only empty portfolio singletons. No existing records are read/updated.
INSERT INTO "PortfolioSettings" ("id", "updatedAt") VALUES ('00000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP);
INSERT INTO "PortfolioContentState" ("id", "contentVersion", "updatedAt") VALUES (1, 0, CURRENT_TIMESTAMP);

COMMIT;
