-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastGeneratedDate" TIMESTAMP(3),
ADD COLUMN     "recurrenceDays" TEXT,
ADD COLUMN     "recurrenceEnd" TIMESTAMP(3),
ADD COLUMN     "recurrencePattern" TEXT,
ADD COLUMN     "recurringParentId" INTEGER;

-- AlterTable
ALTER TABLE "TaskAssignee" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "isCompleted" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurringParentId_fkey" FOREIGN KEY ("recurringParentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
