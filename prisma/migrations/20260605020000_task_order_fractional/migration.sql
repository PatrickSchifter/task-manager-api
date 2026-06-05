-- Migração da ordenação de tasks: inteiro denso (com reflow) -> fractional index (string).
-- A nova coluna usa COLLATE "C" para que a ordenação por bytes do Postgres case
-- exatamente com a ordenação lexicográfica das chaves do `fractional-indexing`.

-- 1. Remove o índice único da ordenação inteira.
DROP INDEX IF EXISTS "Task_projectId_status_order_key";

-- 2. Nova coluna de chave fracionária (byte order).
ALTER TABLE "Task" ADD COLUMN "orderKey" text COLLATE "C";

-- 3. Backfill preservando a ordem atual, por (projectId, status).
--    Reproduz o formato base-62 da lib: rank < 62 -> 'a' + dígito;
--    caso contrário -> 'b' + 2 dígitos de (rank - 62). Cobre até 3906 por coluna.
WITH ranked AS (
  SELECT
    "id",
    (ROW_NUMBER() OVER (
      PARTITION BY "projectId", "status"
      ORDER BY "order" ASC, "createdAt" ASC, "id" ASC
    ) - 1)::int AS rn
  FROM "Task"
)
UPDATE "Task" t
SET "orderKey" =
  CASE
    WHEN r.rn < 62 THEN
      'a' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'::text, (r.rn % 62) + 1, 1)
    ELSE
      'b'
      || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'::text, ((r.rn - 62) / 62) + 1, 1)
      || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'::text, ((r.rn - 62) % 62) + 1, 1)
  END
FROM ranked r
WHERE t."id" = r."id";

-- 4. Substitui a coluna antiga pela nova.
ALTER TABLE "Task" DROP COLUMN "order";
ALTER TABLE "Task" RENAME COLUMN "orderKey" TO "order";

-- 5. Restrições e default.
ALTER TABLE "Task" ALTER COLUMN "order" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "order" SET DEFAULT 'a0';
CREATE UNIQUE INDEX "Task_projectId_status_order_key" ON "Task"("projectId", "status", "order");
