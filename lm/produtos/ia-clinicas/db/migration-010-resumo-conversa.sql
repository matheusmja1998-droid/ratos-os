-- Migration 010 — resumo da conversa (card da secretaria) (Postgres/Supabase)
-- Cole o CONTEUDO abaixo no SQL Editor do Supabase e clique Run.
-- Nao destrutivo: so adiciona 2 colunas em pacientes.

-- Cache do resumo gerado pela IA (so regenera quando a conversa anda —
-- abrir a conversa mostra o resumo NA HORA, sem custo por abertura)
alter table pacientes add column if not exists resumo text;
alter table pacientes add column if not exists resumo_atualizado_em timestamptz;
