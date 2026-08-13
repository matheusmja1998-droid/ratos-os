-- Migration 024: origem da mensagem enviada pela clinica
-- Colar no SQL Editor do Supabase e rodar.
-- Distingue o que a IA respondeu do que um atendente digitou pelo painel.
-- Vazio/NULL = IA (comportamento historico de todas as mensagens antigas).

ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS origem TEXT;
