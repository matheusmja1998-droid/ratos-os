-- Migration 004 — OAuth Google Calendar por medico (Postgres/Supabase)
-- Cole o CONTEUDO abaixo no SQL Editor do Supabase e clique Run.
-- Nao destrutivo: so adiciona colunas em profissionais.

alter table profissionais add column if not exists gcal_refresh_token text;
alter table profissionais add column if not exists gcal_conectado     boolean default false;
alter table profissionais add column if not exists gcal_email         text;
