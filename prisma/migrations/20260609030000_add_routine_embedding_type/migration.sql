-- Adiciona ROUTINE ao enum EmbeddingSourceType para indexar rotinas no RAG.
ALTER TYPE "EmbeddingSourceType" ADD VALUE IF NOT EXISTS 'ROUTINE';
