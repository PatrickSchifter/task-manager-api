-- Converte a coluna de enum para texto preservando os valores existentes
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'TODO';
-- Remove o tipo enum (não é mais referenciado)
DROP TYPE IF EXISTS "TaskStatus";
