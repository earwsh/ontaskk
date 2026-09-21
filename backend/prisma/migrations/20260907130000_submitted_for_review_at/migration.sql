-- The overdue clock stops when work is handed over for review.
ALTER TABLE "Task" ADD COLUMN "submittedForReviewAt" TIMESTAMP(3);

-- Backfill the tasks already sitting in review. When every assignee has
-- ticked their part the task moves to review in the same request, so the
-- latest completion is the handover moment, not a guess.
UPDATE "Task" t
SET "submittedForReviewAt" = s.sub
FROM (
  SELECT a."taskId", max(a."completedAt") AS sub
  FROM "TaskAssignee" a
  WHERE a."completedAt" IS NOT NULL
  GROUP BY a."taskId"
) s
WHERE s."taskId" = t.id
  AND t.status IN ('PENDING_QC', 'PENDING_APPROVAL');
