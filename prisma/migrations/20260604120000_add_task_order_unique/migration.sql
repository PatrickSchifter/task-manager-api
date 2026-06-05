-- Backfill existing order values: compact, unique per (projectId, status) column.
-- Newest tasks first (order = 0) to match the "new task goes to the top" behavior.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "projectId", "status"
      ORDER BY "createdAt" DESC, "id" DESC
    ) - 1 AS rn
  FROM "Task"
)
UPDATE "Task" t
SET "order" = ranked.rn
FROM ranked
WHERE t."id" = ranked."id";

-- AlterTable: make order required with a default of 0.
ALTER TABLE "Task" ALTER COLUMN "order" SET NOT NULL,
ALTER COLUMN "order" SET DEFAULT 0;

-- CreateIndex: no two tasks in the same project may share the same status and order.
CREATE UNIQUE INDEX "Task_projectId_status_order_key" ON "Task"("projectId", "status", "order");
