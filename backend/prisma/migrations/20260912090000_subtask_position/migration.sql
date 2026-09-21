-- Explicit ordering for subtasks.
--
-- They were ordered by createdAt then id, which reads as the order they were
-- typed but cannot be changed afterwards: a forgotten first step, added later,
-- sorts to the bottom for good. position makes the sequence editable.
ALTER TABLE "TaskSubtask" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill in the order rows are displayed today, so nothing moves on deploy.
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY "taskId" ORDER BY "createdAt", id) - 1 AS pos
  FROM "TaskSubtask"
)
UPDATE "TaskSubtask" s SET "position" = ordered.pos
FROM ordered WHERE ordered.id = s.id;

CREATE INDEX "TaskSubtask_taskId_position_idx" ON "TaskSubtask"("taskId", "position");
