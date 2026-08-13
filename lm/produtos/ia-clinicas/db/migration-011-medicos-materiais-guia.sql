-- Migration 011 — dados dos medicos, materiais da IA, guia de exame, oferta curta
-- Cole o CONTEUDO abaixo no SQL Editor do Supabase e clique Run.
-- Nao destrutivo: so adiciona colunas e a tabela materiais.

-- Convenios e informacoes extras POR profissional (cada medico atende convenios
-- diferentes; info = o que atende, restricoes, bio — vira conhecimento da IA)
alter table profissionais add column if not exists convenios text;
alter table profissionais add column if not exists info text;

-- Oferta de horarios: 'curta' (dia mais proximo + 3 horarios) ou 'completa'
alter table clinicas add column if not exists oferta_horarios text default 'curta';

-- Guia do exame enviada pelo paciente, anexada na consulta (abre no card da agenda)
alter table consultas add column if not exists guia_url text;

-- Ultima imagem/PDF que o paciente mandou na conversa (usada como guia ao agendar)
alter table pacientes add column if not exists ultima_midia_url text;
alter table pacientes add column if not exists ultima_midia_em timestamptz;

-- Materiais da clinica (PDFs/textos convertidos pra texto = conhecimento da IA)
create table if not exists materiais (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references clinicas(id) on delete cascade,
  nome        text not null,
  conteudo    text not null,
  criado_em   timestamptz default now()
);
create index if not exists idx_materiais_clinica on materiais(clinica_id);
alter table materiais enable row level security;
