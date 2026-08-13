-- Uso de tokens da IA, agregado por clínica + dia (custo por clínica no admin).
-- Rodar no Supabase (SQL Editor). Idempotente.

CREATE TABLE IF NOT EXISTS uso_tokens (
  clinica_id     TEXT NOT NULL,
  dia            TEXT NOT NULL,            -- "YYYY-MM-DD" no fuso SP
  input_tokens   BIGINT DEFAULT 0,
  output_tokens  BIGINT DEFAULT 0,
  cache_write    BIGINT DEFAULT 0,
  cache_read     BIGINT DEFAULT 0,
  chamadas       BIGINT DEFAULT 0,
  PRIMARY KEY (clinica_id, dia)
);

-- Increment atômico (evita corrida de leitura+escrita quando várias respostas
-- da IA caem no mesmo dia/clínica ao mesmo tempo). O código chama via RPC e,
-- se a function não existir, cai num upsert manual — mas o ideal é ter ela.
CREATE OR REPLACE FUNCTION incrementar_uso_tokens(
  p_clinica TEXT, p_dia TEXT,
  p_in BIGINT, p_out BIGINT, p_cw BIGINT, p_cr BIGINT, p_ch BIGINT
) RETURNS void AS $$
  INSERT INTO uso_tokens (clinica_id, dia, input_tokens, output_tokens, cache_write, cache_read, chamadas)
  VALUES (p_clinica, p_dia, p_in, p_out, p_cw, p_cr, p_ch)
  ON CONFLICT (clinica_id, dia) DO UPDATE SET
    input_tokens  = uso_tokens.input_tokens  + EXCLUDED.input_tokens,
    output_tokens = uso_tokens.output_tokens + EXCLUDED.output_tokens,
    cache_write   = uso_tokens.cache_write   + EXCLUDED.cache_write,
    cache_read    = uso_tokens.cache_read    + EXCLUDED.cache_read,
    chamadas      = uso_tokens.chamadas      + EXCLUDED.chamadas;
$$ LANGUAGE sql;
