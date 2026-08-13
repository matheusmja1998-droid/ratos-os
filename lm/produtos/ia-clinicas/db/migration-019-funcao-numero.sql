-- Migration 019 — Função de cada número de WhatsApp (Postgres/Supabase)
-- Cole no SQL Editor do Supabase e Run. Não destrutivo.
--
-- funcao: pra que serve cada número conectado ('atendimento' | 'financeiro').
-- A IA recebe o canal junto com a mensagem e muda a postura: no financeiro ela
-- foca em pagamento/valores e aciona a equipe pra negociação; no atendimento
-- segue o fluxo normal de agendamento.
alter table instancias add column if not exists funcao text default 'atendimento';
