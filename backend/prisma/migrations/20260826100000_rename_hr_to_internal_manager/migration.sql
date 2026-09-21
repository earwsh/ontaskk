-- Rename the role rather than adding a new value and migrating rows: RENAME VALUE
-- rewrites the enum label in place, so every existing User row keeps pointing at
-- the same role with no data movement and no window where a row is invalid.
ALTER TYPE "Role" RENAME VALUE 'HR_MANAGER' TO 'INTERNAL_MANAGER';
