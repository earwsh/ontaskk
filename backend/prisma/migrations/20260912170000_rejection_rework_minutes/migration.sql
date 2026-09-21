-- How long a rejection costs.
--
-- Weight is minutes, so a person's month reads as "delivered 88 hours". That
-- overstates it whenever some of those hours were spent redoing work that had
-- already been delivered once. The reviewer knows roughly how long the fix
-- will take, and recording it turns the total into useful work: minutes
-- completed minus minutes of rework.
ALTER TABLE "TaskRejection" ADD COLUMN "reworkMinutes" INTEGER;
