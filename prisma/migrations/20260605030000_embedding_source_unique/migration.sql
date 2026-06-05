-- Adiciona o índice ÚNICO de (sourceType, sourceId) no Embedding.
-- O schema.prisma declara @@unique([sourceType, sourceId]), mas a migration
-- inicial só criou o @@index (não-único). Este índice tinha ido para produção
-- apenas via `db push`; aqui ele entra no histórico de migrations para que um
-- replay limpo (migrate reset/deploy) reproduza o schema sem drift.
CREATE UNIQUE INDEX "Embedding_sourceType_sourceId_key" ON "Embedding"("sourceType", "sourceId");
