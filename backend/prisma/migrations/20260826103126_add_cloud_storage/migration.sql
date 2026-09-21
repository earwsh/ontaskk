-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('LOCAL', 'GOOGLE_DRIVE');

-- AlterTable
ALTER TABLE "TaskAttachment" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "provider" "StorageProvider" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "sizeBytes" BIGINT,
ADD COLUMN     "thumbnailUrl" TEXT;

-- CreateTable
CREATE TABLE "StorageAccount" (
    "id" SERIAL NOT NULL,
    "provider" "StorageProvider" NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accountEmail" TEXT,
    "rootFolderId" TEXT,
    "connectedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageFolder" (
    "id" SERIAL NOT NULL,
    "provider" "StorageProvider" NOT NULL,
    "projectId" INTEGER NOT NULL,
    "taskId" INTEGER,
    "folderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageAccount_provider_key" ON "StorageAccount"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "StorageFolder_provider_projectId_taskId_key" ON "StorageFolder"("provider", "projectId", "taskId");

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");

-- AddForeignKey
ALTER TABLE "StorageAccount" ADD CONSTRAINT "StorageAccount_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
