-- Approval history, the missing half of the review record.
--
-- Rejections have had their own table since the start, so "what did this
-- reviewer send back" is answerable. Approvals only ever existed as the qc*
-- and approvedBy* columns on the task itself, which the next decision
-- overwrites — a task approved, returned, and approved again kept just the
-- last pass.

-- The enum now labels both halves, so its name should not say rejection.
ALTER TYPE "RejectionStage" RENAME TO "ReviewStage";

CREATE TABLE "TaskApproval" (
    "id"        SERIAL NOT NULL,
    "taskId"    INTEGER NOT NULL,
    "byId"      INTEGER,
    "stage"     "ReviewStage" NOT NULL,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskApproval_byId_createdAt_idx" ON "TaskApproval"("byId", "createdAt");
CREATE INDEX "TaskApproval_taskId_idx" ON "TaskApproval"("taskId");

ALTER TABLE "TaskApproval" ADD CONSTRAINT "TaskApproval_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskApproval" ADD CONSTRAINT "TaskApproval_byId_fkey"
    FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill what the task rows still remember. This is one row per task at
-- most, not the true history -- earlier passes were overwritten long ago and
-- cannot be recovered -- but it keeps every approval that is knowable today.
INSERT INTO "TaskApproval" ("taskId", "byId", "stage", "note", "createdAt")
SELECT id, "qcById", 'QC', "qcNote", "qcAt"
FROM "Task"
WHERE "qcPassed" = true AND "qcById" IS NOT NULL AND "qcAt" IS NOT NULL;

INSERT INTO "TaskApproval" ("taskId", "byId", "stage", "note", "createdAt")
SELECT id, "approvedById", 'APPROVAL', NULL, "approvedAt"
FROM "Task"
WHERE "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL;
