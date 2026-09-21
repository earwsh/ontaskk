-- Weight becomes minutes, everywhere.
--
-- The column held two different things. The task form asked for a 1-5
-- priority, while the API filled the same column from the estimate whenever
-- that box was left empty. On live data that left 2,272 tasks carrying a 1-5
-- value and 1,727 carrying minutes, and the workload totals summed the two
-- together: a 60-minute task entered through the form counted 1 next to
-- another task's 90.
--
-- Nothing is lost by overwriting the 1-5 values. They were never a priority
-- the app acted on -- no query sorted or filtered by them -- and leaving them
-- in place would keep the workload figures wrong.
UPDATE "Task"
   SET "weight" = COALESCE("estimatedHours", 0) * 60 + COALESCE("estimatedMinutes", 0)
 WHERE COALESCE("estimatedHours", 0) * 60 + COALESCE("estimatedMinutes", 0) > 0;

-- A task with no estimate has unknown weight, not zero: analytics substitutes
-- its own default, and storing 0 would drop the task out of workload entirely.
UPDATE "Task"
   SET "weight" = NULL
 WHERE COALESCE("estimatedHours", 0) * 60 + COALESCE("estimatedMinutes", 0) = 0;
