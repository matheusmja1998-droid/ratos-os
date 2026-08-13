-- Migration 003 — Cobranca (Stripe) e base fiscal (Postgres/Supabase)
-- Roda no SQL Editor do Supabase. Nao destrutivo: so adiciona colunas.

-- Cobranca: assinatura mensal recorrente em BRL (Matheus cobra a clinica)
alter table clinicas add column if not exists stripe_customer_id     text;
alter table clinicas add column if not exists stripe_subscription_id text;
alter table clinicas add column if not exists assinatura_status      text default 'trial';   -- trial|ativa|inadimplente|cancelada
alter table clinicas add column if not exists plano_valor_centavos   integer default 50000;  -- R$500,00

-- Base fiscal (pra emissao de NF no futuro — ainda NAO emite nada)
alter table clinicas add column if not exists cnpj            text;
alter table clinicas add column if not exists razao_social    text;
alter table clinicas add column if not exists endereco_fiscal text;
