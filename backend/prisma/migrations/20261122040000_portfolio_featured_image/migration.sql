ALTER TABLE "PortfolioFeaturedStory"
    ADD COLUMN "imageMediaId" TEXT,
    ADD COLUMN "imageAltUk" VARCHAR(500) NOT NULL DEFAULT '',
    ADD COLUMN "imageAltEn" VARCHAR(500) NOT NULL DEFAULT '',
    ADD COLUMN "imageFocalX" DOUBLE PRECISION,
    ADD COLUMN "imageFocalY" DOUBLE PRECISION,
    ADD CONSTRAINT "PortfolioFeaturedStory_imageMediaId_fkey" FOREIGN KEY ("imageMediaId")
        REFERENCES "PortfolioMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PortfolioFeaturedStory_focal_check" CHECK (
        ("imageFocalX" IS NULL AND "imageFocalY" IS NULL)
        OR ("imageMediaId" IS NOT NULL AND "imageFocalX" IS NOT NULL AND "imageFocalY" IS NOT NULL
            AND "imageFocalX" BETWEEN 0 AND 1 AND "imageFocalY" BETWEEN 0 AND 1)
    );

CREATE INDEX "PortfolioFeaturedStory_imageMediaId_idx" ON "PortfolioFeaturedStory"("imageMediaId");
