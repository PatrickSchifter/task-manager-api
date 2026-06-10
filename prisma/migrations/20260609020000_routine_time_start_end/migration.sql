-- Substitui o campo `time` (HH:mm) por `startTime` e `endTime` em RoutineTime.
-- Dados existentes: startTime e endTime recebem o valor anterior de `time`.
ALTER TABLE "RoutineTime" ADD COLUMN "startTime" TEXT;
ALTER TABLE "RoutineTime" ADD COLUMN "endTime"   TEXT;

UPDATE "RoutineTime" SET "startTime" = "time", "endTime" = "time";

ALTER TABLE "RoutineTime" ALTER COLUMN "startTime" SET NOT NULL;
ALTER TABLE "RoutineTime" ALTER COLUMN "endTime"   SET NOT NULL;

DROP INDEX IF EXISTS "RoutineTime_routineId_time_key";

ALTER TABLE "RoutineTime" DROP COLUMN "time";

CREATE UNIQUE INDEX "RoutineTime_routineId_startTime_key"
  ON "RoutineTime"("routineId", "startTime");
