-- DropIndex
DROP INDEX IF EXISTS "Department_managerId_idx";

-- AlterTable
ALTER TABLE "TaskSubtask" ADD COLUMN     "assigneeId" INTEGER,
ADD COLUMN     "completedById" INTEGER;

-- CreateIndex
CREATE INDEX "TaskSubtask_taskId_idx" ON "TaskSubtask"("taskId");

-- CreateIndex
CREATE INDEX "TaskSubtask_assigneeId_idx" ON "TaskSubtask"("assigneeId");

-- AddForeignKey
ALTER TABLE "TaskSubtask" ADD CONSTRAINT "TaskSubtask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSubtask" ADD CONSTRAINT "TaskSubtask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
