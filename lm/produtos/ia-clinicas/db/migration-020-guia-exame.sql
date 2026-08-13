-- Migration 020 — Guia de exame automática (Postgres/Supabase)
-- Cole no SQL Editor do Supabase e Run. Não destrutivo.
--
-- Quando a IA marca consulta/avaliação de um convênio que exige exame prévio
-- (ex: Uniodonto → radiografia na CENDRO), o sistema envia AUTOMATICAMENTE o
-- arquivo da guia no WhatsApp do paciente logo após a marcação.
alter table clinicas add column if not exists guia_exame_url text;      -- URL do PDF/imagem da guia
alter table clinicas add column if not exists guia_exame_convenio text; -- convênio que dispara (ex: Uniodonto)
