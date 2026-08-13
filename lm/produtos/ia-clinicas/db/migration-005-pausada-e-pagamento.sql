-- Migration 005 — atendimento humano ("stop") + forma de pagamento (Postgres/Supabase)
-- Cole o CONTEUDO abaixo no SQL Editor do Supabase e clique Run.
-- Nao destrutivo: so adiciona colunas.

-- Pausa a IA por paciente quando o atendente humano assume (comando "stop")
alter table pacientes  add column if not exists ia_pausada boolean default false;

-- Forma de pagamento capturada pela IA no inicio da conversa
alter table consultas  add column if not exists pagamento     text;  -- 'particular' | 'convenio'
alter table consultas  add column if not exists convenio_nome text;
