-- Migration 023: trial de 14 dias por clinica
-- Colar no SQL Editor do Supabase e rodar.
-- trial_inicio = quando o admin apertou "Iniciar trial"; o painel conta 14 dias.

ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS trial_inicio TIMESTAMPTZ;
