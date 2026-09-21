-- A rejection can name more than one fault.
--
-- One category per rejection forced the reviewer to choose: a task wrong in
-- both the copy and the artwork got labelled with whichever came to mind, and
-- the other half of the finding was never recorded. The counts that came out
-- of that are understated for every category that lost a coin toss.
ALTER TABLE "TaskRejection" ADD COLUMN "categories" "RejectionCategory"[] NOT NULL DEFAULT '{}';

-- Carry the single value across. Rows recorded before categories existed stay
-- empty, which is what they are.
UPDATE "TaskRejection" SET "categories" = ARRAY["category"] WHERE "category" IS NOT NULL;

-- The old column goes rather than staying alongside: two places holding the
-- same fact is how the weight column ended up meaning two different things.
DROP INDEX IF EXISTS "TaskRejection_category_idx";
ALTER TABLE "TaskRejection" DROP COLUMN "category";

CREATE INDEX "TaskRejection_categories_idx" ON "TaskRejection" USING GIN ("categories");
