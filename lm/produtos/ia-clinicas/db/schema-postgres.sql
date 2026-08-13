-- Schema Postgres/Supabase — equivalente ao db/schema.sql (SQLite)
-- Rode este SQL no editor SQL do Supabase (ou via script de migracao).
-- Diferencas vs SQLite: uuid nativo, timestamptz, boolean de verdade.

create extension if not exists "pgcrypto";

create table if not exists clinicas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  endereco      text,
  convenios     text,
  precos        text,
  faq           text,
  tom_de_voz    text default 'informal e acolhedor',
  link_review   text,
  timezone      text default 'America/Sao_Paulo',
  ativo         boolean default true,
  criado_em     timestamptz default now()
);

create table if not exists instancias (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references clinicas(id) on delete cascade,
  nome            text,
  numero          text,
  uazapi_instance text,
  uazapi_token    text,
  status          text default 'desconectado',
  criado_em       timestamptz default now()
);

create table if not exists profissionais (
  id             uuid primary key default gen_random_uuid(),
  clinica_id     uuid not null references clinicas(id) on delete cascade,
  nome           text not null,
  especialidade  text,
  duracao_min    integer default 30,
  gcal_id        text,
  ativo          boolean default true,
  criado_em      timestamptz default now()
);

create table if not exists horarios (
  id              uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references profissionais(id) on delete cascade,
  dia_semana      integer not null,
  hora_inicio     text not null,
  hora_fim        text not null
);

create table if not exists pacientes (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references clinicas(id) on delete cascade,
  nome        text,
  telefone    text not null,
  ia_pausada  boolean default false,   -- humano assumiu (comando "stop")
  criado_em   timestamptz default now()
);

create table if not exists consultas (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references clinicas(id) on delete cascade,
  profissional_id uuid not null references profissionais(id) on delete cascade,
  paciente_id     uuid not null references pacientes(id) on delete cascade,
  inicio          text not null,
  fim             text not null,
  status          text default 'agendada',
  origem          text default 'ia',
  pagamento       text,                -- 'particular' | 'convenio'
  convenio_nome   text,
  confirmacao_enviada boolean default false,
  review_enviado      boolean default false,
  observacao      text,
  criado_em       timestamptz default now()
);

create table if not exists mensagens (
  id           uuid primary key default gen_random_uuid(),
  clinica_id   uuid not null references clinicas(id) on delete cascade,
  instancia_id uuid references instancias(id) on delete set null,
  telefone     text not null,
  role         text not null,
  conteudo     text not null,
  criado_em    timestamptz default now()
);

create table if not exists bloqueios (
  id              uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references profissionais(id) on delete cascade,
  inicio          text not null,
  fim             text not null,
  motivo          text
);

create index if not exists idx_consultas_clinica on consultas(clinica_id, inicio);
create index if not exists idx_consultas_prof on consultas(profissional_id, inicio);
create index if not exists idx_mensagens_conversa on mensagens(clinica_id, telefone, criado_em);
create index if not exists idx_instancias_numero on instancias(numero);

-- RLS: como o backend usa a service_role key (bypassa RLS), nao precisamos
-- de policies pro MVP. Quando expor o painel a usuarios finais, ligar RLS aqui.
