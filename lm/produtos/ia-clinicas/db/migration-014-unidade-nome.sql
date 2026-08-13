-- Rótulo amigável da unidade Feegow (ex: "Unidade BH"). Só cosmético — o filtro
-- real é o feegow_local_id. Rodar no Supabase (SQL Editor). Idempotente.

ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS feegow_unidade_nome TEXT;
