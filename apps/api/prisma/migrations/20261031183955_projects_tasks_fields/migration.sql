-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "department" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "labels" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "tasks_organizationId_createdAt_idx" ON "tasks"("organizationId", "createdAt");
