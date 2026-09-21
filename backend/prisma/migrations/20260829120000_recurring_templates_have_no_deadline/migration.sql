-- Recurring parents are schedules, not work items. They kept the deadline that
-- was typed when the schedule was created, were never completed by anyone, and
-- so aged into permanent overdue rows that inflated every project's numbers.
--
-- Clearing the deadline only affects rows that act as templates
-- (isRecurring AND no parent). Generated occurrences and ordinary tasks are
-- untouched: each occurrence carries its own deadline.
UPDATE "Task"
SET "deadline" = NULL
WHERE "isRecurring" = true
  AND "recurringParentId" IS NULL
  AND "deadline" IS NOT NULL;
