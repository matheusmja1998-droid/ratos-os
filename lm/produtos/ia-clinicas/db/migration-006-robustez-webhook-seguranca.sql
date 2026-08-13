-- Migration 006 — robustez do webhook + seguranca (Postgres/Supabase)
-- Cole o CONTEUDO abaixo no SQL Editor do Supabase e clique Run.
-- Nao destrutivo: cria tabelas/colunas/indices novos, nao apaga nada.

-- 1) Dedup de webhook: a uazapi reenvia se nao receber 200 a tempo. Sem isso,
--    reenvio = mensagem/resposta duplicada e ate consulta marcada 2x.
create table if not exists webhook_eventos (
  message_id  text primary key,
  criado_em   timestamptz default now()
);

-- 2) Um telefone = um paciente por clinica (evita cadastro duplicado em corrida
--    entre 2 webhooks paralelos do mesmo paciente novo).
--    ATENCAO: se ja existir duplicata na base, rode antes:
--    select clinica_id, telefone, count(*) from pacientes group by 1,2 having count(*) > 1;
--    e resolva manualmente antes de criar o index (o create vai falhar se houver duplicata).
create unique index if not exists uniq_paciente_clinica_telefone on pacientes(clinica_id, telefone);

-- 3) Revogacao de sessao: incrementar sessao_versao da conta derruba todas as
--    sessoes ativas dela (ex: funcionario saiu, senha trocada por suspeita).
alter table contas add column if not exists sessao_versao integer default 1;

-- 4) Rate limit de login (janela deslizante simples por email).
create table if not exists login_tentativas (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  sucesso     boolean default false,
  criado_em   timestamptz default now()
);
create index if not exists idx_login_tentativas_email on login_tentativas(email, criado_em);

-- 5) Lock do cron das reguas (impede 2 execucoes simultaneas mandarem
--    confirmacao/review duplicado pro paciente).
create table if not exists reguas_lock (
  id           integer primary key,
  rodando      boolean default false,
  iniciado_em  timestamptz
);
insert into reguas_lock (id, rodando) values (1, false) on conflict (id) do nothing;

-- 5.5) Lock por conversa: impede 2 mensagens do mesmo paciente rodarem 2
--      respostas da IA em paralelo (fora de ordem / consulta dupla).
create table if not exists conversa_lock (
  clinica_id  text not null,
  telefone    text not null,
  travado_em  timestamptz not null,
  primary key (clinica_id, telefone)
);

-- 6) Guarda o id do evento no Google Calendar do medico junto da consulta, pra
--    remarcar/cancelar conseguirem atualizar/apagar o evento correspondente
--    (antes so criava; cancelamento/remarcacao pela IA deixava o evento orfao
--    no Google, e o painel — que trata o Google como fonte da verdade — mostrava
--    a consulta cancelada como se ainda estivesse confirmada).
alter table consultas add column if not exists gcal_event_id text;
