-- Migration 016 — Integracao Clinicorp (agenda odontologica) (Postgres/Supabase)
-- Cole o CONTEUDO abaixo no SQL Editor do Supabase e clique Run.
-- Nao destrutivo: so adiciona colunas.
--
-- Clinicorp usa HTTP Basic: Username = ID de acesso ao Sistema (usuario API),
-- Password = Token API. Achados em: Sistema > Gerenciar Assinatura > Acesso
-- Externo e Integracoes > Usuario API (login) | Token API (senha).
-- A maioria dos endpoints exige tambem o subscriber_id (a assinatura/clinica
-- dentro do grupo Clinicorp) e alguns o businessId (unidade).

-- Por clinica: credenciais + identificadores da conta Clinicorp
alter table clinicas add column if not exists clinicorp_api_user text;      -- Username (Basic)
alter table clinicas add column if not exists clinicorp_token text;         -- Token API (Basic password)
alter table clinicas add column if not exists clinicorp_subscriber_id text; -- subscriber_id (assinatura)
alter table clinicas add column if not exists clinicorp_business_id text;   -- businessId (unidade), opcional

-- Por profissional: mapeamento pro dentista correspondente no Clinicorp
alter table profissionais add column if not exists clinicorp_professional_id text;

-- Por consulta: id do agendamento espelhado no Clinicorp (sync de remarcar/cancelar)
alter table consultas add column if not exists clinicorp_agendamento_id text;
