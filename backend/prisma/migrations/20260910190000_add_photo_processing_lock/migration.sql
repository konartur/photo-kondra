-- Add a lease to prevent duplicate image-processing jobs from writing the same photo concurrently.
ALTER TABLE "Photo"
  ADD COLUMN "processingLockId" TEXT,
  ADD COLUMN "processingLockExpiresAt" TIMESTAMP(3);

CREATE INDEX "Photo_processingLockExpiresAt_idx" ON "Photo"("processingLockExpiresAt");
