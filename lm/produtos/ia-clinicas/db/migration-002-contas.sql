-- Migration 002 — Contas de acesso (admin + por clinica)
-- Roda no SQL Editor do Supabase. Nao destrutivo: so cria a tabela contas.

create table if not exists contas (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  senha_hash  text not null,          -- PBKDF2 com salt embutido
  papel       text not null default 'clinica',  -- 'admin' | 'clinica'
  clinica_id  uuid references clinicas(id) on delete cascade,
  nome        text,
  ativo       boolean default true,
  criado_em   timestamptz default now()
);

-- RLS (defesa em profundidade; backend usa service_role e bypassa)
alter table contas enable row level security;

create index if not exists idx_contas_email on contas(email);
