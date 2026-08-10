-- Create UserDepartment table
CREATE TABLE "UserDepartment" (
    "userId" INTEGER NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDepartment_pkey" PRIMARY KEY ("userId", "departmentId")
);

-- Migrate existing departmentId data to UserDepartment
INSERT INTO "UserDepartment" ("userId", "departmentId", "createdAt")
SELECT "id", "departmentId", NOW()
FROM "User"
WHERE "departmentId" IS NOT NULL;

-- Add org-wide users (CEO, TECHNICAL_MANAGER, HR_MANAGER, STRATEGY_MANAGER) to all departments
INSERT INTO "UserDepartment" ("userId", "departmentId", "createdAt")
SELECT u.id, d.id, NOW()
FROM "User" u
CROSS JOIN "Department" d
WHERE u."role" IN ('CEO', 'TECHNICAL_MANAGER', 'HR_MANAGER', 'STRATEGY_MANAGER')
  AND NOT EXISTS (
    SELECT 1 FROM "UserDepartment" ud
    WHERE ud."userId" = u.id AND ud."departmentId" = d.id
  );

-- Drop the old departmentId column from User
ALTER TABLE "User" DROP COLUMN "departmentId";

-- Add foreign key constraints
ALTER TABLE "UserDepartment" ADD CONSTRAINT "UserDepartment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "UserDepartment" ADD CONSTRAINT "UserDepartment_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE;
