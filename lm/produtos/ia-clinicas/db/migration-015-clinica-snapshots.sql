-- Snapshots dos dados da clínica (rede de segurança pra recuperar
-- endereço/convênios/preços se forem apagados). Rodar no Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS clinica_snapshots (
  id          TEXT PRIMARY KEY,
  clinica_id  TEXT NOT NULL,
  dados       TEXT NOT NULL,
  criado_em   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinica_snapshots ON clinica_snapshots(clinica_id, criado_em DESC);
