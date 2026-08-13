-- Prospecta — schema MULTI-TENANT (Postgres/Supabase).
-- Regra de ouro: TODA tabela de dados tem conta_id e TODA query filtra por ele.
-- Rodar no SQL Editor do Supabase (idempotente).

-- ============ CONTAS (o tenant) ============
CREATE TABLE IF NOT EXISTS contas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text,
  email          text NOT NULL UNIQUE,
  senha_hash     text NOT NULL,            -- PBKDF2 (salt embutido)
  papel          text NOT NULL DEFAULT 'cliente', -- cliente | admin | interna(Matheus/Valentino)
  plano          text NOT NULL DEFAULT 'trial',   -- trial | ativo | inadimplente | cancelado
  whatsapps_limite int NOT NULL DEFAULT 1,   -- quantos WhatsApp o plano permite
  anthropic_key  text,                       -- token do cliente (criptografado na app)
  trial_ate      timestamptz,                -- fim do trial (criado_em + 14d)
  -- Stripe
  stripe_customer_id text,
  stripe_subscription_id text,
  assinatura_status text,                    -- active | past_due | canceled ...
  -- controle
  sessao_versao  int DEFAULT 1,              -- incrementar derruba sessoes ativas
  ativo          int DEFAULT 1,
  criado_em      timestamptz DEFAULT now()
);

-- ============ INSTANCIAS WhatsApp (multi-WhatsApp por conta) ============
CREATE TABLE IF NOT EXISTS instancias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id      uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  nome          text,                        -- rotulo ("Comercial", "Chip 2")
  uazapi_token  text,
  numero        text,
  status        text DEFAULT 'desconectado', -- conectado | desconectado
  disparos_hoje int DEFAULT 0,               -- pra rotacao/teto por numero
  ordem         int DEFAULT 0,               -- round-robin
  criado_em     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instancias_conta ON instancias(conta_id);

-- ============ CEREBRO (config da IA por conta) ============
-- chave-valor por conta: treino_geral, treino_pitch, treino_objecoes, treino_exemplo,
-- audio_oficial, link_apresentacao, slots, produto_*, etc.
CREATE TABLE IF NOT EXISTS config (
  conta_id  uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  chave     text NOT NULL,
  valor     text,
  PRIMARY KEY (conta_id, chave)
);

-- ============ LEADS ============
CREATE TABLE IF NOT EXISTS leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id      uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  nome_empresa  text NOT NULL,
  telefone      text NOT NULL,               -- E.164 sem +
  cidade        text,
  nicho         text,
  site          text,
  origem_lista  text,
  status        text NOT NULL DEFAULT 'novo', -- novo|disparado|respondeu|em_conversa|decisor|negociando|reuniao_marcada|compareceu|cliente|perdido|descartado|optout|sem_whatsapp
  nome_contato  text,
  eh_responsavel int DEFAULT 0,
  telefone_decisor text,
  audio_enviado int DEFAULT 0,
  dor           text,
  info_extra    text,                         -- campos livres qualificacao
  motivo_perda  text,
  ia_pausada    int DEFAULT 0,
  followup_em   timestamptz,
  followup_msg  text,
  criado_em     timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE (conta_id, telefone)                 -- dedup POR conta
);
CREATE INDEX IF NOT EXISTS idx_leads_conta ON leads(conta_id, status);

-- ============ CAMPANHAS ============
CREATE TABLE IF NOT EXISTS campanhas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id      uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  status        text NOT NULL DEFAULT 'pausada', -- ativa|pausada|encerrada
  teto_dia      int DEFAULT 25,
  cadencia_min_seg int DEFAULT 180,
  cadencia_max_seg int DEFAULT 420,
  janela_inicio text DEFAULT '08:30',
  janela_fim    text DEFAULT '18:00',
  dias_semana   text DEFAULT '1,2,3,4,5',
  proximo_disparo_em timestamptz,             -- gate de cadencia (era config global, vira por campanha)
  criado_em     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campanhas_conta ON campanhas(conta_id, status);

CREATE TABLE IF NOT EXISTS templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id     uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  campanha_id  uuid NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  tipo         text NOT NULL DEFAULT 'abertura', -- abertura|followup1|followup2
  texto        text NOT NULL
);

CREATE TABLE IF NOT EXISTS campanha_leads (
  campanha_id  uuid NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  lead_id      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  disparado_em timestamptz,
  followup1_em timestamptz,
  followup2_em timestamptz,
  PRIMARY KEY (campanha_id, lead_id)
);

-- ============ MENSAGENS ============
CREATE TABLE IF NOT EXISTS mensagens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id   uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  lead_id    uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  role       text NOT NULL,                    -- user|assistant|sistema
  texto      text,
  tipo       text DEFAULT 'texto',
  criado_em  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensagens_lead ON mensagens(lead_id, criado_em);

-- ============ REUNIOES ============
CREATE TABLE IF NOT EXISTS reunioes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id     uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  lead_id      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  inicio       timestamptz NOT NULL,
  meet_url     text,
  gcal_event_id text,
  status       text NOT NULL DEFAULT 'marcada',
  lembrete_d1  int DEFAULT 0,
  lembrete_1h  int DEFAULT 0,
  criado_em    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reunioes_conta ON reunioes(conta_id, status);

-- ============ BLOCKLIST (por conta) ============
CREATE TABLE IF NOT EXISTS blocklist (
  conta_id  uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  telefone  text NOT NULL,
  motivo    text,
  criado_em timestamptz DEFAULT now(),
  PRIMARY KEY (conta_id, telefone)
);

-- ============ EVENTOS (log/metricas por conta) ============
CREATE TABLE IF NOT EXISTS eventos (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id  uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  lead_id   uuid,
  tipo      text NOT NULL,
  detalhe   text,
  criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_conta ON eventos(conta_id, tipo, criado_em);

-- ============ DEDUP WEBHOOK ============
CREATE TABLE IF NOT EXISTS webhook_eventos (
  message_id text PRIMARY KEY,
  criado_em  timestamptz DEFAULT now()
);

-- ============ SESSOES DE LOGIN ============
-- (opcional; se usar cookie assinado nao precisa. Mantido pra revogacao simples.)
