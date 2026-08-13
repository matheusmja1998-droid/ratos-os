-- Schema IA Clinicas — multi-tenant
-- SQLite hoje; migra pra Postgres/Supabase trocando os tipos (TEXT->timestamptz etc)

-- Uma clinica = um tenant
CREATE TABLE IF NOT EXISTS clinicas (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  endereco      TEXT,
  convenios     TEXT,            -- texto livre: "Unimed, Bradesco, particular"
  precos        TEXT,            -- texto livre: "Consulta R$300, retorno gratis 15d"
  faq           TEXT,            -- perguntas frequentes / conhecimento da clinica
  tom_de_voz    TEXT,            -- "informal e acolhedor", "formal", etc
  link_review   TEXT,            -- link do Google Reviews
  timezone      TEXT DEFAULT 'America/Sao_Paulo',
  ativo         INTEGER DEFAULT 1,
  telefone_dono TEXT,             -- WhatsApp do dono (recebe o relatorio automatico)
  recall_meses  INTEGER DEFAULT 0, -- recall de retorno: chama paciente apos N meses (0 = desligado)
  trial_aviso_enviado INTEGER DEFAULT 0, -- 1 quando o alerta de fim de trial ja foi mandado
  oferta_horarios TEXT DEFAULT 'curta', -- 'curta' (dia+3 horarios) | 'completa' (lista tudo)
  msg_estilo    INTEGER DEFAULT 3,   -- tamanho das mensagens da IA (1=curtissima..5=detalhada)
  nome_ia       TEXT,                -- nome da atendente virtual ("me chamo <nome>")
  guia_exame_url      TEXT,          -- URL da guia de exame padrao (enviada automatica)
  guia_exame_convenio TEXT,          -- convenio que dispara o envio (ex: Uniodonto)
  feegow_token    TEXT,             -- x-access-token da API Feegow (integracao de agenda)
  feegow_local_id TEXT,             -- unidade padrao no Feegow
  feegow_motivo_id TEXT,            -- motivo padrao de cancelamento/remarcacao no Feegow
  clinicorp_api_user      TEXT,     -- Clinicorp: Username (Basic) = usuario API
  clinicorp_token         TEXT,     -- Clinicorp: Token API (Basic password)
  clinicorp_subscriber_id TEXT,     -- Clinicorp: subscriber_id (assinatura/clinica)
  clinicorp_business_id   TEXT,     -- Clinicorp: businessId (unidade), opcional
  klingo_app_token        TEXT,     -- Klingo: X-APP-TOKEN (unica credencial)
  klingo_cnes             TEXT,     -- Klingo: CNES da unidade (filtro opcional)
  klingo_especialidade    TEXT,     -- Klingo: CBOS padrao pra /agenda/horarios (opcional)
  klingo_plano            TEXT,     -- Klingo: id do plano padrao na marcacao (opcional)
  trial_inicio            TEXT,     -- quando o trial de 14 dias comecou (Iniciar trial no admin)
  criado_em     TEXT DEFAULT (datetime('now')),
  -- Cobranca (Stripe assinatura mensal recorrente em BRL)
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  assinatura_status       TEXT DEFAULT 'trial',   -- trial|ativa|inadimplente|cancelada
  plano_valor_centavos    INTEGER DEFAULT 50000,  -- R$500,00 padrao
  -- Dados fiscais (pra emissao de NF no futuro — ainda nao emite nada)
  cnpj            TEXT,
  razao_social    TEXT,
  endereco_fiscal TEXT
);

-- Migracao idempotente pra bancos SQLite que ja existem (o CREATE acima e
-- ignorado se a tabela ja existe, entao garantimos as colunas novas aqui).
-- (Executado pelo driver; erros de "duplicate column" sao ignorados no boot.)

-- Contas de acesso ao painel. papel = 'admin' (ve tudo) | 'clinica' (ve so a dela).
-- Conta de clinica tem clinica_id preenchido; admin tem clinica_id NULL.
CREATE TABLE IF NOT EXISTS contas (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  senha_hash    TEXT NOT NULL,     -- PBKDF2 (salt embutido)
  papel         TEXT NOT NULL DEFAULT 'clinica',
  clinica_id    TEXT REFERENCES clinicas(id),
  nome          TEXT,
  ativo         INTEGER DEFAULT 1,
  sessao_versao INTEGER DEFAULT 1, -- muda pra derrubar todas as sessoes ativas (logout forcado)
  criado_em     TEXT DEFAULT (datetime('now'))
);

-- Tentativas de login (rate limit por email, janela deslizante simples)
CREATE TABLE IF NOT EXISTS login_tentativas (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  sucesso     INTEGER DEFAULT 0,
  criado_em   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_tentativas_email ON login_tentativas(email, criado_em);

-- Cada numero de WhatsApp = uma instancia uazapi
CREATE TABLE IF NOT EXISTS instancias (
  id              TEXT PRIMARY KEY,
  clinica_id      TEXT NOT NULL REFERENCES clinicas(id),
  nome            TEXT,               -- "Recepcao", "Dr. Fabio"
  numero          TEXT,               -- numero do whats (E.164)
  uazapi_instance TEXT,               -- id/nome da instancia na uazapi
  uazapi_token    TEXT,               -- token da instancia
  status          TEXT DEFAULT 'desconectado', -- desconectado|conectado
  funcao          TEXT DEFAULT 'atendimento',  -- atendimento | financeiro
  criado_em       TEXT DEFAULT (datetime('now'))
);

-- Profissionais atendem em uma clinica
CREATE TABLE IF NOT EXISTS profissionais (
  id             TEXT PRIMARY KEY,
  clinica_id     TEXT NOT NULL REFERENCES clinicas(id),
  nome           TEXT NOT NULL,
  especialidade  TEXT,
  duracao_min    INTEGER DEFAULT 30,  -- duracao padrao da consulta
  convenios      TEXT,                -- convenios que ESSE profissional atende (texto livre)
  info           TEXT,                -- infos extras pro prompt: o que atende, restricoes, bio
  feegow_professional_id  TEXT,       -- id do profissional correspondente no Feegow
  feegow_especialidade_id TEXT,       -- especialidade usada ao criar agendamento no Feegow
  feegow_procedimento_id  TEXT,       -- procedimento padrao (ex: Consulta) no Feegow
  clinicorp_professional_id TEXT,     -- id do dentista correspondente no Clinicorp
  klingo_professional_id  TEXT,     -- id do profissional correspondente no Klingo
  klingo_crm              TEXT,     -- numero do conselho (CRM) no Klingo — filtro de agenda
  gcal_id        TEXT,                -- calendar id do Google (default 'primary')
  ativo          INTEGER DEFAULT 1,
  criado_em      TEXT DEFAULT (datetime('now')),
  -- OAuth Google por medico (cada um vincula a propria agenda)
  gcal_refresh_token TEXT,            -- refresh token do Google desse medico
  gcal_conectado     INTEGER DEFAULT 0,  -- 1 quando o medico vinculou o Google
  gcal_email         TEXT             -- email da conta Google vinculada
);

-- Horarios de atendimento por profissional (grade semanal)
CREATE TABLE IF NOT EXISTS horarios (
  id              TEXT PRIMARY KEY,
  profissional_id TEXT NOT NULL REFERENCES profissionais(id),
  dia_semana      INTEGER NOT NULL,   -- 0=domingo ... 6=sabado
  hora_inicio     TEXT NOT NULL,      -- "08:00"
  hora_fim        TEXT NOT NULL       -- "12:00"
);

-- Pacientes (por clinica)
CREATE TABLE IF NOT EXISTS pacientes (
  id          TEXT PRIMARY KEY,
  clinica_id  TEXT NOT NULL REFERENCES clinicas(id),
  nome        TEXT,
  telefone    TEXT NOT NULL,          -- E.164, chave de conversa
  ia_pausada  INTEGER DEFAULT 0,      -- 1 quando o atendente humano assumiu (IA calada)
  resumo      TEXT,                   -- resumo da conversa gerado pela IA (cache)
  resumo_atualizado_em TEXT,          -- quando o resumo foi gerado (staleness check)
  ultima_midia_url TEXT,              -- URL da ultima imagem/PDF enviada (guia de exame)
  ultima_midia_em  TEXT,              -- quando chegou (a guia so vale se for recente)
  crm_etapa   TEXT,                   -- etapa no Kanban (novo|atendimento|agendado|cliente|perdido)
  crm_tipo    TEXT,                   -- 'lead' | 'cliente' (pra segmentar disparo futuro)
  crm_notas   TEXT,                   -- anotacoes do card
  crm_tags    TEXT,                   -- etiquetas separadas por virgula
  crm_atualizado_em TEXT,             -- ultima mudanca de etapa (mede lead parado)
  wa_nome     TEXT,                   -- nome publicado no WhatsApp (pushName)
  wa_foto_url TEXT,                   -- foto de perfil (cache da uazapi)
  wa_contato_em TEXT,                 -- quando buscamos o contato (evita rebuscar)
  importante  INTEGER DEFAULT 0,      -- conversa marcada com estrela
  lido_ate    TEXT,                   -- ate quando a recepcao leu (nao lida = msg mais nova)
  criado_em   TEXT DEFAULT (datetime('now'))
);
-- um telefone = um paciente por clinica (evita cadastro duplicado em corrida)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_paciente_clinica_telefone ON pacientes(clinica_id, telefone);

-- Consultas
CREATE TABLE IF NOT EXISTS consultas (
  id              TEXT PRIMARY KEY,
  clinica_id      TEXT NOT NULL REFERENCES clinicas(id),
  profissional_id TEXT NOT NULL REFERENCES profissionais(id),
  paciente_id     TEXT NOT NULL REFERENCES pacientes(id),
  inicio          TEXT NOT NULL,      -- ISO datetime
  fim             TEXT NOT NULL,      -- ISO datetime
  status          TEXT DEFAULT 'agendada', -- agendada|confirmada|cancelada|realizada|faltou
  origem          TEXT DEFAULT 'ia',  -- ia|manual
  pagamento       TEXT,               -- 'particular' | 'convenio' (capturado pela IA)
  convenio_nome   TEXT,               -- nome do convenio quando pagamento='convenio'
  gcal_event_id   TEXT,               -- id do evento no Google Calendar do medico (p/ sync de cancelar/remarcar)
  guia_url        TEXT,               -- URL da guia do exame enviada pelo paciente (anexo no card)
  feegow_agendamento_id TEXT,         -- id do agendamento espelhado no Feegow (sync)
  klingo_voucher_id     TEXT,         -- id do voucher espelhado no Klingo (sync)
  confirmacao_enviada INTEGER DEFAULT 0,
  review_enviado      INTEGER DEFAULT 0,
  recall_enviado      INTEGER DEFAULT 0, -- 1 quando o convite de retorno (recall) ja foi mandado
  observacao      TEXT,
  criado_em       TEXT DEFAULT (datetime('now'))
);

-- Historico de conversa (memoria da IA por paciente/instancia)
CREATE TABLE IF NOT EXISTS mensagens (
  id           TEXT PRIMARY KEY,
  clinica_id   TEXT NOT NULL REFERENCES clinicas(id),
  instancia_id TEXT REFERENCES instancias(id),
  telefone     TEXT NOT NULL,
  role         TEXT NOT NULL,         -- user|assistant
  conteudo     TEXT NOT NULL,
  origem       TEXT,                  -- 'humano' = atendente digitou; vazio = IA
  criado_em    TEXT DEFAULT (datetime('now'))
);

-- Eventos de webhook ja processados (dedup). A uazapi reenvia se nao receber
-- 200 a tempo (nosso processamento leva 5-20s); sem isso, reenvio = mensagem
-- e resposta duplicada, e ate consulta marcada 2x. message_id vem do payload
-- (chave da mensagem no WhatsApp); UNIQUE trava o reprocessamento na origem.
CREATE TABLE IF NOT EXISTS webhook_eventos (
  message_id  TEXT PRIMARY KEY,
  criado_em   TEXT DEFAULT (datetime('now'))
);

-- Lock por conversa: 2 mensagens do MESMO paciente quase juntas rodavam 2
-- respostas da IA em paralelo (nenhuma via a outra; podiam ate marcar 2
-- consultas). Uma linha por clinica+telefone; o PRIMARY KEY trava a segunda
-- tentativa. travado_em serve de TTL: lock com mais de 60s e considerado
-- morto (funcao caiu no meio) e pode ser tomado.
CREATE TABLE IF NOT EXISTS conversa_lock (
  clinica_id  TEXT NOT NULL,
  telefone    TEXT NOT NULL,
  travado_em  TEXT NOT NULL,
  PRIMARY KEY (clinica_id, telefone)
);

-- Lock por telefone: impede que 2 mensagens do MESMO paciente cheguem quase
-- juntas e rodem 2 respostas da IA em paralelo (cada uma sem ver a outra —
-- podiam marcar 2 consultas ou responder fora de ordem). Uma linha por
-- telefone+clinica, UNIQUE trava a segunda tentativa de adquirir.
CREATE TABLE IF NOT EXISTS conversa_lock (
  clinica_id  TEXT NOT NULL,
  telefone    TEXT NOT NULL,
  travado_em  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (clinica_id, telefone)
);

-- Bloqueios manuais na agenda (ferias, almoco, encaixe do medico via gcal)
CREATE TABLE IF NOT EXISTS bloqueios (
  id              TEXT PRIMARY KEY,
  profissional_id TEXT NOT NULL REFERENCES profissionais(id),
  inicio          TEXT NOT NULL,
  fim             TEXT NOT NULL,
  motivo          TEXT
);

-- Lista de espera / encaixe: paciente sem horario entra na fila; quando abre
-- vaga (cancelamento), o primeiro da fila e avisado no WhatsApp.
CREATE TABLE IF NOT EXISTS lista_espera (
  id              TEXT PRIMARY KEY,
  clinica_id      TEXT NOT NULL REFERENCES clinicas(id),
  profissional_id TEXT REFERENCES profissionais(id),  -- null = qualquer profissional
  telefone        TEXT NOT NULL,
  nome            TEXT,
  avisado         INTEGER DEFAULT 0,  -- 1 depois que recebeu o aviso de vaga
  criado_em       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lista_espera_fila ON lista_espera(clinica_id, avisado, criado_em);

-- Relatorios automaticos ja enviados (dedup por chave, ex "semanal-2026-W28"
-- ou "trial-d7") — o cron pode rodar mais de 1x sem mandar relatorio repetido.
CREATE TABLE IF NOT EXISTS relatorios_enviados (
  clinica_id  TEXT NOT NULL,
  chave       TEXT NOT NULL,
  criado_em   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (clinica_id, chave)
);

-- Materiais da clinica (PDFs/textos que viram CONHECIMENTO da IA). O arquivo e
-- convertido pra TEXTO no upload (via IA) e so o texto fica aqui — o prompt da
-- clinica inclui esses conteudos.
CREATE TABLE IF NOT EXISTS materiais (
  id          TEXT PRIMARY KEY,
  clinica_id  TEXT NOT NULL REFERENCES clinicas(id),
  nome        TEXT NOT NULL,       -- nome do arquivo/material
  conteudo    TEXT NOT NULL,       -- texto extraido (cap aplicado no prompt)
  criado_em   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_materiais_clinica ON materiais(clinica_id);

-- Log de atividades (auditoria legivel pra recepcao/dono): toda movimentacao
-- relevante — atendimento iniciado, consulta marcada/alterada/cancelada,
-- atendente assumiu, presenca confirmada, reguas enviadas. Aparece na area
-- "Log" das Configuracoes.
CREATE TABLE IF NOT EXISTS atividade_log (
  id          TEXT PRIMARY KEY,
  clinica_id  TEXT NOT NULL REFERENCES clinicas(id),
  tipo        TEXT NOT NULL,      -- atendimento|consulta|conversa|regua|sistema
  descricao   TEXT NOT NULL,      -- frase pronta pra exibir
  criado_em   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_atividade_log_clinica ON atividade_log(clinica_id, criado_em);

-- Historico de transicoes de assinatura (trial->ativa, ativa->inadimplente...).
-- Alimentado automaticamente por atualizarAssinaturaClinica. E a base das
-- metricas de negocio do admin: conversao de trial, inadimplencia, churn.
CREATE TABLE IF NOT EXISTS assinatura_eventos (
  id          TEXT PRIMARY KEY,
  clinica_id  TEXT NOT NULL REFERENCES clinicas(id),
  de_status   TEXT,               -- status anterior (null no primeiro registro)
  para_status TEXT NOT NULL,      -- status novo
  criado_em   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assinatura_eventos_clinica ON assinatura_eventos(clinica_id, criado_em);

-- Lock simples pra impedir que o cron das reguas rode 2x ao mesmo tempo
-- (cron da Vercel + chamada manual, ou retry). Uma linha so; trava via
-- UPDATE condicional (linha 1) antes de rodar e libera no fim.
CREATE TABLE IF NOT EXISTS reguas_lock (
  id           INTEGER PRIMARY KEY,
  rodando      INTEGER DEFAULT 0,
  iniciado_em  TEXT
);
INSERT OR IGNORE INTO reguas_lock (id, rodando) VALUES (1, 0);

CREATE INDEX IF NOT EXISTS idx_consultas_clinica ON consultas(clinica_id, inicio);
CREATE INDEX IF NOT EXISTS idx_consultas_prof ON consultas(profissional_id, inicio);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(clinica_id, telefone, criado_em);
CREATE INDEX IF NOT EXISTS idx_instancias_numero ON instancias(numero);

-- Anti-overbooking: um profissional nao pode ter duas consultas nao-canceladas
-- no mesmo inicio. (Slots sao grade fixa por profissional, entao inicio igual = colisao.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_consulta_prof_inicio
  ON consultas(profissional_id, inicio)
  WHERE status <> 'cancelada';

-- Duvidas pro especialista (IA nao sabe -> secretaria responde -> vira aprendizado)
CREATE TABLE IF NOT EXISTS duvidas (
  id                TEXT PRIMARY KEY,
  clinica_id        TEXT NOT NULL,
  telefone          TEXT NOT NULL,
  pergunta_paciente TEXT NOT NULL,
  pergunta_ia       TEXT NOT NULL,
  resposta          TEXT,
  modo_resposta     TEXT,
  status            TEXT DEFAULT 'pendente',
  criado_em         TEXT DEFAULT (datetime('now')),
  respondida_em     TEXT
);
CREATE INDEX IF NOT EXISTS idx_duvidas_pendentes ON duvidas(clinica_id, status, criado_em);
