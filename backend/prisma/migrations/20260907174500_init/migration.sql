-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "GalleryStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gallery" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "GalleryStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Gallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "originalKey" TEXT,
    "previewKey" TEXT,
    "thumbnailKey" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "PhotoStatus" NOT NULL DEFAULT 'UPLOADING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryAccess" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GalleryAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Archive" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "storageKey" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "Archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Gallery_ownerId_idx" ON "Gallery"("ownerId");
CREATE INDEX "Gallery_status_idx" ON "Gallery"("status");
CREATE INDEX "Photo_galleryId_idx" ON "Photo"("galleryId");
CREATE INDEX "Photo_status_idx" ON "Photo"("status");
CREATE UNIQUE INDEX "GalleryAccess_tokenHash_key" ON "GalleryAccess"("tokenHash");
CREATE INDEX "GalleryAccess_galleryId_idx" ON "GalleryAccess"("galleryId");
CREATE INDEX "GalleryAccess_expiresAt_idx" ON "GalleryAccess"("expiresAt");

-- AddForeignKey
ALTER TABLE "Gallery" ADD CONSTRAINT "Gallery_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GalleryAccess" ADD CONSTRAINT "GalleryAccess_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
