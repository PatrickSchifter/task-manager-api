-- CreateTable
CREATE TABLE "ProjectStatus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectStatus_projectId_idx" ON "ProjectStatus"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStatus_projectId_value_key" ON "ProjectStatus"("projectId", "value");

-- AddForeignKey
ALTER TABLE "ProjectStatus" ADD CONSTRAINT "ProjectStatus_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default statuses for every existing project
INSERT INTO "ProjectStatus" ("id", "name", "value", "order", "projectId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'A Fazer',      'TODO',        1, id, NOW(), NOW() FROM "Project"
UNION ALL
SELECT gen_random_uuid()::text, 'Em Progresso', 'IN_PROGRESS', 2, id, NOW(), NOW() FROM "Project"
UNION ALL
SELECT gen_random_uuid()::text, 'Concluído',    'DONE',        3, id, NOW(), NOW() FROM "Project";
