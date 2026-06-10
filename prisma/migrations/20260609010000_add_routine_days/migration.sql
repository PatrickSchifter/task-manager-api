-- Adiciona o campo `days` (dias da semana) às rotinas existentes.
-- Array vazio = todos os dias (padrão). 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb.
ALTER TABLE "Routine" ADD COLUMN "days" INTEGER[] NOT NULL DEFAULT '{}';
