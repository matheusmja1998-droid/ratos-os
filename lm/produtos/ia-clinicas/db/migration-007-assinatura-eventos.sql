-- Migration 007 — historico de transicoes de assinatura (Postgres/Supabase)
-- Cole o CONTEUDO abaixo no SQL Editor do Supabase e clique Run.
-- Nao destrutivo: so cria a tabela do historico.
--
-- Base das metricas de negocio do admin: conversao trial->ativa, % de
-- inadimplencia, ranking de quem mais deixou de pagar, churn. Alimentada
-- automaticamente sempre que o status de assinatura de uma clinica muda
-- (webhook do Stripe ou mudanca manual).

create table if not exists assinatura_eventos (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references clinicas(id) on delete cascade,
  de_status   text,               -- status anterior (null no primeiro registro)
  para_status text not null,      -- status novo
  criado_em   timestamptz default now()
);
create index if not exists idx_assinatura_eventos_clinica on assinatura_eventos(clinica_id, criado_em);
alter table assinatura_eventos enable row level security;
