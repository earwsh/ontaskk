-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" SERIAL NOT NULL,
    "site" TEXT NOT NULL,
    "formName" TEXT NOT NULL,
    "pageUrl" TEXT,
    "fields" JSONB NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormSubmission_createdAt_idx" ON "FormSubmission"("createdAt");

-- CreateIndex
CREATE INDEX "FormSubmission_site_idx" ON "FormSubmission"("site");

-- CreateIndex
CREATE INDEX "FormSubmission_read_idx" ON "FormSubmission"("read");
