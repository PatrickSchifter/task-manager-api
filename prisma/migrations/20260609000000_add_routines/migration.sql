-- Rotinas: atividades pessoais recorrentes (ex.: "Tomar água"), repetidas
-- todos os dias em vários horários fixos. Três tabelas:
--   Routine            → a atividade, pertence ao usuário (não a um projeto).
--   RoutineTime        → cada horário do dia (HH:mm) em que ela deve ocorrer.
--   RoutineCompletion  → marca (horário, dia) cumprido; unique torna idempotente.

-- 1) Routine
CREATE TABLE "Routine" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- Listagem é sempre "rotinas do usuário".
CREATE INDEX "Routine_ownerId_idx" ON "Routine"("ownerId");

-- Cascade: remover o usuário remove suas rotinas (e, em cadeia, horários e
-- conclusões).
ALTER TABLE "Routine"
  ADD CONSTRAINT "Routine_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) RoutineTime
CREATE TABLE "RoutineTime" (
  "id" TEXT NOT NULL,
  "time" TEXT NOT NULL,
  "routineId" TEXT NOT NULL,

  CONSTRAINT "RoutineTime_pkey" PRIMARY KEY ("id")
);

-- Um mesmo horário não pode se repetir dentro da rotina.
CREATE UNIQUE INDEX "RoutineTime_routineId_time_key" ON "RoutineTime"("routineId", "time");

ALTER TABLE "RoutineTime"
  ADD CONSTRAINT "RoutineTime_routineId_fkey"
  FOREIGN KEY ("routineId") REFERENCES "Routine"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) RoutineCompletion
CREATE TABLE "RoutineCompletion" (
  "id" TEXT NOT NULL,
  "routineTimeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RoutineCompletion_pkey" PRIMARY KEY ("id")
);

-- Idempotência do "concluir": no máximo uma conclusão por (horário, dia).
CREATE UNIQUE INDEX "RoutineCompletion_routineTimeId_date_key"
  ON "RoutineCompletion"("routineTimeId", "date");

ALTER TABLE "RoutineCompletion"
  ADD CONSTRAINT "RoutineCompletion_routineTimeId_fkey"
  FOREIGN KEY ("routineTimeId") REFERENCES "RoutineTime"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
