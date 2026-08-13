-- Migration 012 — Integracao Feegow (agenda bidirecional) (Postgres/Supabase)
-- Cole o CONTEUDO abaixo no SQL Editor do Supabase e clique Run.
-- Nao destrutivo: so adiciona colunas.

-- Por clinica: token da API Feegow (x-access-token, gerado pelo usuario master
-- na interface do Feegow), unidade (local_id) e motivo padrao de cancelamento
alter table clinicas add column if not exists feegow_token text;
alter table clinicas add column if not exists feegow_local_id text;
alter table clinicas add column if not exists feegow_motivo_id text;

-- Por profissional: mapeamento pro profissional correspondente no Feegow
-- (+ especialidade e procedimento padrao usados ao criar agendamento la)
alter table profissionais add column if not exists feegow_professional_id text;
alter table profissionais add column if not exists feegow_especialidade_id text;
alter table profissionais add column if not exists feegow_procedimento_id text;

-- Por consulta: id do agendamento espelhado no Feegow (sync de remarcar/cancelar)
alter table consultas add column if not exists feegow_agendamento_id text;
