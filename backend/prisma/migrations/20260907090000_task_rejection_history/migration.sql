-- Rejection history: the task row only keeps the latest QC decision and wipes
-- it on resubmission, so per-employee rejection counts had no source.
CREATE TYPE "RejectionStage" AS ENUM ('QC', 'APPROVAL');

CREATE TABLE "TaskRejection" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "byId" INTEGER,
    "stage" "RejectionStage" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskRejection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskRejection_userId_createdAt_idx" ON "TaskRejection"("userId", "createdAt");
CREATE INDEX "TaskRejection_taskId_idx" ON "TaskRejection"("taskId");

ALTER TABLE "TaskRejection" ADD CONSTRAINT "TaskRejection_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskRejection" ADD CONSTRAINT "TaskRejection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskRejection" ADD CONSTRAINT "TaskRejection_byId_fkey"
  FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill what is still recoverable: tasks whose current QC decision is a
-- rejection. Earlier rejections on the same task were overwritten and cannot
-- be recovered, so historic counts are a floor, not a full history.
INSERT INTO "TaskRejection" ("taskId", "userId", "byId", "stage", "reason", "createdAt")
SELECT t."id", a."userId", t."qcById", 'QC', t."qcNote", COALESCE(t."qcAt", t."updatedAt")
FROM "Task" t
JOIN "TaskAssignee" a ON a."taskId" = t."id"
WHERE t."qcPassed" = false;
