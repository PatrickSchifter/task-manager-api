-- Subtarefas: auto-relação 1 nível em Task via "parentId".

-- 1) Coluna parentId (nullable). Top-level = NULL.
ALTER TABLE "Task" ADD COLUMN "parentId" TEXT;

-- 2) FK auto-referente com ON DELETE CASCADE: apagar a tarefa-pai apaga as
--    subtarefas no banco (atende à regra de produto de cascade).
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Task"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Índice de busca por pai (listar subtarefas de uma tarefa).
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- 4) Reescreve o unique de ordenação para incluir parentId.
--    Antes: (projectId, status, order). Agora: (projectId, status, parentId, order),
--    de modo que cada conjunto de subtarefas de um pai tenha seu próprio espaço
--    de chaves fracionárias, independente das tarefas top-level.
--
--    NULLS NOT DISTINCT (Postgres >= 15; aqui rodamos pg16) faz o índice tratar
--    parentId = NULL como UM mesmo valor. Sem isso, o Postgres consideraria cada
--    NULL distinto e o unique deixaria de cobrir as tarefas top-level — perdendo
--    a garantia que já existia em (projectId, status, order).
DROP INDEX "Task_projectId_status_order_key";

CREATE UNIQUE INDEX "Task_projectId_status_parentId_order_key"
  ON "Task"("projectId", "status", "parentId", "order")
  NULLS NOT DISTINCT;
