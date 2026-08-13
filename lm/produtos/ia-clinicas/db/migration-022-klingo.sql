-- Migration 022: integracao Klingo (sistema de gestao de unidades de saude)
-- Colar no SQL Editor do Supabase e rodar.
--  - clinicas: app token (unica credencial), unidade (CNES) e filtros opcionais
--  - profissionais: id do profissional no Klingo + CRM (filtro de agenda)
--  - consultas: id do voucher espelhado no Klingo

ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS klingo_app_token TEXT;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS klingo_cnes TEXT;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS klingo_especialidade TEXT;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS klingo_plano TEXT;

ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS klingo_professional_id TEXT;
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS klingo_crm TEXT;

ALTER TABLE consultas ADD COLUMN IF NOT EXISTS klingo_voucher_id TEXT;
