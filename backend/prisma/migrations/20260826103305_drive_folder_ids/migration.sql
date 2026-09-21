/*
  Warnings:

  - You are about to drop the `StorageFolder` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "driveFolderId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "driveFolderId" TEXT;

-- DropTable
DROP TABLE "StorageFolder";
