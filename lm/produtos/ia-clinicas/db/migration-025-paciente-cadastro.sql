-- Migration 025: dados de cadastro do paciente (pra recepcao lancar no sistema
-- da clinica sem precisar perguntar de novo ao paciente).
-- Colar no SQL Editor do Supabase e rodar.

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS nascimento TEXT;
