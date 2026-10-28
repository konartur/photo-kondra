-- Persist archive lifecycle and a lease to make archive jobs safe for duplicate BullMQ delivery.
CREATE TYPE "ArchiveStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

ALTER TABLE "Archive"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ArchiveStatus" USING "status"::"ArchiveStatus",
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ADD COLUMN "processingLockId" TEXT,
  ADD COLUMN "processingLockExpiresAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Archive"
  ADD CONSTRAINT "Archive_galleryId_fkey"
  FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Archive_galleryId_idx" ON "Archive"("galleryId");
CREATE INDEX "Archive_status_idx" ON "Archive"("status");
CREATE INDEX "Archive_processingLockExpiresAt_idx" ON "Archive"("processingLockExpiresAt");
