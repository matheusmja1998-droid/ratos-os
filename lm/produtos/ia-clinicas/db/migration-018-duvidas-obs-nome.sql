-- Migration 018 — Dúvidas pro especialista + observações da secretária + nome da IA
-- Cole no SQL Editor do Supabase e Run. Não destrutivo.

-- DÚVIDAS: quando a IA não sabe responder, em vez de inventar ela avisa o
-- paciente ("vou confirmar com nosso especialista e já te retorno") e abre uma
-- dúvida aqui. A secretária vê a notificação vermelha em Conversas, responde
-- (ela mesma ou via IA), e a resposta vira APRENDIZADO pros próximos casos.
CREATE TABLE IF NOT EXISTS duvidas (
  id                TEXT PRIMARY KEY,
  clinica_id        TEXT NOT NULL,
  telefone          TEXT NOT NULL,
  pergunta_paciente TEXT NOT NULL,   -- o que o paciente perguntou (literal)
  pergunta_ia       TEXT NOT NULL,   -- a pergunta clara que a IA montou pra secretária
  resposta          TEXT,            -- o que a secretária respondeu
  modo_resposta     TEXT,            -- 'ia' (IA formula e envia) | 'manual' (secretária enviou direto)
  status            TEXT DEFAULT 'pendente',  -- pendente | respondida
  criado_em         TIMESTAMPTZ DEFAULT now(),
  respondida_em     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_duvidas_pendentes ON duvidas(clinica_id, status, criado_em DESC);

-- Observações da secretária no resumo do atendimento (lápis no card)
alter table pacientes add column if not exists observacoes text;

-- Nome da atendente virtual ("me chamo <nome>") — a IA se apresenta com ele
alter table clinicas add column if not exists nome_ia text;
