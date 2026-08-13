-- Migration 009 — log de atividades (Postgres/Supabase)
-- Cole o CONTEUDO abaixo no SQL Editor do Supabase e clique Run.
-- Nao destrutivo: so cria a tabela do log.

create table if not exists atividade_log (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references clinicas(id) on delete cascade,
  tipo        text not null,      -- atendimento|consulta|conversa|regua|sistema
  descricao   text not null,
  criado_em   timestamptz default now()
);
create index if not exists idx_atividade_log_clinica on atividade_log(clinica_id, criado_em);
alter table atividade_log enable row level security;
