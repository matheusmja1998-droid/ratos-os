-- Migration 026: bloqueios manuais de horario de EXAME
-- Colar no SQL Editor do Supabase e rodar.
--
-- POR QUE: a API publica da Feegow NAO expoe os bloqueios da Agenda de
-- Equipamentos (testado 20/08: /appoints/search so traz agendamentos e o
-- /appoints/available-schedule devolve agenda de MEDICO, nao do equipamento).
-- Entao um horario bloqueado pela recepcao aparecia livre e a IA oferecia
-- (caso real: Ergoespirometria 26/08 as 10:45, bloqueada no sistema deles).
-- Aqui a clinica marca o bloqueio pelo painel e a IA passa a respeitar.

CREATE TABLE IF NOT EXISTS bloqueios_exame (
  id            TEXT PRIMARY KEY,
  clinica_id    TEXT NOT NULL,
  exame_id      TEXT,          -- procedimento (NULL = vale pra todos os exames)
  data          TEXT NOT NULL, -- YYYY-MM-DD
  hora_inicio   TEXT NOT NULL, -- HH:MM
  hora_fim      TEXT NOT NULL, -- HH:MM (exclusivo)
  motivo        TEXT,
  criado_em     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bloq_exame_clinica_data ON bloqueios_exame(clinica_id, data);
