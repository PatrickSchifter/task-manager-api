-- Add ATTACHMENT to EmbeddingSourceType enum
ALTER TYPE "EmbeddingSourceType" ADD VALUE IF NOT EXISTS 'ATTACHMENT';

-- Add chunkIndex column to Embedding (default 0 keeps existing rows valid)
ALTER TABLE "Embedding" ADD COLUMN IF NOT EXISTS "chunkIndex" INTEGER NOT NULL DEFAULT 0;

-- Drop the old unique constraint and replace with chunk-aware one
ALTER TABLE "Embedding" DROP CONSTRAINT IF EXISTS "Embedding_sourceType_sourceId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Embedding_sourceType_sourceId_chunkIndex_key"
  ON "Embedding" ("sourceType", "sourceId", "chunkIndex");

-- HNSW index for fast approximate nearest-neighbour search (cosine distance)
-- Greatly improves search latency as the Embedding table grows with chunks.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Embedding_vector_hnsw_idx"
  ON "Embedding" USING hnsw (vector vector_cosine_ops);

-- New enums
CREATE TYPE "StorageProvider" AS ENUM ('CLOUDINARY', 'SUPABASE');
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'EMBEDDED', 'FAILED');

-- Attachment model
CREATE TABLE IF NOT EXISTS "Attachment" (
    "id"           TEXT         NOT NULL,
    "fileName"     TEXT         NOT NULL,
    "mimeType"     TEXT         NOT NULL,
    "size"         INTEGER      NOT NULL,
    "provider"     "StorageProvider" NOT NULL,
    "storageKey"   TEXT         NOT NULL,
    "url"          TEXT,
    "status"       "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "taskId"       TEXT         NOT NULL,
    "commentId"    TEXT,
    "uploadedById" TEXT         NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Attachment_taskId_fkey"
        FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_commentId_fkey"
        FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_uploadedById_fkey"
        FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Attachment_taskId_idx"    ON "Attachment" ("taskId");
CREATE INDEX IF NOT EXISTS "Attachment_commentId_idx" ON "Attachment" ("commentId");
