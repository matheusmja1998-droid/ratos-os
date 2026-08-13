-- Migration 021 — CRM (Kanban) + dados de contato do WhatsApp (Postgres/Supabase)
-- Cole no SQL Editor do Supabase e Run. Não destrutivo (só ADD COLUMN).
--
-- Duas coisas nesta leva:
--  1) CRM: cada paciente vira um card num Kanban (Novo → Em atendimento →
--     Agendado → Cliente → Perdido). A IA move sozinha conforme o atendimento
--     anda; a recepção pode arrastar o card na mão. Serve pra, no futuro,
--     disparar mensagem pra "todos os clientes" ou "todos os leads parados".
--  2) Contato: nome real do WhatsApp e foto do perfil, com cache local (a
--     uazapi é consultada uma vez e o resultado fica guardado aqui).

-- ---------- CRM ----------
-- etapa do funil. NULL = ainda não classificado (a tela trata como 'novo').
alter table pacientes add column if not exists crm_etapa text;
-- 'lead' | 'cliente' — marcado pela recepção ou pela IA quando a consulta acontece
alter table pacientes add column if not exists crm_tipo text;
-- anotações livres do card (diferente de `observacoes`, que é da conversa)
alter table pacientes add column if not exists crm_notas text;
-- etiquetas separadas por vírgula (ex: "unimed,implante") pra segmentar disparo
alter table pacientes add column if not exists crm_tags text;
-- quando o card mudou de etapa pela última vez (mede lead parado)
alter table pacientes add column if not exists crm_atualizado_em timestamptz;

-- ---------- Contato do WhatsApp ----------
-- nome como está salvo/publicado no WhatsApp (pushName), separado de `nome`
-- (que é o nome que o paciente disse pra IA e vai pro cadastro da consulta)
alter table pacientes add column if not exists wa_nome text;
-- URL da foto de perfil. A uazapi devolve link temporário; renovamos pelo cache.
alter table pacientes add column if not exists wa_foto_url text;
-- quando buscamos o contato pela última vez (evita repetir chamada à uazapi)
alter table pacientes add column if not exists wa_contato_em timestamptz;

-- ---------- Caixa de entrada ----------
-- conversa marcada como importante (estrela) pela recepção
alter table pacientes add column if not exists importante boolean default false;
-- até quando a conversa está lida: timestamp da última mensagem que a recepção
-- viu. Mensagem do paciente mais nova que isso = não lida.
alter table pacientes add column if not exists lido_ate timestamptz;

-- lista do Kanban filtra por etapa dentro da clínica
create index if not exists idx_pacientes_crm on pacientes (clinica_id, crm_etapa);
