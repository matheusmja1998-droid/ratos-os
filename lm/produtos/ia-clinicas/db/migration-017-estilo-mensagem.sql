-- Migration 017 — Estilo/tamanho das mensagens da IA (Postgres/Supabase)
-- Cole no SQL Editor do Supabase e Run. Nao destrutivo.
--
-- msg_estilo: alvo de tamanho das mensagens da IA, controlado por slider na
-- tela de Configuracoes (1 = curtissima, 3 = media, 5 = detalhada com emojis).
alter table clinicas add column if not exists msg_estilo integer default 3;
