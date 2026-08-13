-- Migration 008 — regua de trial, relatorio do dono, recall e lista de espera
-- Cole o CONTEUDO abaixo no SQL Editor do Supabase e clique Run.
-- Nao destrutivo: so adiciona colunas e tabelas novas.

-- WhatsApp do dono (recebe relatorio automatico) + recall + aviso de trial
alter table clinicas  add column if not exists telefone_dono text;
alter table clinicas  add column if not exists recall_meses integer default 0;
alter table clinicas  add column if not exists trial_aviso_enviado boolean default false;

-- recall de retorno ja enviado pra consulta
alter table consultas add column if not exists recall_enviado boolean default false;

-- Lista de espera / encaixe
create table if not exists lista_espera (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references clinicas(id) on delete cascade,
  profissional_id uuid references profissionais(id) on delete set null,
  telefone        text not null,
  nome            text,
  avisado         boolean default false,
  criado_em       timestamptz default now()
);
create index if not exists idx_lista_espera_fila on lista_espera(clinica_id, avisado, criado_em);
alter table lista_espera enable row level security;

-- Dedup de relatorios automaticos (o cron pode rodar 2x sem mandar repetido)
create table if not exists relatorios_enviados (
  clinica_id  uuid not null,
  chave       text not null,
  criado_em   timestamptz default now(),
  primary key (clinica_id, chave)
);
alter table relatorios_enviados enable row level security;
