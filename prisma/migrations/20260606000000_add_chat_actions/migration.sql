-- AlterTable: add actions column to ChatMessage for storing agent-executed actions
ALTER TABLE "ChatMessage" ADD COLUMN "actions" JSONB;
