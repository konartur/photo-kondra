-- AlterTable
ALTER TABLE "Archive" ADD COLUMN "contentHash" TEXT;

-- CreateIndex
CREATE INDEX "Archive_galleryId_contentHash_idx" ON "Archive"("galleryId", "contentHash");
