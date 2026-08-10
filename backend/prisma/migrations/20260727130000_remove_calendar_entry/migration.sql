-- DropForeignKey
ALTER TABLE "CalendarEntry" DROP CONSTRAINT IF EXISTS "CalendarEntry_createdById_fkey";

-- DropForeignKey
ALTER TABLE "CalendarEntry" DROP CONSTRAINT IF EXISTS "CalendarEntry_projectId_fkey";

-- DropTable
DROP TABLE IF EXISTS "CalendarEntry";
