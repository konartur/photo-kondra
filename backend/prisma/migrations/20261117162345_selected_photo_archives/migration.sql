-- AlterTable
ALTER TABLE "Archive" ADD COLUMN     "selectedPhotoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "updatedAt" DROP DEFAULT;
