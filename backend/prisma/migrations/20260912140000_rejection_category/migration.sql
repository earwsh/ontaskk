-- A countable reason for sending work back.
--
-- reason was required but free text, and of the first 21 rejections 16 said
-- "." or "/" — the field was answered, not filled in. Nothing about "why" can
-- be charted from that. The category is picked from a list, so it can be.
CREATE TYPE "RejectionCategory" AS ENUM (
  'CONTENT', 'DESIGN', 'BRIEF_MISMATCH', 'INCOMPLETE', 'WEAK_REPORT', 'TIMING', 'OTHER'
);

-- Nullable: the rows already recorded have no category and guessing one from
-- a full stop would invent data.
ALTER TABLE "TaskRejection" ADD COLUMN "category" "RejectionCategory";

CREATE INDEX "TaskRejection_category_idx" ON "TaskRejection"("category");
