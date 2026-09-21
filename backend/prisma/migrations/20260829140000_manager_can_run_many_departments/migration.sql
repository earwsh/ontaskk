-- One person may manage several departments.
--
-- The unique index on Department."managerId" allowed each user to be the
-- manager of at most one department: a second assignment failed with a
-- duplicate-key error before any application logic ran.
--
-- Dropping a unique index only widens what is allowed, so no existing row
-- changes and nothing that worked before stops working. A plain index takes
-- its place because every request by a department manager looks their
-- departments up by this column.
DROP INDEX IF EXISTS "Department_managerId_key";
CREATE INDEX IF NOT EXISTS "Department_managerId_idx" ON "Department"("managerId");
