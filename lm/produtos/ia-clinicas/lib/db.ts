// Camada de dados — dois drivers: SQLite (local/dev) e Supabase (producao).
// Escolhe pelo env DB_DRIVER ("sqlite" | "supabase"). Padrao: sqlite.
//
// Todas as funcoes sao async (o Supabase exige). O SQLite roda sincrono por
// baixo mas expomos a mesma interface async, entao o resto do app nao muda
// quando tu troca o driver.

import { randomUUID } from "crypto";

const DRIVER = (process.env.DB_DRIVER || "sqlite").toLowerCase();
const IS_PG = DRIVER === "supabase";
export const uid = () => randomUUID();

// bool no formato que cada banco entende (Postgres = boolean; SQLite = 0/1)
export const B = (v: boolean) => (IS_PG ? v : v ? 1 : 0);
export const isTrue = (v: any) => v === true || v === 1;

// Data de hoje "YYYY-MM-DD" no fuso de SP (pra agregar uso de tokens por dia).
// en-CA formata como YYYY-MM-DD; timezone fixo evita depender do fuso do server.
function hojeSPData(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Erro tipado pra colisao de agendamento (unique index anti-overbooking).
export class ConflitoAgendamento extends Error {
  constructor() {
    super("horario indisponivel (ja ocupado)");
    this.name = "ConflitoAgendamento";
  }
}
function ehConflitoUnico(e: any): boolean {
  const msg = String(e?.message || e || "").toLowerCase();
  // Postgres: 23505 unique_violation | SQLite: UNIQUE constraint failed
  return (
    e?.code === "23505" ||
    msg.includes("unique constraint") ||
    msg.includes("duplicate key") ||
    msg.includes("23505")
  );
}

// Filtros ricos pra empurrar o trabalho pro banco (evita puxar tabela inteira).
type Filtro = {
  eq?: Record<string, any>;
  gte?: Record<string, any>;
  lte?: Record<string, any>;
  lt?: Record<string, any>;
  gt?: Record<string, any>;
  inList?: Record<string, any[]>;
  neq?: Record<string, any>;
  order?: string; // "coluna" ou "coluna desc" ou "a, b"
  limit?: number;
  offset?: number;
};

// ------------------------------------------------------------------
// Driver: interface comum. Cada backend implementa estes metodos crus.
// ------------------------------------------------------------------
interface Driver {
  insert(tabela: string, dados: any): Promise<any>;
  update(tabela: string, id: string, dados: any): Promise<any>;
  upsert(tabela: string, dados: any): Promise<any>;
  selectOne(tabela: string, where: Record<string, any>): Promise<any | null>;
  selectMany(tabela: string, where?: Record<string, any>, orderBy?: string): Promise<any[]>;
  query(tabela: string, f: Filtro): Promise<any[]>;
  raw: any;
}

// ---------------- Driver SQLite ----------------
function criarDriverSqlite(): Driver {
  // guard: SQLite e SO pra dev local. Em producao usamos Supabase.
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      "DB_DRIVER=sqlite em producao nao e suportado. Configure DB_DRIVER=supabase."
    );
  }
  // import dinamico pra nao quebrar no build serverless quando driver=supabase
  const Database = require("better-sqlite3");
  const { readFileSync } = require("fs");
  const { join } = require("path");

  const DB_PATH = process.env.DB_PATH || join(process.cwd(), "db", "clinicas.db");
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf-8");
  db.exec(schema);

  // Migracao idempotente: adiciona colunas novas em bancos SQLite ja existentes
  // (o CREATE TABLE IF NOT EXISTS nao altera tabela que ja existe). Erro de
  // "duplicate column" e ignorado — significa que a coluna ja esta la.
  const colunasNovas = [
    "ALTER TABLE clinicas ADD COLUMN stripe_customer_id TEXT",
    "ALTER TABLE clinicas ADD COLUMN stripe_subscription_id TEXT",
    "ALTER TABLE clinicas ADD COLUMN assinatura_status TEXT DEFAULT 'trial'",
    "ALTER TABLE clinicas ADD COLUMN plano_valor_centavos INTEGER DEFAULT 50000",
    "ALTER TABLE clinicas ADD COLUMN cnpj TEXT",
    "ALTER TABLE clinicas ADD COLUMN razao_social TEXT",
    "ALTER TABLE clinicas ADD COLUMN endereco_fiscal TEXT",
    // OAuth Google por medico
    "ALTER TABLE profissionais ADD COLUMN gcal_refresh_token TEXT",
    "ALTER TABLE profissionais ADD COLUMN gcal_conectado INTEGER DEFAULT 0",
    "ALTER TABLE profissionais ADD COLUMN gcal_email TEXT",
    // atendimento humano (comando "stop" pausa a IA pro paciente)
    "ALTER TABLE pacientes ADD COLUMN ia_pausada INTEGER DEFAULT 0",
    // forma de pagamento da consulta (convenio/particular)
    "ALTER TABLE consultas ADD COLUMN pagamento TEXT",
    "ALTER TABLE consultas ADD COLUMN convenio_nome TEXT",
    // revogacao de sessao (logout forcado ao incrementar)
    "ALTER TABLE contas ADD COLUMN sessao_versao INTEGER DEFAULT 1",
    // id do evento no Google Calendar do medico (sync de cancelar/remarcar)
    "ALTER TABLE consultas ADD COLUMN gcal_event_id TEXT",
    // relatorio automatico + recall + regua de trial
    "ALTER TABLE clinicas ADD COLUMN telefone_dono TEXT",
    "ALTER TABLE clinicas ADD COLUMN recall_meses INTEGER DEFAULT 0",
    "ALTER TABLE clinicas ADD COLUMN trial_aviso_enviado INTEGER DEFAULT 0",
    "ALTER TABLE consultas ADD COLUMN recall_enviado INTEGER DEFAULT 0",
    // resumo da conversa (cache pro card da secretaria)
    "ALTER TABLE pacientes ADD COLUMN resumo TEXT",
    "ALTER TABLE pacientes ADD COLUMN resumo_atualizado_em TEXT",
    // convenios e infos POR profissional + oferta de horarios + guia de exame
    "ALTER TABLE profissionais ADD COLUMN convenios TEXT",
    "ALTER TABLE profissionais ADD COLUMN info TEXT",
    "ALTER TABLE clinicas ADD COLUMN oferta_horarios TEXT DEFAULT 'curta'",
    "ALTER TABLE consultas ADD COLUMN guia_url TEXT",
    // estilo/tamanho das mensagens da IA (slider 1..5 nas Configuracoes)
    "ALTER TABLE clinicas ADD COLUMN msg_estilo INTEGER DEFAULT 3",
    // nome da atendente virtual + observacoes da secretaria
    "ALTER TABLE clinicas ADD COLUMN nome_ia TEXT",
    "ALTER TABLE pacientes ADD COLUMN observacoes TEXT",
    // funcao de cada numero de WhatsApp (atendimento | financeiro)
    "ALTER TABLE instancias ADD COLUMN funcao TEXT DEFAULT 'atendimento'",
    // guia de exame automatica por convenio
    "ALTER TABLE clinicas ADD COLUMN guia_exame_url TEXT",
    "ALTER TABLE clinicas ADD COLUMN guia_exame_convenio TEXT",
    "ALTER TABLE pacientes ADD COLUMN ultima_midia_url TEXT",
    "ALTER TABLE pacientes ADD COLUMN ultima_midia_em TEXT",
    // Integracao Feegow (agenda principal do cliente): token por clinica,
    // mapeamento por profissional e id do agendamento espelhado por consulta
    "ALTER TABLE clinicas ADD COLUMN feegow_token TEXT",
    "ALTER TABLE clinicas ADD COLUMN feegow_local_id TEXT",
    "ALTER TABLE clinicas ADD COLUMN feegow_motivo_id TEXT",
    // rotulo amigavel da unidade (ex: "Unidade BH") — so cosmetico, mostra na
    // agenda de exames. O filtro real e o feegow_local_id.
    "ALTER TABLE clinicas ADD COLUMN feegow_unidade_nome TEXT",
    "ALTER TABLE profissionais ADD COLUMN feegow_professional_id TEXT",
    "ALTER TABLE profissionais ADD COLUMN feegow_especialidade_id TEXT",
    "ALTER TABLE profissionais ADD COLUMN feegow_procedimento_id TEXT",
    "ALTER TABLE consultas ADD COLUMN feegow_agendamento_id TEXT",
    // CRM (Kanban): etapa do funil, se ja e cliente, notas e etiquetas do card
    "ALTER TABLE pacientes ADD COLUMN crm_etapa TEXT",
    "ALTER TABLE pacientes ADD COLUMN crm_tipo TEXT",
    "ALTER TABLE pacientes ADD COLUMN crm_notas TEXT",
    "ALTER TABLE pacientes ADD COLUMN crm_tags TEXT",
    "ALTER TABLE pacientes ADD COLUMN crm_atualizado_em TEXT",
    // dados do contato no WhatsApp (nome publicado + foto), com cache local
    "ALTER TABLE pacientes ADD COLUMN wa_nome TEXT",
    "ALTER TABLE pacientes ADD COLUMN wa_foto_url TEXT",
    "ALTER TABLE pacientes ADD COLUMN wa_contato_em TEXT",
    // caixa de entrada: estrela (importante) e marcador de leitura
    "ALTER TABLE pacientes ADD COLUMN importante INTEGER DEFAULT 0",
    "ALTER TABLE pacientes ADD COLUMN lido_ate TEXT",
    "ALTER TABLE clinicas ADD COLUMN klingo_app_token TEXT",
    "ALTER TABLE clinicas ADD COLUMN klingo_cnes TEXT",
    "ALTER TABLE clinicas ADD COLUMN klingo_especialidade TEXT",
    "ALTER TABLE clinicas ADD COLUMN klingo_plano TEXT",
    "ALTER TABLE profissionais ADD COLUMN klingo_professional_id TEXT",
    "ALTER TABLE profissionais ADD COLUMN klingo_crm TEXT",
    "ALTER TABLE consultas ADD COLUMN klingo_voucher_id TEXT",
    "ALTER TABLE clinicas ADD COLUMN trial_inicio TEXT",
    "ALTER TABLE mensagens ADD COLUMN origem TEXT",
    "ALTER TABLE pacientes ADD COLUMN cpf TEXT",
    "ALTER TABLE pacientes ADD COLUMN nascimento TEXT",
  ];
  for (const sql of colunasNovas) {
    try {
      db.exec(sql);
    } catch {
      /* coluna ja existe — ok */
    }
  }

  // tabelas/indices novos que dependem de colunas ja migradas acima (idempotentes,
  // mas separados do CREATE TABLE inicial pra bancos que ja existiam antes deles)
  const objetosNovos = [
    `CREATE TABLE IF NOT EXISTS webhook_eventos (
       message_id  TEXT PRIMARY KEY,
       criado_em   TEXT DEFAULT (datetime('now'))
     )`,
    `CREATE TABLE IF NOT EXISTS login_tentativas (
       id          TEXT PRIMARY KEY,
       email       TEXT NOT NULL,
       sucesso     INTEGER DEFAULT 0,
       criado_em   TEXT DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_login_tentativas_email ON login_tentativas(email, criado_em)`,
    `CREATE TABLE IF NOT EXISTS reguas_lock (
       id           INTEGER PRIMARY KEY,
       rodando      INTEGER DEFAULT 0,
       iniciado_em  TEXT
     )`,
    `INSERT OR IGNORE INTO reguas_lock (id, rodando) VALUES (1, 0)`,
    `CREATE TABLE IF NOT EXISTS conversa_lock (
       clinica_id  TEXT NOT NULL,
       telefone    TEXT NOT NULL,
       travado_em  TEXT NOT NULL,
       PRIMARY KEY (clinica_id, telefone)
     )`,
    `CREATE TABLE IF NOT EXISTS assinatura_eventos (
       id          TEXT PRIMARY KEY,
       clinica_id  TEXT NOT NULL,
       de_status   TEXT,
       para_status TEXT NOT NULL,
       criado_em   TEXT DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_assinatura_eventos_clinica ON assinatura_eventos(clinica_id, criado_em)`,
    `CREATE TABLE IF NOT EXISTS lista_espera (
       id              TEXT PRIMARY KEY,
       clinica_id      TEXT NOT NULL,
       profissional_id TEXT,
       telefone        TEXT NOT NULL,
       nome            TEXT,
       avisado         INTEGER DEFAULT 0,
       criado_em       TEXT DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_lista_espera_fila ON lista_espera(clinica_id, avisado, criado_em)`,
    `CREATE TABLE IF NOT EXISTS relatorios_enviados (
       clinica_id  TEXT NOT NULL,
       chave       TEXT NOT NULL,
       criado_em   TEXT DEFAULT (datetime('now')),
       PRIMARY KEY (clinica_id, chave)
     )`,
    `CREATE TABLE IF NOT EXISTS atividade_log (
       id          TEXT PRIMARY KEY,
       clinica_id  TEXT NOT NULL,
       tipo        TEXT NOT NULL,
       descricao   TEXT NOT NULL,
       criado_em   TEXT DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_atividade_log_clinica ON atividade_log(clinica_id, criado_em)`,
    // SNAPSHOT dos dados da clinica antes de cada save — rede de seguranca pra
    // recuperar endereco/convenios/precos se forem apagados/sobrescritos. Guarda
    // o JSON dos campos editaveis, com data. Assim nunca mais se perde dado.
    `CREATE TABLE IF NOT EXISTS clinica_snapshots (
       id          TEXT PRIMARY KEY,
       clinica_id  TEXT NOT NULL,
       dados       TEXT NOT NULL,
       criado_em   TEXT DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_clinica_snapshots ON clinica_snapshots(clinica_id, criado_em)`,
    `CREATE TABLE IF NOT EXISTS materiais (
       id          TEXT PRIMARY KEY,
       clinica_id  TEXT NOT NULL,
       nome        TEXT NOT NULL,
       conteudo    TEXT NOT NULL,
       criado_em   TEXT DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_materiais_clinica ON materiais(clinica_id)`,
    // uso de tokens da IA, AGREGADO por clinica+dia (nao por chamada — assim a
    // tabela nao explode). Cada resposta da IA soma aqui. Custo calculado na
    // leitura a partir dos tokens (preco do modelo).
    `CREATE TABLE IF NOT EXISTS uso_tokens (
       clinica_id     TEXT NOT NULL,
       dia            TEXT NOT NULL,
       input_tokens   INTEGER DEFAULT 0,
       output_tokens  INTEGER DEFAULT 0,
       cache_write     INTEGER DEFAULT 0,
       cache_read     INTEGER DEFAULT 0,
       chamadas       INTEGER DEFAULT 0,
       PRIMARY KEY (clinica_id, dia)
     )`,
  ];
  for (const sql of objetosNovos) {
    try {
      db.exec(sql);
    } catch {
      /* ja existe — ok */
    }
  }
  // unique index de pacientes: pode falhar se ja existir duplicata na base local
  // (dev). Nao trava o boot — so loga, pra nao quebrar ambiente de dev existente.
  try {
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS uniq_paciente_clinica_telefone ON pacientes(clinica_id, telefone)"
    );
  } catch (e: any) {
    console.warn("[db] nao consegui criar uniq_paciente_clinica_telefone (duplicata local?):", e.message);
  }

  function whereClause(where: Record<string, any>) {
    const keys = Object.keys(where);
    const sql = keys.map((k) => `${k} = ?`).join(" AND ");
    const vals = keys.map((k) => where[k]);
    return { sql, vals };
  }

  const drv: Driver = {
    raw: db,
    async insert(tabela, dados) {
      const cols = Object.keys(dados);
      const placeholders = cols.map(() => "?").join(", ");
      try {
        db.prepare(
          `INSERT INTO ${tabela} (${cols.join(", ")}) VALUES (${placeholders})`
        ).run(...cols.map((c) => dados[c]));
      } catch (e: any) {
        if (ehConflitoUnico(e)) throw new ConflitoAgendamento();
        throw e;
      }
      return db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(dados.id);
    },
    async update(tabela, id, dados) {
      const cols = Object.keys(dados).filter((c) => c !== "id");
      const set = cols.map((c) => `${c} = ?`).join(", ");
      db.prepare(`UPDATE ${tabela} SET ${set} WHERE id = ?`).run(
        ...cols.map((c) => dados[c]),
        id
      );
      return db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
    },
    async upsert(tabela, dados) {
      const existe = dados.id
        ? db.prepare(`SELECT id FROM ${tabela} WHERE id = ?`).get(dados.id)
        : null;
      if (existe) return this.update(tabela, dados.id, dados);
      return this.insert(tabela, { ...dados, id: dados.id || uid() });
    },
    async selectOne(tabela, where) {
      const { sql, vals } = whereClause(where);
      return db.prepare(`SELECT * FROM ${tabela} WHERE ${sql} LIMIT 1`).get(...vals) || null;
    },
    async selectMany(tabela, where, orderBy) {
      let q = `SELECT * FROM ${tabela}`;
      let vals: any[] = [];
      if (where && Object.keys(where).length) {
        const w = whereClause(where);
        q += ` WHERE ${w.sql}`;
        vals = w.vals;
      }
      if (orderBy) q += ` ORDER BY ${orderBy}`;
      return db.prepare(q).all(...vals);
    },
    async query(tabela, f) {
      const clauses: string[] = [];
      const vals: any[] = [];
      const add = (obj: Record<string, any> | undefined, op: string) => {
        if (!obj) return;
        for (const k of Object.keys(obj)) {
          clauses.push(`${k} ${op} ?`);
          vals.push(obj[k]);
        }
      };
      add(f.eq, "=");
      add(f.neq, "!=");
      add(f.gte, ">=");
      add(f.lte, "<=");
      add(f.lt, "<");
      add(f.gt, ">");
      if (f.inList) {
        for (const k of Object.keys(f.inList)) {
          const arr = f.inList[k];
          if (arr.length === 0) {
            clauses.push("1 = 0");
          } else {
            clauses.push(`${k} IN (${arr.map(() => "?").join(",")})`);
            vals.push(...arr);
          }
        }
      }
      let q = `SELECT * FROM ${tabela}`;
      if (clauses.length) q += ` WHERE ${clauses.join(" AND ")}`;
      if (f.order) q += ` ORDER BY ${f.order}`;
      if (f.limit != null) q += ` LIMIT ${Number(f.limit)}`;
      if (f.offset != null) q += ` OFFSET ${Number(f.offset)}`;
      return db.prepare(q).all(...vals);
    },
  };
  return drv;
}

// ---------------- Driver Supabase ----------------
function criarDriverSupabase(): Driver {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key)
    throw new Error("DB_DRIVER=supabase mas falta SUPABASE_URL / SUPABASE_SERVICE_KEY no .env");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // NAO pode ser async: o query builder do Supabase e "thenable", entao dar
  // await nele executa a query e perde os metodos encadeaveis (.limit, .order).
  function applyWhere(query: any, where?: Record<string, any>) {
    if (where) for (const k of Object.keys(where)) query = query.eq(k, where[k]);
    return query;
  }
  function applyOrder(query: any, order?: string) {
    if (!order) return query;
    for (const parte of order.split(",")) {
      const [col, dir] = parte.trim().split(/\s+/);
      if (col) query = query.order(col, { ascending: (dir || "asc").toLowerCase() !== "desc" });
    }
    return query;
  }

  return {
    raw: sb,
    async insert(tabela, dados) {
      const { data, error } = await sb.from(tabela).insert(dados).select().single();
      if (error) {
        if (ehConflitoUnico(error)) throw new ConflitoAgendamento();
        throw new Error(`[supabase insert ${tabela}] ${error.message}`);
      }
      return data;
    },
    async update(tabela, id, dados) {
      const { id: _drop, ...resto } = dados;
      const { data, error } = await sb.from(tabela).update(resto).eq("id", id).select().single();
      if (error) throw new Error(`[supabase update ${tabela}] ${error.message}`);
      return data;
    },
    async upsert(tabela, dados) {
      const payload = dados.id ? dados : { ...dados, id: uid() };
      const { data, error } = await sb.from(tabela).upsert(payload).select().single();
      if (error) {
        if (ehConflitoUnico(error)) throw new ConflitoAgendamento();
        throw new Error(`[supabase upsert ${tabela}] ${error.message}`);
      }
      return data;
    },
    async selectOne(tabela, where) {
      let q = sb.from(tabela).select("*");
      q = applyWhere(q, where);
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw new Error(`[supabase selectOne ${tabela}] ${error.message}`);
      return data;
    },
    async selectMany(tabela, where, orderBy) {
      let q = sb.from(tabela).select("*");
      q = applyWhere(q, where);
      q = applyOrder(q, orderBy);
      const { data, error } = await q;
      if (error) throw new Error(`[supabase selectMany ${tabela}] ${error.message}`);
      return data || [];
    },
    async query(tabela, f) {
      let q = sb.from(tabela).select("*");
      if (f.eq) for (const k of Object.keys(f.eq)) q = q.eq(k, f.eq[k]);
      if (f.neq) for (const k of Object.keys(f.neq)) q = q.neq(k, f.neq[k]);
      if (f.gte) for (const k of Object.keys(f.gte)) q = q.gte(k, f.gte[k]);
      if (f.lte) for (const k of Object.keys(f.lte)) q = q.lte(k, f.lte[k]);
      if (f.lt) for (const k of Object.keys(f.lt)) q = q.lt(k, f.lt[k]);
      if (f.gt) for (const k of Object.keys(f.gt)) q = q.gt(k, f.gt[k]);
      if (f.inList) for (const k of Object.keys(f.inList)) q = q.in(k, f.inList[k]);
      q = applyOrder(q, f.order);
      if (f.limit != null) q = q.limit(f.limit);
      if (f.offset != null) q = q.range(f.offset, f.offset + (f.limit ?? 1000) - 1);
      const { data, error } = await q;
      if (error) throw new Error(`[supabase query ${tabela}] ${error.message}`);
      return data || [];
    },
  };
}

let _driver: Driver | null = null;
function driver(): Driver {
  if (_driver) return _driver;
  _driver = IS_PG ? criarDriverSupabase() : criarDriverSqlite();
  return _driver;
}

// mantido pra compatibilidade: alguns lugares usavam db().prepare(...) no SQLite.
// Preferir as funcoes de dominio abaixo. So funciona no driver sqlite.
export function db() {
  return driver().raw;
}

// ==================================================================
// Funcoes de dominio (a API que o resto do app usa). Todas async.
// ==================================================================

// ---------- Contas (acesso ao painel) ----------
export async function getContaPorEmail(email: string) {
  return driver().selectOne("contas", { email: email.toLowerCase().trim() });
}
export async function getContaPorId(id: string) {
  return driver().selectOne("contas", { id });
}
export async function listContas() {
  return driver().selectMany("contas", undefined, "criado_em");
}
export async function contaDaClinica(clinicaId: string) {
  return driver().selectOne("contas", { clinica_id: clinicaId });
}
export async function criarConta(c: {
  email: string;
  senha_hash: string;
  papel: "admin" | "clinica";
  clinica_id?: string | null;
  nome?: string;
}) {
  return driver().insert("contas", {
    id: uid(),
    email: c.email.toLowerCase().trim(),
    senha_hash: c.senha_hash,
    papel: c.papel,
    clinica_id: c.clinica_id ?? null,
    nome: c.nome ?? null,
    ativo: B(true),
  });
}
export async function atualizarSenhaConta(id: string, senha_hash: string) {
  return driver().update("contas", id, { senha_hash });
}
// troca o e-mail de acesso. Lanca erro amigavel se o e-mail ja estiver em uso
// (unique da tabela contas).
export async function atualizarEmailConta(id: string, email: string) {
  try {
    return await driver().update("contas", id, { email: email.toLowerCase().trim() });
  } catch (e: any) {
    if (ehConflitoUnico(e)) throw new Error("esse e-mail já está em uso por outra conta");
    throw e;
  }
}
// derruba todas as sessoes ativas dessa conta (o cookie assinado guarda a
// versao no payload; se nao bater com a atual do banco, a sessao e invalida).
// Usar ao desativar conta, trocar senha, ou suspeita de vazamento de cookie.
export async function revogarSessoesConta(id: string) {
  const conta = await getContaPorId(id);
  const versaoAtual = Number(conta?.sessao_versao ?? 1);
  return driver().update("contas", id, { sessao_versao: versaoAtual + 1 });
}

// ---------- Rate limit de login ----------
// janela deslizante simples: conta tentativas (sucesso ou nao) dos ultimos
// MINUTOS pra um email. Sem lib externa, sem Redis — tabela + count no banco,
// suficiente pro volume de login de um painel B2B.
const LOGIN_JANELA_MIN = 15;
const LOGIN_MAX_TENTATIVAS = 8;
export async function registrarTentativaLogin(email: string, sucesso: boolean) {
  return driver().insert("login_tentativas", {
    id: uid(),
    email: email.toLowerCase().trim(),
    sucesso: B(sucesso),
  });
}
export async function loginBloqueado(email: string): Promise<boolean> {
  const desde = new Date(Date.now() - LOGIN_JANELA_MIN * 60000);
  const desdeStr = IS_PG ? desde.toISOString() : desde.toISOString().slice(0, 19).replace("T", " ");
  const recentes = await driver().query("login_tentativas", {
    eq: { email: email.toLowerCase().trim() },
    gte: { criado_em: desdeStr },
  });
  const falhas = recentes.filter((t: any) => !isTrue(t.sucesso));
  return falhas.length >= LOGIN_MAX_TENTATIVAS;
}

// ---------- Clinicas ----------
export async function getClinica(id: string) {
  return driver().selectOne("clinicas", { id });
}
export async function listClinicas() {
  return driver().selectMany("clinicas", undefined, "nome");
}
export async function upsertClinica(c: any) {
  // NOTA: nao inclui campos de cobranca (stripe_*, assinatura_status) de
  // proposito — a tela de editar dados nao deve zerar a assinatura. Cobranca
  // se atualiza pelas funcoes dedicadas abaixo.
  // TODOS os campos sao gravados APENAS SE vierem no payload (`!== undefined`).
  // Antes, endereco/convenios/precos/faq usavam `?? null` e eram ZERADOS quando
  // um save parcial (ex: so recall_meses) nao os incluia — isso apagou os dados
  // da Pulmonar. Agora um save parcial nunca apaga o que nao foi enviado.
  // (id/nome sao obrigatorios no upsert.)
  const dados: any = { id: c.id };
  if (c.nome !== undefined) dados.nome = c.nome;
  if (c.endereco !== undefined) dados.endereco = c.endereco;
  if (c.convenios !== undefined) dados.convenios = c.convenios;
  if (c.precos !== undefined) dados.precos = c.precos;
  if (c.faq !== undefined) dados.faq = c.faq;
  if (c.tom_de_voz !== undefined) dados.tom_de_voz = c.tom_de_voz;
  if (c.link_review !== undefined) dados.link_review = c.link_review;
  if (c.timezone !== undefined) dados.timezone = c.timezone;
  if (c.ativo !== undefined) dados.ativo = c.ativo;
  if (c.cnpj !== undefined) dados.cnpj = c.cnpj;
  if (c.razao_social !== undefined) dados.razao_social = c.razao_social;
  if (c.endereco_fiscal !== undefined) dados.endereco_fiscal = c.endereco_fiscal;
  if (c.telefone_dono !== undefined) dados.telefone_dono = c.telefone_dono;
  if (c.recall_meses !== undefined) dados.recall_meses = Number(c.recall_meses) || 0;
  if (c.oferta_horarios !== undefined) dados.oferta_horarios = c.oferta_horarios;
  if (c.msg_estilo !== undefined) dados.msg_estilo = Math.min(5, Math.max(1, Number(c.msg_estilo) || 3));
  if (c.nome_ia !== undefined) dados.nome_ia = String(c.nome_ia || "").slice(0, 60) || null;
  if (c.guia_exame_url !== undefined) dados.guia_exame_url = String(c.guia_exame_url || "").slice(0, 500) || null;
  if (c.guia_exame_convenio !== undefined) dados.guia_exame_convenio = String(c.guia_exame_convenio || "").slice(0, 60) || null;
  // Clinicorp (integracao de agenda odontologica) — grava so o que vier
  if (c.clinicorp_api_user !== undefined) dados.clinicorp_api_user = c.clinicorp_api_user;
  if (c.clinicorp_token !== undefined) dados.clinicorp_token = c.clinicorp_token;
  if (c.clinicorp_subscriber_id !== undefined) dados.clinicorp_subscriber_id = c.clinicorp_subscriber_id;
  if (c.clinicorp_business_id !== undefined) dados.clinicorp_business_id = c.clinicorp_business_id;
  // Klingo (gestao de unidades de saude) — grava so o que vier
  if (c.klingo_app_token !== undefined) dados.klingo_app_token = c.klingo_app_token;
  if (c.klingo_cnes !== undefined) dados.klingo_cnes = c.klingo_cnes;
  if (c.klingo_especialidade !== undefined) dados.klingo_especialidade = c.klingo_especialidade;
  if (c.klingo_plano !== undefined) dados.klingo_plano = c.klingo_plano;
  // trial de 14 dias (botao Iniciar trial do admin). Sem essa linha o botao
  // salvava NADA em silencio — a whitelist e obrigatoria pra campo novo!
  if (c.trial_inicio !== undefined) dados.trial_inicio = c.trial_inicio;
  // SNAPSHOT de seguranca: guarda o estado ANTES de sobrescrever (best-effort,
  // nunca bloqueia o save). Permite recuperar dados se algo for apagado.
  await salvarSnapshotClinica(c.id).catch(() => {});
  // Save parcial SEM nome em registro que JA EXISTE vira UPDATE: o upsert do
  // Postgres monta a tupla de INSERT primeiro e valida o NOT NULL de "nome"
  // ANTES de resolver o conflito — em prod isso derrubava qualquer save
  // parcial (ex: conectar Clinicorp) com "null value in column nome".
  // No sqlite dev nao reproduzia, por isso passou batido.
  if (dados.nome === undefined) {
    const existente = await getClinica(c.id);
    if (existente) {
      const { id: _id, ...resto } = dados;
      if (Object.keys(resto).length === 0) return existente; // nada a mudar
      return driver().update("clinicas", c.id, resto);
    }
  }
  return driver().upsert("clinicas", dados);
}

// guarda um snapshot dos campos editaveis da clinica (antes de um save). Mantem
// os ultimos ~20 por clinica (limpa os antigos). Best-effort.
export async function salvarSnapshotClinica(clinicaId: string): Promise<void> {
  try {
    const atual = await getClinica(clinicaId);
    if (!atual) return;
    const campos = {
      nome: atual.nome, endereco: atual.endereco, convenios: atual.convenios,
      precos: atual.precos, faq: atual.faq, link_review: atual.link_review,
      tom_de_voz: atual.tom_de_voz, telefone_dono: atual.telefone_dono,
      recall_meses: atual.recall_meses, oferta_horarios: atual.oferta_horarios,
    };
    // so guarda se tiver algum dado (nao snapshota clinica vazia)
    if (!campos.endereco && !campos.convenios && !campos.precos && !campos.faq) return;
    await driver().insert("clinica_snapshots", {
      id: uid(),
      clinica_id: clinicaId,
      dados: JSON.stringify(campos),
    });
  } catch (e: any) {
    console.warn("[db] snapshot clinica falhou (ignorado):", e.message);
  }
}

// lista os snapshots de uma clinica (mais recente primeiro) pra recuperacao
export async function listarSnapshotsClinica(clinicaId: string): Promise<{ id: string; dados: any; criado_em: string }[]> {
  try {
    const raw = driver().raw;
    let linhas: any[] = [];
    if (IS_PG) {
      const r = await raw.from("clinica_snapshots").select("*").eq("clinica_id", clinicaId).order("criado_em", { ascending: false }).limit(20);
      linhas = r?.data || [];
    } else {
      linhas = raw.prepare("SELECT * FROM clinica_snapshots WHERE clinica_id = ? ORDER BY criado_em DESC LIMIT 20").all(clinicaId);
    }
    return linhas.map((l: any) => ({ id: l.id, dados: JSON.parse(l.dados || "{}"), criado_em: l.criado_em }));
  } catch {
    return [];
  }
}
// marca que o alerta de fim de trial ja foi enviado (nao repetir todo dia)
export async function marcarTrialAvisoEnviado(clinicaId: string) {
  return driver().update("clinicas", clinicaId, { trial_aviso_enviado: B(true) });
}

// ---------- Cobranca / Assinatura (Stripe) ----------
// atualiza os ids/estado da assinatura de uma clinica (update parcial, nao
// mexe no resto do cadastro). Quando o STATUS muda, registra a transicao em
// assinatura_eventos (fail-open) — e o que alimenta as metricas de negocio
// do admin (conversao trial->ativa, inadimplencia, churn).
export async function atualizarAssinaturaClinica(
  clinicaId: string,
  campos: {
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    assinatura_status?: string;
    plano_valor_centavos?: number;
    trial_inicio?: string;
  }
) {
  if (campos.assinatura_status) {
    try {
      const atual = await getClinica(clinicaId);
      const de = atual?.assinatura_status ?? null;
      if (de !== campos.assinatura_status) {
        await driver().insert("assinatura_eventos", {
          id: uid(),
          clinica_id: clinicaId,
          de_status: de,
          para_status: campos.assinatura_status,
        });
      }
    } catch (e: any) {
      // fail-open: metrica nunca pode travar a cobranca
      console.error("[db] registrar evento de assinatura falhou:", e.message);
    }
  }
  return driver().update("clinicas", clinicaId, campos);
}

// eventos de assinatura (mais recentes primeiro) pro dashboard do admin
export async function listEventosAssinatura(limite = 200) {
  try {
    return await driver().query("assinatura_eventos", {
      order: "criado_em desc",
      limit: limite,
    });
  } catch {
    return []; // tabela ainda nao migrada — dashboard mostra vazio, nao quebra
  }
}
// acha a clinica dona de um customer do Stripe (pra tratar o webhook)
export async function clinicaPorStripeCustomer(customerId: string) {
  return driver().selectOne("clinicas", { stripe_customer_id: customerId });
}
export async function clinicaPorStripeSubscription(subId: string) {
  return driver().selectOne("clinicas", { stripe_subscription_id: subId });
}

// ---------- Instancias ----------
export async function getInstancia(id: string) {
  return driver().selectOne("instancias", { id });
}
// ISOLAMENTO MULTI-TENANT: essas duas funcoes decidem DE QUAL CLINICA e a
// mensagem que chegou no webhook. Errar aqui = a IA da clinica X atender o
// paciente da clinica Y. Por isso:
//  - token PRIMEIRO (unico, gerado pela uazapi — nunca colide entre clinicas)
//  - nome (uazapi_instance) e escolhido pelo usuario e PODE repetir entre
//    clinicas: so vale se casar com EXATAMENTE UMA instancia; ambiguo = null
//    (o webhook cai pro roteamento por numero, que e o dono fisico)
export async function getInstanciaPorNumero(numero: string) {
  const linhas = await driver().selectMany("instancias", { numero });
  if (linhas.length === 0) return null;
  if (linhas.length === 1) return linhas[0];
  // numero repetido (registro antigo de outra clinica): prefere a CONECTADA;
  // empate = a mais recente. Nunca "uma qualquer".
  console.warn(`[db] numero ${numero} em ${linhas.length} instancias — desambiguando`);
  const conectadas = linhas.filter((i: any) => i.status === "conectado" || i.status === "connected");
  const candidatas = conectadas.length > 0 ? conectadas : linhas;
  return candidatas.sort((a: any, b: any) =>
    String(b.criado_em || "").localeCompare(String(a.criado_em || ""))
  )[0];
}
export async function getInstanciaPorIdentificador(ident: string) {
  // 1) token: unico por instancia, identificacao 100% segura
  const porToken = await driver().selectOne("instancias", { uazapi_token: ident });
  if (porToken) return porToken;
  // 2) nome: so aceita se for INEQUIVOCO (1 unica instancia com esse nome)
  const porNome = await driver().selectMany("instancias", { uazapi_instance: ident });
  if (porNome.length === 1) return porNome[0];
  if (porNome.length > 1) {
    console.warn(`[db] identificador "${ident}" ambiguo (${porNome.length} instancias) — ignorando, roteia por numero`);
  }
  return null;
}
export async function listInstancias(clinicaId: string) {
  return driver().selectMany("instancias", { clinica_id: clinicaId });
}
export async function listTodasInstancias() {
  return driver().selectMany("instancias");
}
export async function atualizarStatusInstancia(id: string, status: string) {
  return driver().update("instancias", id, { status });
}
export async function upsertInstancia(i: any) {
  return driver().upsert("instancias", {
    id: i.id,
    clinica_id: i.clinica_id,
    nome: i.nome ?? null,
    numero: i.numero ?? null,
    uazapi_instance: i.uazapi_instance ?? null,
    uazapi_token: i.uazapi_token ?? null,
    status: i.status ?? "desconectado",
    ...(i.funcao !== undefined ? { funcao: i.funcao } : {}),
  });
}

// ---------- Profissionais + horarios ----------
// SEGURANCA: gcal_refresh_token e credencial OAuth de longa duracao. NUNCA pode
// vazar pro browser. getProfissional/listProfissionais (usados em paginas/APIs)
// retornam SEM o token. Quem precisa do token (so o lib/gcal.ts, server-side)
// usa getProfissionalComToken.
function semToken(p: any) {
  if (!p) return p;
  const { gcal_refresh_token, ...resto } = p;
  return resto;
}
export async function listProfissionais(clinicaId: string) {
  const todos = await driver().selectMany("profissionais", { clinica_id: clinicaId }, "nome");
  return todos.filter((p: any) => isTrue(p.ativo)).map(semToken);
}
export async function getProfissional(id: string) {
  return semToken(await driver().selectOne("profissionais", { id }));
}
// SO pro lib/gcal.ts (server-side): traz o profissional COM o refresh token.
export async function getProfissionalComToken(id: string) {
  return driver().selectOne("profissionais", { id });
}
export async function upsertProfissional(p: any) {
  // NAO inclui campos de token Google de proposito — editar o cadastro nao
  // desvincula o Google. Vinculo se atualiza pelas funcoes dedicadas abaixo.
  return driver().upsert("profissionais", {
    id: p.id,
    clinica_id: p.clinica_id,
    nome: p.nome,
    especialidade: p.especialidade ?? null,
    duracao_min: p.duracao_min ?? 30,
    gcal_id: p.gcal_id ?? null,
    ativo: p.ativo ?? B(true),
    // convenios e infos POR profissional (so gravados se vierem — compat pre-migration)
    ...(p.convenios !== undefined ? { convenios: p.convenios } : {}),
    ...(p.info !== undefined ? { info: p.info } : {}),
    // mapeamento pro Clinicorp (so grava se vier — compat pre-migration)
    ...(p.clinicorp_professional_id !== undefined
      ? { clinicorp_professional_id: p.clinicorp_professional_id }
      : {}),
  });
}
// vincula (ou desvincula, com "") o profissional ao dentista correspondente no
// Clinicorp — update CIRURGICO (so a coluna do mapeamento), pra nunca zerar
// nome/especialidade/gcal do medico como um upsert parcial faria.
export async function vincularClinicorpProfissional(profissionalId: string, clinicorpProfId: string) {
  return driver().update("profissionais", profissionalId, {
    clinicorp_professional_id: clinicorpProfId || null,
  });
}
// mesmo update cirurgico pro Klingo (id + CRM, usado no filtro de agenda)
export async function vincularKlingoProfissional(profissionalId: string, klingoProfId: string, crm?: string) {
  return driver().update("profissionais", profissionalId, {
    klingo_professional_id: klingoProfId || null,
    klingo_crm: crm || null,
  });
}
// vincula o Google Calendar de um medico (guarda o refresh token)
export async function vincularGoogleProfissional(
  profissionalId: string,
  dados: { gcal_refresh_token: string; gcal_email?: string; gcal_id?: string }
) {
  return driver().update("profissionais", profissionalId, {
    gcal_refresh_token: dados.gcal_refresh_token,
    gcal_conectado: B(true),
    gcal_email: dados.gcal_email ?? null,
    gcal_id: dados.gcal_id ?? "primary",
  });
}
// desvincula (medico desconecta o Google)
export async function desvincularGoogleProfissional(profissionalId: string) {
  return driver().update("profissionais", profissionalId, {
    gcal_refresh_token: null,
    gcal_conectado: B(false),
    gcal_email: null,
  });
}
export async function listHorarios(profissionalId: string) {
  return driver().selectMany(
    "horarios",
    { profissional_id: profissionalId },
    "dia_semana, hora_inicio"
  );
}
export async function addHorario(h: any) {
  return driver().insert("horarios", {
    id: h.id || uid(),
    profissional_id: h.profissional_id,
    dia_semana: h.dia_semana,
    hora_inicio: h.hora_inicio,
    hora_fim: h.hora_fim,
  });
}
export async function setHorarios(profissionalId: string, horarios: any[]) {
  const db = driver().raw;
  if (IS_PG) {
    await db.from("horarios").delete().eq("profissional_id", profissionalId);
  } else {
    db.prepare("DELETE FROM horarios WHERE profissional_id = ?").run(profissionalId);
  }
  for (const h of horarios) {
    await addHorario({
      id: h.id || uid(),
      profissional_id: profissionalId,
      dia_semana: h.dia_semana,
      hora_inicio: h.hora_inicio,
      hora_fim: h.hora_fim,
    });
  }
}
export async function removerProfissional(profissionalId: string) {
  // bloqueia se houver consulta FUTURA ativa (agendada/confirmada) — senao o
  // paciente perde a consulta silenciosamente. A clinica precisa remarcar/
  // cancelar antes de desativar o medico.
  const agoraSP = new Date(Date.now() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19); // wall-clock SP "YYYY-MM-DDTHH:mm:ss"
  const futuras = await driver().query("consultas", {
    eq: { profissional_id: profissionalId },
    inList: { status: ["agendada", "confirmada"] },
    gte: { inicio: agoraSP },
    limit: 1,
  });
  if (futuras.length > 0) {
    throw new Error(
      "Esse profissional tem consulta futura marcada. Cancele ou remarque as consultas antes de remover."
    );
  }
  return driver().update("profissionais", profissionalId, { ativo: B(false) });
}
export async function listBloqueios(profissionalId: string) {
  return driver().selectMany("bloqueios", { profissional_id: profissionalId });
}

// ---------- Pacientes ----------
// ATOMICO: tenta inserir direto; se colidir com o unique(clinica_id, telefone)
// (2 webhooks paralelos do mesmo paciente novo), volta pro select — assim
// nunca cria 2 linhas do mesmo telefone mesmo em corrida. Sem isso (select
// depois insert) 2 requests concorrentes podiam criar 2 pacientes do mesmo
// numero, e dai o "stop"/consulta ficavam gravados numa linha e lidos de outra.
export async function getOuCriaPaciente(clinicaId: string, telefone: string, nome?: string) {
  let p = await driver().selectOne("pacientes", { clinica_id: clinicaId, telefone });
  if (!p) {
    try {
      p = await driver().insert("pacientes", {
        id: uid(),
        clinica_id: clinicaId,
        nome: nome ?? null,
        telefone,
      });
      // log: atendimento iniciado (paciente novo). Pula telefone de teste 0000.
      if (!telefone.startsWith("0000")) {
        await registrarLog(clinicaId, "atendimento", `🆕 Atendimento iniciado: ${nome || telefone}`);
      }
    } catch (e: any) {
      if (!ehConflitoUnico(e)) throw e;
      // outra requisicao criou primeiro: le a linha que ja existe
      p = await driver().selectOne("pacientes", { clinica_id: clinicaId, telefone });
      if (!p) throw e; // nao deveria acontecer, mas nao engole em silencio
    }
  } else if (nome && !p.nome) {
    p = await driver().update("pacientes", p.id, { nome });
  }
  return p;
}

export async function getPacientePorTelefone(clinicaId: string, telefone: string) {
  return driver().selectOne("pacientes", { clinica_id: clinicaId, telefone });
}
export async function salvarResumoPaciente(pacienteId: string, resumo: string) {
  return driver().update("pacientes", pacienteId, {
    resumo,
    resumo_atualizado_em: new Date().toISOString(),
  });
}
// consultas de um paciente (por telefone) com nome do profissional — pro card
// de resumo da conversa (proxima consulta + historico recente)
export async function consultasDoPacientePorTelefone(clinicaId: string, telefone: string, limite = 6) {
  const pac = await getPacientePorTelefone(clinicaId, telefone);
  if (!pac) return [];
  const consultas = await driver().query("consultas", {
    eq: { paciente_id: pac.id },
    order: "inicio desc",
    limit: limite,
  });
  const profs = await driver().selectMany("profissionais", { clinica_id: clinicaId });
  const profMap = new Map(profs.map((p: any) => [p.id, p.nome]));
  return consultas.map((c: any) => ({ ...c, profissional_nome: profMap.get(c.profissional_id) }));
}

// ---------- Ultima midia da conversa (guia de exame) ----------
// Guarda a URL da ultima imagem/PDF que o paciente mandou. Quando a IA agendar
// um EXAME, essa midia recente vira a guia anexada na consulta.
export async function salvarUltimaMidia(clinicaId: string, telefone: string, url: string) {
  try {
    const p = await getOuCriaPaciente(clinicaId, telefone);
    await driver().update("pacientes", p.id, {
      ultima_midia_url: url,
      ultima_midia_em: new Date().toISOString(),
    });
  } catch (e: any) {
    console.warn("[db] salvarUltimaMidia falhou (segue sem anexo):", e.message);
  }
}
// URL da ultima midia se for RECENTE (default: ultimas 2h) — guia velha nao vale
export async function getUltimaMidiaRecente(
  clinicaId: string,
  telefone: string,
  maxMinutos = 120
): Promise<string | null> {
  try {
    const p = await getPacientePorTelefone(clinicaId, telefone);
    if (!p?.ultima_midia_url || !p.ultima_midia_em) return null;
    const em = new Date(p.ultima_midia_em).getTime();
    if (!Number.isFinite(em) || Date.now() - em > maxMinutos * 60000) return null;
    return p.ultima_midia_url;
  } catch {
    return null;
  }
}

// ---------- Materiais da clinica (conhecimento da IA) ----------
export async function criarMaterial(m: { clinica_id: string; nome: string; conteudo: string }) {
  return driver().insert("materiais", {
    id: uid(),
    clinica_id: m.clinica_id,
    nome: m.nome.slice(0, 120),
    conteudo: m.conteudo.slice(0, 20000), // cap duro por material
  });
}
export async function listMateriais(clinicaId: string) {
  try {
    return await driver().selectMany("materiais", { clinica_id: clinicaId }, "criado_em");
  } catch {
    return []; // tabela ainda nao migrada
  }
}
export async function getMaterial(id: string) {
  return driver().selectOne("materiais", { id });
}
export async function atualizarMaterial(id: string, campos: { nome?: string; conteudo?: string }) {
  const dados: any = {};
  if (campos.nome !== undefined) dados.nome = campos.nome.slice(0, 120);
  if (campos.conteudo !== undefined) dados.conteudo = campos.conteudo.slice(0, 20000);
  return driver().update("materiais", id, dados);
}
export async function removerMaterial(id: string) {
  const raw = driver().raw;
  if (IS_PG) {
    await raw.from("materiais").delete().eq("id", id);
  } else {
    raw.prepare("DELETE FROM materiais WHERE id = ?").run(id);
  }
}

// Apaga um CONTATO inteiro da clinica: mensagens, duvidas, lista de espera,
// consultas e o proprio cadastro do paciente. Pra limpar numero de teste,
// spam ou contato errado. IRREVERSIVEL (a tela pede confirmacao).
export async function apagarContato(clinicaId: string, telefone: string): Promise<void> {
  const raw = driver().raw;
  const pac = await driver().selectOne("pacientes", { clinica_id: clinicaId, telefone });
  // tabelas por clinica+telefone
  for (const t of ["mensagens", "duvidas", "conversa_lock", "lista_espera"]) {
    try {
      if (IS_PG) await raw.from(t).delete().eq("clinica_id", clinicaId).eq("telefone", telefone);
      else raw.prepare(`DELETE FROM ${t} WHERE clinica_id = ? AND telefone = ?`).run(clinicaId, telefone);
    } catch (e: any) {
      console.warn(`[db] apagarContato: falha em ${t} (segue):`, e.message);
    }
  }
  // consultas + paciente (por paciente_id)
  if (pac) {
    try {
      if (IS_PG) await raw.from("consultas").delete().eq("paciente_id", pac.id);
      else raw.prepare("DELETE FROM consultas WHERE paciente_id = ?").run(pac.id);
    } catch (e: any) {
      console.warn("[db] apagarContato: falha em consultas (segue):", e.message);
    }
    if (IS_PG) await raw.from("pacientes").delete().eq("id", pac.id);
    else raw.prepare("DELETE FROM pacientes WHERE id = ?").run(pac.id);
  }
}

// Remove uma CLINICA INTEIRA e tudo que e dela (SO ADMIN chama, com dupla
// confirmacao na tela). Ordem: filhos primeiro, clinica por ultimo — se algo
// falhar no meio, a clinica ainda aparece e da pra rodar de novo.
export async function removerClinica(clinicaId: string): Promise<void> {
  const raw = driver().raw;
  // horarios/bloqueios dependem de profissional_id
  const profs = await driver().selectMany("profissionais", { clinica_id: clinicaId });
  const profIds = profs.map((p: any) => p.id);
  if (IS_PG) {
    if (profIds.length > 0) {
      await raw.from("horarios").delete().in("profissional_id", profIds);
      await raw.from("bloqueios").delete().in("profissional_id", profIds);
    }
  } else {
    for (const pid of profIds) {
      raw.prepare("DELETE FROM horarios WHERE profissional_id = ?").run(pid);
      raw.prepare("DELETE FROM bloqueios WHERE profissional_id = ?").run(pid);
    }
  }
  // tabelas com clinica_id direto (as que nao existirem em algum ambiente
  // apenas falham em silencio — best-effort tabela a tabela)
  const TABELAS = [
    "mensagens", "consultas", "pacientes", "duvidas", "materiais",
    "lista_espera", "conversa_lock", "relatorios_enviados", "atividade_log",
    "assinatura_eventos", "uso_tokens", "clinica_snapshots", "instancias",
    "profissionais", "contas",
  ];
  for (const t of TABELAS) {
    try {
      if (IS_PG) await raw.from(t).delete().eq("clinica_id", clinicaId);
      else raw.prepare(`DELETE FROM ${t} WHERE clinica_id = ?`).run(clinicaId);
    } catch (e: any) {
      console.warn(`[db] removerClinica: falha em ${t} (segue):`, e.message);
    }
  }
  if (IS_PG) await raw.from("clinicas").delete().eq("id", clinicaId);
  else raw.prepare("DELETE FROM clinicas WHERE id = ?").run(clinicaId);
}

// Remove DE VEZ um numero de WhatsApp do banco (o logout na uazapi e feito
// antes, na rota). Diferente do "desconectar" (que mantem o registro pra
// reconectar): aqui a clinica quer tirar o numero da lista. Best-effort no raw.
export async function removerInstancia(id: string) {
  const raw = driver().raw;
  if (IS_PG) {
    await raw.from("instancias").delete().eq("id", id);
  } else {
    raw.prepare("DELETE FROM instancias WHERE id = ?").run(id);
  }
}

// logs de um periodo (dias SP inclusivos) — usado pelo relatorio semanal pra
// agregar motivos de cancelamento
export async function listLogsPeriodo(clinicaId: string, deSP: string, ateSP: string) {
  try {
    const deUTC = new Date(deSP + "T00:00:00-03:00");
    const ateUTC = new Date(ateSP + "T23:59:59-03:00");
    const fmt = (d: Date) =>
      IS_PG ? d.toISOString() : d.toISOString().slice(0, 19).replace("T", " ");
    return await driver().query("atividade_log", {
      eq: { clinica_id: clinicaId },
      gte: { criado_em: fmt(deUTC) },
      lte: { criado_em: fmt(ateUTC) },
      limit: 5000,
    });
  } catch {
    return [];
  }
}

// ---------- Atendimento humano (comando "stop") ----------
// pausa a IA pra um paciente (o atendente humano assume) ou reativa
export async function pausarIAPaciente(clinicaId: string, telefone: string, pausar: boolean) {
  const p = await getOuCriaPaciente(clinicaId, telefone);
  // so loga quando o estado MUDA (o fromMe pausa a cada mensagem manual do
  // atendente — sem essa checagem o log viraria spam de "assumiu")
  if (isTrue(p.ia_pausada) !== pausar) {
    const quem = p.nome || telefone;
    await registrarLog(
      clinicaId,
      "conversa",
      pausar ? `🙋 Atendente assumiu a conversa de ${quem}` : `🤖 IA voltou a atender ${quem}`
    );
  }
  return driver().update("pacientes", p.id, { ia_pausada: B(pausar) });
}
export async function iaPausadaPaciente(clinicaId: string, telefone: string): Promise<boolean> {
  const p = await driver().selectOne("pacientes", { clinica_id: clinicaId, telefone });
  return p ? isTrue(p.ia_pausada) : false;
}

// ---------- Consultas ----------
export async function criarConsulta(c: any) {
  return driver().insert("consultas", {
    id: c.id || uid(),
    clinica_id: c.clinica_id,
    profissional_id: c.profissional_id,
    paciente_id: c.paciente_id,
    inicio: c.inicio,
    fim: c.fim,
    status: c.status ?? "agendada",
    origem: c.origem ?? "ia",
    observacao: c.observacao ?? null,
    // forma de pagamento capturada pela IA no inicio da conversa
    pagamento: c.pagamento ?? null,        // "particular" | "convenio" | null
    convenio_nome: c.convenio_nome ?? null, // nome do convenio quando pagamento="convenio"
    // id do evento no Google — so inclui quando vier (compat: banco ainda sem a
    // coluna da migration-006 nao pode quebrar o INSERT de consulta)
    ...(c.gcal_event_id ? { gcal_event_id: c.gcal_event_id } : {}),
    // guia do exame anexada (idem: so quando vier)
    ...(c.guia_url ? { guia_url: c.guia_url } : {}),
  });
}
export async function getConsulta(id: string) {
  return driver().selectOne("consultas", { id });
}
export async function atualizarStatusConsulta(id: string, status: string) {
  return driver().update("consultas", id, { status });
}
export async function atualizarObservacaoConsulta(id: string, observacao: string) {
  return driver().update("consultas", id, { observacao });
}
export async function atualizarGcalEventId(id: string, gcalEventId: string) {
  return driver().update("consultas", id, { gcal_event_id: gcalEventId });
}
export async function atualizarFeegowAgendamentoId(id: string, feegowId: string) {
  return driver().update("consultas", id, { feegow_agendamento_id: String(feegowId) });
}
export async function atualizarClinicorpAgendamentoId(id: string, clinicorpId: string) {
  return driver().update("consultas", id, { clinicorp_agendamento_id: String(clinicorpId) });
}
export async function atualizarKlingoVoucherId(id: string, voucherId: string) {
  return driver().update("consultas", id, { klingo_voucher_id: String(voucherId) });
}
// configuracao da integracao Feegow (token/unidade/motivo por clinica)
export async function salvarConfigFeegow(
  clinicaId: string,
  campos: {
    feegow_token?: string | null;
    feegow_local_id?: string | null;
    feegow_motivo_id?: string | null;
    feegow_unidade_nome?: string | null;
  }
) {
  return driver().update("clinicas", clinicaId, campos);
}
// mapeamento Feegow de um profissional
export async function salvarMapeamentoFeegow(
  profissionalId: string,
  campos: { feegow_professional_id?: string | null; feegow_especialidade_id?: string | null; feegow_procedimento_id?: string | null }
) {
  return driver().update("profissionais", profissionalId, campos);
}
export async function reagendarConsulta(id: string, inicio: string, fim: string) {
  return driver().update("consultas", id, { inicio, fim, status: "agendada" });
}
export async function marcarConfirmacaoEnviada(id: string) {
  await driver().update("consultas", id, { confirmacao_enviada: B(true) });
}
export async function marcarReviewEnviado(id: string) {
  await driver().update("consultas", id, { review_enviado: B(true) });
}

// Metricas de uma clinica (o numero que vende) — desde uma data ate agora.
export async function metricasClinica(clinicaId: string, desdeISO: string) {
  // Postgres: criado_em e timestamptz (parseia o ISO com T sem problema).
  // SQLite: criado_em e texto "YYYY-MM-DD HH:MM:SS" (com espaco) — normaliza o T.
  const desde = IS_PG ? desdeISO : desdeISO.replace("T", " ");
  // SEM fallback pra "todas": periodo sem dados devolve zeros (honesto).
  // O fallback antigo inflava o dashboard (mostrava o historico inteiro como
  // se fosse do periodo, exagerando a "receita protegida").
  const base = await driver().query("consultas", {
    eq: { clinica_id: clinicaId },
    gte: { criado_em: desde },
  });

  const total = base.length;
  const confirmadas = base.filter((c: any) => c.status === "confirmada" || c.status === "realizada").length;
  const canceladas = base.filter((c: any) => c.status === "cancelada").length;
  const realizadas = base.filter((c: any) => c.status === "realizada").length;
  const reviewsPedidos = base.filter((c: any) => isTrue(c.review_enviado)).length;
  const lembretesEnviados = base.filter((c: any) => isTrue(c.confirmacao_enviada)).length;
  // "no-shows evitados" = confirmacoes ativas (paciente confirmou presenca apos lembrete)
  const noShowsEvitados = base.filter(
    (c: any) => isTrue(c.confirmacao_enviada) && (c.status === "confirmada" || c.status === "realizada")
  ).length;
  return {
    total,
    confirmadas,
    canceladas,
    realizadas,
    reviewsPedidos,
    lembretesEnviados,
    noShowsEvitados,
  };
}

// consultas que colidem com uma janela (pra checar disponibilidade) — filtra no banco
export async function consultasDoProfissional(profissionalId: string, deISO: string, ateISO: string) {
  // colisao: inicio < ate AND fim > de. Filtramos por inicio no banco e refina em JS
  // (fim > de) porque a maioria das consultas do dia ja cabe na janela.
  const cands = await driver().query("consultas", {
    eq: { profissional_id: profissionalId },
    neq: { status: "cancelada" },
    lt: { inicio: ateISO },
    order: "inicio",
  });
  return cands.filter((c: any) => c.fim > deISO);
}

// Ha alguma consulta NAO-cancelada do profissional que se sobreponha a janela
// [inicioISO, fimISO)? Sobreposicao = inicio < fimNovo E fim > inicioNovo.
// Blindagem final contra overbooking: pega qualquer colisao (mesmo desalinhada
// da grade — ex: consulta de 10:00-10:40 vs nova 10:20-11:00), nao so inicio igual.
// ignorarId: pula a propria consulta (usado no remarcar).
export async function haSobreposicao(
  profissionalId: string,
  inicioISO: string,
  fimISO: string,
  ignorarId?: string
): Promise<boolean> {
  const colidem = await consultasDoProfissional(profissionalId, inicioISO, fimISO);
  return colidem.some((c: any) => c.id !== ignorarId);
}

// consultas a confirmar (D-1): status agendada, sem confirmacao, na janela — tudo no banco
export async function consultasParaConfirmar(deISO: string, ateISO: string) {
  return driver().query("consultas", {
    eq: { status: "agendada", confirmacao_enviada: B(false) },
    gte: { inicio: deISO },
    lt: { inicio: ateISO },
    order: "inicio",
  });
}

// consultas pra pedir review: confirmada/realizada, sem review, ja terminou — no banco
export async function consultasParaReview(ateISO: string) {
  return driver().query("consultas", {
    inList: { status: ["confirmada", "realizada"] },
    eq: { review_enviado: B(false) },
    lt: { fim: ateISO },
    order: "fim",
  });
}

// consultas ja terminadas que ainda estao "agendada"/"confirmada" e precisam
// virar "realizada" (destrava o review). Nao mexe em canceladas nem faltou.
// Sem check-in real, tratamos consulta passada nao-cancelada como comparecida.
export async function consultasParaFecharComoRealizada(ateISO: string) {
  return driver().query("consultas", {
    inList: { status: ["agendada", "confirmada"] },
    lt: { fim: ateISO },
    order: "fim",
  });
}

// proxima consulta de um paciente (pra IA confirmar/cancelar pelo telefone)
export async function proximaConsultaDoPaciente(clinicaId: string, telefone: string) {
  const pac = await driver().selectOne("pacientes", { clinica_id: clinicaId, telefone });
  if (!pac) return null;
  const futuras = await driver().query("consultas", {
    eq: { paciente_id: pac.id },
    inList: { status: ["agendada", "confirmada"] },
    order: "inicio",
    limit: 1,
  });
  return futuras[0] || null;
}

// agenda da clinica (com nomes do profissional e paciente) — filtra por janela no banco
export async function agendaDaClinica(clinicaId: string, deISO: string, ateISO: string) {
  const noPeriodo = await driver().query("consultas", {
    eq: { clinica_id: clinicaId },
    gte: { inicio: deISO },
    lt: { inicio: ateISO },
    order: "inicio",
  });
  if (noPeriodo.length === 0) return [];
  const profs = await driver().selectMany("profissionais", { clinica_id: clinicaId });
  const pacs = await driver().selectMany("pacientes", { clinica_id: clinicaId });
  const profMap = new Map(profs.map((p: any) => [p.id, p]));
  const pacMap = new Map(pacs.map((p: any) => [p.id, p]));
  return noPeriodo.map((c: any) => ({
    ...c,
    profissional_nome: (profMap.get(c.profissional_id) as any)?.nome,
    paciente_nome: (pacMap.get(c.paciente_id) as any)?.nome,
    telefone: (pacMap.get(c.paciente_id) as any)?.telefone,
  }));
}

// dados completos de uma consulta (pras reguas)
export async function consultaCompleta(consultaId: string) {
  const c = await getConsulta(consultaId);
  if (!c) return null;
  const prof = await getProfissional(c.profissional_id);
  const pac = await driver().selectOne("pacientes", { id: c.paciente_id });
  return {
    ...c,
    profissional_nome: prof?.nome,
    paciente_nome: pac?.nome,
    telefone: pac?.telefone,
  };
}

// primeira instancia ativa de uma clinica (pras reguas dispararem)
export async function instanciaDaClinica(clinicaId: string) {
  const insts = await driver().selectMany("instancias", { clinica_id: clinicaId });
  return insts.find((i: any) => i.status !== "invalido") || null;
}

// ---------- Log de atividades (auditoria legivel) ----------
// FAIL-OPEN sempre: log NUNCA pode quebrar a acao que esta sendo logada.
export async function registrarLog(clinicaId: string, tipo: string, descricao: string): Promise<void> {
  try {
    await driver().insert("atividade_log", {
      id: uid(),
      clinica_id: clinicaId,
      tipo,
      descricao,
    });
  } catch (e: any) {
    console.error("[db] registrarLog falhou:", e.message);
  }
}
export async function listLogs(clinicaId: string, limite = 200) {
  try {
    return await driver().query("atividade_log", {
      eq: { clinica_id: clinicaId },
      order: "criado_em desc",
      limit: limite,
    });
  } catch {
    return []; // tabela ainda nao migrada — tela mostra vazio
  }
}

// Metricas das conversas num periodo (dias SP inclusivos "YYYY-MM-DD").
// Conta pelos eventos do atividade_log: iniciadas (tipo atendimento),
// marcadas (📅), confirmadas (✅), canceladas (❌) — semantica "aconteceu no
// periodo", independente do status atual da consulta.
export async function metricasConversas(clinicaId: string, deSP: string, ateSP: string) {
  const zero = { iniciadas: 0, marcadas: 0, confirmadas: 0, canceladas: 0 };
  try {
    // converte o dia SP pra UTC (o banco grava criado_em em UTC)
    const deUTC = new Date(deSP + "T00:00:00-03:00");
    const ateUTC = new Date(ateSP + "T23:59:59-03:00");
    const fmt = (d: Date) =>
      IS_PG ? d.toISOString() : d.toISOString().slice(0, 19).replace("T", " ");
    const logs = await driver().query("atividade_log", {
      eq: { clinica_id: clinicaId },
      gte: { criado_em: fmt(deUTC) },
      lte: { criado_em: fmt(ateUTC) },
      limit: 5000,
    });
    return logs.reduce((acc: typeof zero, l: any) => {
      const d = String(l.descricao || "");
      if (l.tipo === "atendimento") acc.iniciadas++;
      else if (d.startsWith("📅")) acc.marcadas++;
      else if (d.startsWith("✅")) acc.confirmadas++;
      else if (d.startsWith("❌")) acc.canceladas++;
      return acc;
    }, { ...zero });
  } catch {
    return zero; // tabela ainda nao migrada
  }
}

// Timestamp do banco -> milissegundos, pra COMPARAR datas entre si.
// Necessario porque os dois drivers gravam em formatos diferentes: o Postgres
// devolve "2026-08-10T14:15:03.634+00:00" e o SQLite "2026-08-10 14:15:03"
// (sem fuso, ja em UTC). Comparar essas strings direto daria ordem errada, por
// isso normalizamos: no formato do SQLite plantamos o "T" e o "Z".
function tsMs(v: any): number {
  if (!v) return 0;
  const s = String(v);
  const iso = s.includes("T") ? s : s.replace(" ", "T") + (/[Z+]/.test(s) ? "" : "Z");
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

// Teto de mensagens lidas de uma vez ao agregar conversas (lista e Kanban):
// puxa so as mais recentes em vez da tabela inteira. Declarado aqui porque as
// duas agregacoes (listarCrm abaixo e listarConversas la no fim) usam.
const JANELA_CONVERSAS = 2000;

// ---------- CRM (Kanban) + contato do WhatsApp ----------
// Etapas do funil, na ordem em que aparecem no quadro. A IA move sozinha
// conforme o atendimento anda (ver moverEtapaAutomatica); a recepcao pode
// arrastar o card na mao a qualquer momento (a mao sempre vence).
export const CRM_ETAPAS = [
  { id: "novo", rotulo: "Novo contato" },
  { id: "atendimento", rotulo: "Em atendimento" },
  { id: "agendado", rotulo: "Agendado" },
  { id: "cliente", rotulo: "Cliente" },
  { id: "perdido", rotulo: "Perdido" },
] as const;
export type CrmEtapa = (typeof CRM_ETAPAS)[number]["id"];
const ETAPAS_VALIDAS = new Set(CRM_ETAPAS.map((e) => e.id as string));
// ordem pra "so avanca": automacao nunca puxa um card pra tras (a recepcao
// marcou Cliente e o paciente mandou "oi" -> continua Cliente).
const ORDEM_ETAPA: Record<string, number> = {
  novo: 0, atendimento: 1, agendado: 2, cliente: 3, perdido: 3,
};

// Salva os campos do card. So grava o que veio (patch parcial nunca zera o
// resto) e carimba crm_atualizado_em quando a etapa muda — e esse carimbo que
// mede "lead parado ha X dias" na tela.
export async function salvarCrmPaciente(
  clinicaId: string,
  telefone: string,
  campos: { etapa?: string; tipo?: string; notas?: string; tags?: string }
): Promise<void> {
  try {
    const p = await getOuCriaPaciente(clinicaId, telefone);
    const patch: any = {};
    if (campos.etapa !== undefined && ETAPAS_VALIDAS.has(campos.etapa)) {
      patch.crm_etapa = campos.etapa;
      patch.crm_atualizado_em = new Date().toISOString();
    }
    if (campos.tipo !== undefined) patch.crm_tipo = campos.tipo || null;
    if (campos.notas !== undefined) patch.crm_notas = String(campos.notas).slice(0, 4000);
    if (campos.tags !== undefined) patch.crm_tags = String(campos.tags).slice(0, 500);
    if (Object.keys(patch).length === 0) return;
    await driver().update("pacientes", p.id, patch);
  } catch (e: any) {
    console.warn("[db] salvarCrmPaciente falhou (migration 021 pendente?):", e.message);
  }
}

// Move o card SOZINHO quando o atendimento anda (chamado pelo webhook e pelo
// agendamento). Regra: so AVANCA — se o card ja esta numa etapa igual ou mais
// adiante, nao mexe. Assim a automacao nunca desfaz o que a recepcao marcou.
export async function moverEtapaAutomatica(
  clinicaId: string,
  telefone: string,
  destino: CrmEtapa
): Promise<void> {
  try {
    const p = await getPacientePorTelefone(clinicaId, telefone);
    if (!p) return;
    const atual = String(p.crm_etapa || "novo");
    if (atual === "perdido") return; // perdido so sai na mao
    if ((ORDEM_ETAPA[atual] ?? 0) >= (ORDEM_ETAPA[destino] ?? 0)) return;
    const patch: any = { crm_etapa: destino, crm_atualizado_em: new Date().toISOString() };
    if (destino === "cliente") patch.crm_tipo = "cliente";
    await driver().update("pacientes", p.id, patch);
  } catch {
    /* migration pendente: CRM fica vazio, atendimento segue normal */
  }
}

// Mesma regra do moverEtapaAutomatica, mas endereçando o paciente pelo ID —
// pras réguas, que trabalham em cima da linha da consulta e não têm o telefone
// em mãos (evita um SELECT extra só pra descobrir o número).
export async function moverEtapaPorPacienteId(
  pacienteId: string,
  destino: CrmEtapa
): Promise<void> {
  try {
    const p = await driver().selectOne("pacientes", { id: pacienteId });
    if (!p) return;
    const atual = String(p.crm_etapa || "novo");
    if (atual === "perdido") return;
    if ((ORDEM_ETAPA[atual] ?? 0) >= (ORDEM_ETAPA[destino] ?? 0)) return;
    const patch: any = { crm_etapa: destino, crm_atualizado_em: new Date().toISOString() };
    if (destino === "cliente") patch.crm_tipo = "cliente";
    await driver().update("pacientes", p.id, patch);
  } catch {
    /* migration pendente */
  }
}

// Quadro completo pra tela do Kanban: um card por paciente que ja conversou,
// com a ultima mensagem e a proxima consulta anexadas.
export async function listarCrm(clinicaId: string) {
  const pacs = await driver().selectMany("pacientes", { clinica_id: clinicaId });
  const reais = pacs.filter((p: any) => !String(p.telefone || "").startsWith("0000"));
  if (reais.length === 0) return [];

  // ultima mensagem por telefone (uma varredura, sem N+1)
  const msgs = await driver().query("mensagens", {
    eq: { clinica_id: clinicaId },
    order: "criado_em desc",
    limit: JANELA_CONVERSAS,
  });
  const ultimaPorTel = new Map<string, { conteudo: string; quando: string; role: string }>();
  for (const m of msgs) {
    if (!ultimaPorTel.has(m.telefone)) {
      ultimaPorTel.set(m.telefone, { conteudo: m.conteudo, quando: m.criado_em, role: m.role });
    }
  }

  // proxima consulta por paciente (so as que ainda vao acontecer)
  const agora = new Date().toISOString().slice(0, 16);
  const consultas = await driver().query("consultas", {
    eq: { clinica_id: clinicaId },
    order: "inicio",
    limit: 2000,
  });
  const proximaPorPac = new Map<string, any>();
  const jaAtendido = new Set<string>();
  for (const c of consultas) {
    if (c.status === "realizada") jaAtendido.add(c.paciente_id);
    if (c.inicio >= agora && c.status !== "cancelada" && !proximaPorPac.has(c.paciente_id)) {
      proximaPorPac.set(c.paciente_id, c);
    }
  }

  return reais
    .map((p: any) => {
      const ult = ultimaPorTel.get(p.telefone);
      return {
        telefone: p.telefone,
        nome: p.nome || p.wa_nome || null,
        fotoUrl: p.wa_foto_url || null,
        etapa: ETAPAS_VALIDAS.has(String(p.crm_etapa)) ? String(p.crm_etapa) : "novo",
        tipo: p.crm_tipo || (jaAtendido.has(p.id) ? "cliente" : "lead"),
        notas: p.crm_notas || "",
        tags: p.crm_tags || "",
        atualizadoEm: p.crm_atualizado_em || p.criado_em || null,
        ultimaMensagem: ult?.conteudo || "",
        ultimaEm: ult?.quando || null,
        proximaConsulta: proximaPorPac.get(p.id)?.inicio || null,
      };
    })
    // card mais movimentado primeiro (quem falou por ultimo aparece no topo)
    .sort((a, b) => String(b.ultimaEm || "").localeCompare(String(a.ultimaEm || "")));
}

// Guarda nome/foto do WhatsApp com carimbo de quando buscamos (o cache olha
// esse carimbo pra nao consultar a uazapi de novo a cada abertura da tela).
export async function salvarContatoWhats(
  clinicaId: string,
  telefone: string,
  dados: { nome?: string; fotoUrl?: string }
): Promise<void> {
  try {
    const p = await getPacientePorTelefone(clinicaId, telefone);
    if (!p) return;
    await driver().update("pacientes", p.id, {
      wa_nome: dados.nome ?? p.wa_nome ?? null,
      wa_foto_url: dados.fotoUrl ?? p.wa_foto_url ?? null,
      wa_contato_em: new Date().toISOString(),
    });
  } catch {
    /* migration pendente: segue sem foto */
  }
}

// Telefones que precisam de uma busca de contato na uazapi: nunca buscados,
// ou buscados ha mais de `diasCache` (a URL da foto que a uazapi devolve
// expira, entao renovamos de tempos em tempos). Limitado a `teto` por carga
// pra abrir a tela nao virar dezenas de chamadas de rede.
export async function telefonesSemContato(
  clinicaId: string,
  diasCache = 7,
  teto = 12
): Promise<string[]> {
  try {
    const pacs = await driver().selectMany("pacientes", { clinica_id: clinicaId });
    const limite = Date.now() - diasCache * 86400_000;
    return pacs
      .filter((p: any) => !String(p.telefone || "").startsWith("0000"))
      .filter((p: any) => !p.wa_contato_em || tsMs(p.wa_contato_em) < limite)
      .slice(0, teto)
      .map((p: any) => String(p.telefone));
  } catch {
    return []; // migration pendente: ninguem pra buscar, tela usa as iniciais
  }
}

// ---------- Caixa de entrada (nao lidas / importantes) ----------
// "Lida" = a recepcao abriu a conversa; gravamos ate qual momento ela viu.
// Mensagem do paciente mais nova que esse carimbo conta como nao lida.
export async function marcarConversaLida(clinicaId: string, telefone: string): Promise<void> {
  try {
    const p = await getPacientePorTelefone(clinicaId, telefone);
    if (!p) return;
    await driver().update("pacientes", p.id, { lido_ate: new Date().toISOString() });
  } catch {
    /* migration pendente */
  }
}

export async function marcarConversaImportante(
  clinicaId: string,
  telefone: string,
  importante: boolean
): Promise<void> {
  try {
    const p = await getOuCriaPaciente(clinicaId, telefone);
    await driver().update("pacientes", p.id, { importante: B(importante) });
  } catch (e: any) {
    console.warn("[db] marcarConversaImportante falhou:", e.message);
  }
}

// ---------- Metricas avancadas (tela de Resultados) ----------
// Tudo que a tela de metricas mostra alem dos cards basicos: o funil de
// conversao, a serie diaria pros graficos de linha/coluna, a distribuicao por
// status/etapa e o tempo medio de resposta da IA.
//
// Uma unica passada por consultas + mensagens do periodo, agregando em JS
// (mesma escolha do resto do arquivo: o driver nao tem GROUP BY generico).
export async function metricasAvancadas(clinicaId: string, deSP: string, ateSP: string) {
  const vazio = {
    funil: { conversas: 0, agendaram: 0, confirmaram: 0, compareceram: 0 },
    serie: [] as { dia: string; conversas: number; agendadas: number; confirmadas: number; canceladas: number }[],
    porStatus: { agendada: 0, confirmada: 0, realizada: 0, cancelada: 0 },
    porEtapaCrm: {} as Record<string, number>,
    tempoRespostaMin: null as number | null,
    totalMensagens: 0,
    mensagensIA: 0,
    pacientesNovos: 0,
    taxaConversao: 0,
    taxaComparecimento: 0,
    taxaCancelamento: 0,
  };
  try {
    const deUTC = new Date(deSP + "T00:00:00-03:00");
    const ateUTC = new Date(ateSP + "T23:59:59-03:00");
    const fmt = (d: Date) => (IS_PG ? d.toISOString() : d.toISOString().slice(0, 19).replace("T", " "));

    const [consultas, mensagens, pacientes] = await Promise.all([
      driver().query("consultas", {
        eq: { clinica_id: clinicaId },
        gte: { criado_em: fmt(deUTC) },
        lte: { criado_em: fmt(ateUTC) },
        limit: 5000,
      }),
      driver().query("mensagens", {
        eq: { clinica_id: clinicaId },
        gte: { criado_em: fmt(deUTC) },
        lte: { criado_em: fmt(ateUTC) },
        order: "criado_em",
        limit: 8000,
      }),
      driver().selectMany("pacientes", { clinica_id: clinicaId }),
    ]);

    // dia SP a partir de um timestamp UTC do banco (a tela fala em dias SP)
    const diaSP = (v: any) => {
      const ms = tsMs(v);
      if (!ms) return "";
      return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);
    };

    // esqueleto da serie com TODOS os dias do periodo (dia sem movimento
    // aparece como zero, senao o grafico de linha "pula" datas)
    const serieMapa = new Map<string, { dia: string; conversas: number; agendadas: number; confirmadas: number; canceladas: number }>();
    for (let t = new Date(deSP + "T12:00:00Z").getTime(); t <= new Date(ateSP + "T12:00:00Z").getTime(); t += 86400_000) {
      const dia = new Date(t).toISOString().slice(0, 10);
      serieMapa.set(dia, { dia, conversas: 0, agendadas: 0, confirmadas: 0, canceladas: 0 });
    }

    const porStatus = { agendada: 0, confirmada: 0, realizada: 0, cancelada: 0 };
    for (const c of consultas) {
      const st = String(c.status || "agendada");
      if (st in porStatus) (porStatus as any)[st]++;
      const linha = serieMapa.get(diaSP(c.criado_em));
      if (linha) {
        linha.agendadas++;
        if (st === "confirmada" || st === "realizada") linha.confirmadas++;
        if (st === "cancelada") linha.canceladas++;
      }
    }

    // conversas iniciadas por dia + tempo de resposta da IA.
    // Tempo de resposta = intervalo entre a mensagem do paciente e a resposta
    // seguinte da clinica, na mesma conversa. Ignora intervalos acima de 2h
    // (ali nao houve "resposta": o paciente voltou horas depois).
    const telefonesVistos = new Set<string>();
    const ultimaDoPaciente = new Map<string, number>();
    const esperas: number[] = [];
    let mensagensIA = 0;
    for (const m of mensagens) {
      if (String(m.telefone || "").startsWith("0000")) continue; // simulador
      if (m.role === "user") {
        // primeira mensagem desse telefone no periodo = conversa iniciada
        if (!telefonesVistos.has(m.telefone)) {
          telefonesVistos.add(m.telefone);
          const linha = serieMapa.get(diaSP(m.criado_em));
          if (linha) linha.conversas++;
        }
        // so guarda a PRIMEIRA da rajada (a resposta responde a rajada toda)
        if (!ultimaDoPaciente.has(m.telefone)) ultimaDoPaciente.set(m.telefone, tsMs(m.criado_em));
      } else if (m.role === "assistant") {
        mensagensIA++;
        const desde = ultimaDoPaciente.get(m.telefone);
        if (desde) {
          const min = (tsMs(m.criado_em) - desde) / 60000;
          if (min >= 0 && min <= 120) esperas.push(min);
          ultimaDoPaciente.delete(m.telefone);
        }
      }
    }

    const tempoRespostaMin =
      esperas.length > 0
        ? Math.round((esperas.reduce((s, v) => s + v, 0) / esperas.length) * 10) / 10
        : null;

    // distribuicao dos cards do CRM (o funil "de gente", nao "de consulta")
    const porEtapaCrm: Record<string, number> = {};
    let pacientesNovos = 0;
    for (const p of pacientes) {
      if (String(p.telefone || "").startsWith("0000")) continue;
      const et = ETAPAS_VALIDAS.has(String(p.crm_etapa)) ? String(p.crm_etapa) : "novo";
      porEtapaCrm[et] = (porEtapaCrm[et] || 0) + 1;
      const d = diaSP(p.criado_em);
      if (d >= deSP && d <= ateSP) pacientesNovos++;
    }

    // FUNIL: conversou -> agendou -> confirmou -> compareceu.
    // Contado por PESSOA (paciente unico), nao por consulta: e a leitura que
    // interessa pra clinica ("de 100 que falaram, quantos apareceram").
    const pacQueAgendou = new Set(consultas.map((c: any) => c.paciente_id));
    const pacQueConfirmou = new Set(
      consultas.filter((c: any) => c.status === "confirmada" || c.status === "realizada").map((c: any) => c.paciente_id)
    );
    const pacQueCompareceu = new Set(
      consultas.filter((c: any) => c.status === "realizada").map((c: any) => c.paciente_id)
    );
    const funil = {
      conversas: telefonesVistos.size,
      agendaram: pacQueAgendou.size,
      confirmaram: pacQueConfirmou.size,
      compareceram: pacQueCompareceu.size,
    };

    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

    return {
      funil,
      serie: Array.from(serieMapa.values()),
      porStatus,
      porEtapaCrm,
      tempoRespostaMin,
      totalMensagens: mensagens.length,
      mensagensIA,
      pacientesNovos,
      taxaConversao: pct(funil.agendaram, funil.conversas),
      taxaComparecimento: pct(funil.compareceram, funil.agendaram),
      taxaCancelamento: pct(porStatus.cancelada, consultas.length),
    };
  } catch (e: any) {
    console.warn("[db] metricasAvancadas falhou:", e.message);
    return vazio;
  }
}

// ---------- Lista de espera / encaixe ----------
export async function entrarListaEspera(e: {
  clinica_id: string;
  profissional_id?: string | null;
  telefone: string;
  nome?: string;
}) {
  return driver().insert("lista_espera", {
    id: uid(),
    clinica_id: e.clinica_id,
    profissional_id: e.profissional_id ?? null,
    telefone: e.telefone,
    nome: e.nome ?? null,
    avisado: B(false),
  });
}
// primeiro da fila ainda nao avisado: prioriza quem espera ESSE profissional,
// senao quem espera qualquer um (profissional_id null)
export async function proximoDaListaEspera(clinicaId: string, profissionalId?: string) {
  const fila = await driver().query("lista_espera", {
    eq: { clinica_id: clinicaId, avisado: B(false) },
    order: "criado_em",
    limit: 50,
  });
  return (
    fila.find((f: any) => profissionalId && f.profissional_id === profissionalId) ||
    fila.find((f: any) => !f.profissional_id) ||
    null
  );
}
export async function marcarAvisadoListaEspera(id: string) {
  return driver().update("lista_espera", id, { avisado: B(true) });
}

// ---------- Relatorios automaticos (dedup por chave) ----------
// Retorna true se AINDA NAO tinha sido enviado (pode mandar); false se ja foi.
export async function tentarMarcarRelatorio(clinicaId: string, chave: string): Promise<boolean> {
  try {
    await driver().insert("relatorios_enviados", { clinica_id: clinicaId, chave });
    return true;
  } catch (e: any) {
    if (ehConflitoUnico(e)) return false;
    console.error("[db] dedup de relatorio falhou (enviando mesmo assim):", e.message);
    return true;
  }
}

// ---------- Recall de retorno ----------
// consultas realizadas cujo FIM caiu na janela [deISO, ateISO) e que ainda nao
// receberam o convite de retorno
export async function consultasParaRecall(deISO: string, ateISO: string) {
  try {
    return await driver().query("consultas", {
      eq: { status: "realizada", recall_enviado: B(false) },
      gte: { fim: deISO },
      lt: { fim: ateISO },
      order: "fim",
    });
  } catch {
    return []; // coluna ainda nao migrada — recall so liga depois da migration
  }
}
export async function marcarRecallEnviado(id: string) {
  await driver().update("consultas", id, { recall_enviado: B(true) });
}
// o paciente ja tem consulta futura marcada? (nao faz sentido chamar pra retorno)
export async function pacienteTemConsultaFutura(pacienteId: string, agoraISO: string): Promise<boolean> {
  const futuras = await driver().query("consultas", {
    eq: { paciente_id: pacienteId },
    inList: { status: ["agendada", "confirmada"] },
    gte: { inicio: agoraISO },
    limit: 1,
  });
  return futuras.length > 0;
}

// ---------- Dedup de webhook ----------
// Marca um message_id como processado. Retorna true se ERA NOVO (processar),
// false se JA TINHA sido processado (a uazapi reenviou — ignorar). Atomico via
// unique constraint: se 2 requests chegarem juntos pro mesmo id, so um insere.
// FAIL-OPEN: qualquer erro que nao seja o conflito (ex: tabela ainda nao
// migrada em prod) loga e deixa processar — atender sem dedup e melhor que
// derrubar o atendimento inteiro.
export async function marcarEventoProcessado(messageId: string): Promise<boolean> {
  try {
    await driver().insert("webhook_eventos", { message_id: messageId });
    return true;
  } catch (e: any) {
    if (ehConflitoUnico(e)) return false;
    console.error("[db] dedup webhook falhou (processando sem dedup):", e.message);
    return true;
  }
}

// ---------- Lock por conversa (1 resposta da IA por vez por paciente) ----------
// Impede 2 mensagens do mesmo paciente rodarem 2 responder() em paralelo
// (respostas fora de ordem, consulta dupla). Adquire inserindo a linha
// (PRIMARY KEY trava a segunda); TTL de 60s pra lock morto (funcao caiu sem
// liberar) nao travar a conversa pra sempre. FAIL-OPEN em erro inesperado.
const CONVERSA_LOCK_TTL_MS = 60_000;
export async function adquirirLockConversa(clinicaId: string, telefone: string): Promise<boolean> {
  const agora = new Date().toISOString();
  try {
    await driver().insert("conversa_lock", {
      clinica_id: clinicaId,
      telefone,
      travado_em: agora,
    });
    return true;
  } catch (e: any) {
    if (!ehConflitoUnico(e)) {
      console.error("[db] lock de conversa falhou (seguindo sem lock):", e.message);
      return true;
    }
    // ja existe: checa se o lock esta morto (TTL vencido) e toma pra si
    const lock = await driver().selectOne("conversa_lock", { clinica_id: clinicaId, telefone });
    const travadoEm = lock?.travado_em ? new Date(lock.travado_em).getTime() : 0;
    if (Date.now() - travadoEm > CONVERSA_LOCK_TTL_MS) {
      await liberarLockConversa(clinicaId, telefone);
      try {
        await driver().insert("conversa_lock", { clinica_id: clinicaId, telefone, travado_em: agora });
        return true;
      } catch {
        return false; // outra request tomou primeiro
      }
    }
    return false;
  }
}
export async function liberarLockConversa(clinicaId: string, telefone: string): Promise<void> {
  try {
    const raw = driver().raw;
    if (IS_PG) {
      await raw.from("conversa_lock").delete().eq("clinica_id", clinicaId).eq("telefone", telefone);
    } else {
      raw.prepare("DELETE FROM conversa_lock WHERE clinica_id = ? AND telefone = ?").run(clinicaId, telefone);
    }
  } catch (e: any) {
    console.error("[db] liberar lock de conversa falhou:", e.message);
  }
}

// ---------- Lock das reguas (evita cron rodar 2x em paralelo) ----------
// Linha unica (id=1) com flag "rodando". tentarAdquirirLock so retorna true se
// conseguiu marcar rodando=1 partindo de rodando=0 (best-effort: sem CAS real
// no driver generico, mas a janela de corrida e minima e o pior caso e raro
// coincidir 2 crons no mesmo milissegundo).
export async function tentarAdquirirLockReguas(): Promise<boolean> {
  try {
    const lock = await driver().selectOne("reguas_lock", { id: 1 });
    if (!lock) return true; // sem linha de lock (nao deveria acontecer) — nao bloqueia
    // trava se ja esta rodando ha menos de 10min (acima disso, assume que travou
    // por erro/timeout e libera sozinho, senao um cron travado bloqueia pra sempre)
    if (isTrue(lock.rodando)) {
      const iniciado = lock.iniciado_em ? new Date(lock.iniciado_em).getTime() : 0;
      if (Date.now() - iniciado < 10 * 60000) return false;
    }
    await driver().update("reguas_lock", lock.id ?? 1, {
      rodando: B(true),
      iniciado_em: new Date().toISOString(),
    });
    return true;
  } catch (e: any) {
    // FAIL-OPEN: tabela ainda nao migrada nao pode parar as reguas
    console.error("[db] lock das reguas falhou (rodando sem lock):", e.message);
    return true;
  }
}
export async function liberarLockReguas(): Promise<void> {
  try {
    const lock = await driver().selectOne("reguas_lock", { id: 1 });
    if (lock) await driver().update("reguas_lock", lock.id, { rodando: B(false) });
  } catch (e: any) {
    console.error("[db] liberar lock das reguas falhou:", e.message);
  }
}

// ---------- Mensagens (memoria) ----------
export async function salvarMensagem(m: any) {
  return driver().insert("mensagens", {
    id: uid(),
    clinica_id: m.clinica_id,
    instancia_id: m.instancia_id ?? null,
    telefone: m.telefone,
    role: m.role,
    conteudo: m.conteudo,
    // 'humano' = atendente digitou pelo painel. Vazio = IA (todas as antigas).
    ...(m.origem ? { origem: m.origem } : {}),
  });
}

// ---------- Duvidas pro especialista (IA nao sabe -> secretaria responde) ----------
export async function criarDuvida(d: {
  clinica_id: string;
  telefone: string;
  pergunta_paciente: string;
  pergunta_ia: string;
}) {
  return driver().insert("duvidas", {
    id: uid(),
    clinica_id: d.clinica_id,
    telefone: d.telefone,
    pergunta_paciente: d.pergunta_paciente.slice(0, 1000),
    pergunta_ia: d.pergunta_ia.slice(0, 1000),
    status: "pendente",
  });
}
export async function getDuvida(id: string) {
  return driver().selectOne("duvidas", { id });
}
export async function listDuvidasPendentes(clinicaId: string, telefone?: string) {
  return driver().query("duvidas", {
    eq: { clinica_id: clinicaId, status: "pendente", ...(telefone ? { telefone } : {}) },
    order: "criado_em desc",
    limit: 50,
  });
}
export async function contarDuvidasPendentes(clinicaId: string): Promise<number> {
  const rows = await listDuvidasPendentes(clinicaId);
  return rows.length;
}
export async function marcarDuvidaRespondida(id: string, resposta: string, modo: "ia" | "manual") {
  return driver().update("duvidas", id, {
    resposta: resposta.slice(0, 2000),
    modo_resposta: modo,
    status: "respondida",
    respondida_em: IS_PG ? new Date().toISOString() : new Date().toISOString().slice(0, 19).replace("T", " "),
  });
}
// respostas recentes da equipe = APRENDIZADO: entram no prompt da IA pra ela
// decidir igual nos proximos casos parecidos (sem abrir duvida de novo)
export async function duvidasRespondidasRecentes(clinicaId: string, limite = 12) {
  return driver().query("duvidas", {
    eq: { clinica_id: clinicaId, status: "respondida" },
    order: "respondida_em desc",
    limit: limite,
  });
}
// observacoes da secretaria no card do paciente (lapis no resumo)
export async function salvarObservacoesPaciente(clinicaId: string, telefone: string, obs: string) {
  const p = await getOuCriaPaciente(clinicaId, telefone);
  return driver().update("pacientes", p.id, { observacoes: obs.slice(0, 2000) });
}

// ultima mensagem do PACIENTE nessa conversa — usada pelo debounce de rajada:
// o handler que segurou a espera confere se a mensagem dele ainda e a ultima
// (se chegou outra depois, quem responde e o handler da mais nova).
export async function ultimaMensagemUsuario(clinicaId: string, telefone: string) {
  const rows = await driver().query("mensagens", {
    eq: { clinica_id: clinicaId, telefone, role: "user" },
    order: "criado_em desc",
    limit: 1,
  });
  return rows[0] || null;
}

// ---------- Uso de tokens da IA (custo por clinica) ----------
// Soma o uso de UMA conversa (agregado das iteracoes) na linha do dia da
// clinica. Best-effort: falhar aqui NUNCA pode quebrar a resposta da IA.
export async function registrarUsoTokens(
  clinicaId: string,
  u: { input: number; output: number; cacheWrite?: number; cacheRead?: number; chamadas?: number }
): Promise<void> {
  try {
    const dia = hojeSPData(); // "YYYY-MM-DD" no fuso SP
    const inp = Math.max(0, Math.round(u.input || 0));
    const out = Math.max(0, Math.round(u.output || 0));
    const cw = Math.max(0, Math.round(u.cacheWrite || 0));
    const cr = Math.max(0, Math.round(u.cacheRead || 0));
    const ch = Math.max(1, Math.round(u.chamadas || 1));
    const raw = driver().raw;
    if (IS_PG) {
      await raw.rpc("incrementar_uso_tokens", {
        p_clinica: clinicaId, p_dia: dia, p_in: inp, p_out: out, p_cw: cw, p_cr: cr, p_ch: ch,
      }).then((r: any) => {
        // se a function nao existir ainda, cai no upsert manual
        if (r?.error) throw r.error;
      }).catch(async () => {
        const atual = await raw.from("uso_tokens").select("*").eq("clinica_id", clinicaId).eq("dia", dia).maybeSingle();
        const base = atual?.data || { input_tokens: 0, output_tokens: 0, cache_write: 0, cache_read: 0, chamadas: 0 };
        await raw.from("uso_tokens").upsert({
          clinica_id: clinicaId, dia,
          input_tokens: base.input_tokens + inp, output_tokens: base.output_tokens + out,
          cache_write: base.cache_write + cw, cache_read: base.cache_read + cr,
          chamadas: base.chamadas + ch,
        }, { onConflict: "clinica_id,dia" });
      });
    } else {
      raw.prepare(
        `INSERT INTO uso_tokens (clinica_id, dia, input_tokens, output_tokens, cache_write, cache_read, chamadas)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(clinica_id, dia) DO UPDATE SET
           input_tokens = input_tokens + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens,
           cache_write = cache_write + excluded.cache_write,
           cache_read = cache_read + excluded.cache_read,
           chamadas = chamadas + excluded.chamadas`
      ).run(clinicaId, dia, inp, out, cw, cr, ch);
    }
  } catch (e: any) {
    console.warn("[db] registrarUsoTokens falhou (ignorado):", e.message);
  }
}

// Soma o uso de tokens de uma clinica nos ultimos N dias (default: mes corrente).
// Retorna os tokens somados; o custo em R$ e calculado em quem chama (preco do modelo).
export async function usoTokensClinica(
  clinicaId: string,
  desdeDia?: string
): Promise<{ input: number; output: number; cacheWrite: number; cacheRead: number; chamadas: number; dias: number }> {
  const zero = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, chamadas: 0, dias: 0 };
  try {
    const raw = driver().raw;
    const desde = desdeDia || hojeSPData().slice(0, 7) + "-01"; // 1o dia do mes
    let linhas: any[] = [];
    if (IS_PG) {
      const r = await raw.from("uso_tokens").select("*").eq("clinica_id", clinicaId).gte("dia", desde);
      linhas = r?.data || [];
    } else {
      linhas = raw.prepare("SELECT * FROM uso_tokens WHERE clinica_id = ? AND dia >= ?").all(clinicaId, desde);
    }
    return linhas.reduce(
      (acc, l) => ({
        input: acc.input + (l.input_tokens || 0),
        output: acc.output + (l.output_tokens || 0),
        cacheWrite: acc.cacheWrite + (l.cache_write || 0),
        cacheRead: acc.cacheRead + (l.cache_read || 0),
        chamadas: acc.chamadas + (l.chamadas || 0),
        dias: acc.dias + 1,
      }),
      { ...zero }
    );
  } catch (e: any) {
    console.warn("[db] usoTokensClinica falhou:", e.message);
    return zero;
  }
}
// Quantas mensagens de TESTE (telefone 0000..., simulador) a clinica mandou na
// ultima hora — cota do /api/testar-ia (cada teste queima credito da Claude).
// Filtra a janela no banco e o prefixo em JS (o volume de 1h por clinica e pequeno).
export async function mensagensDeTesteNaUltimaHora(clinicaId: string): Promise<number> {
  const desde = new Date(Date.now() - 60 * 60000);
  const desdeStr = IS_PG ? desde.toISOString() : desde.toISOString().slice(0, 19).replace("T", " ");
  const naJanela = await driver().query("mensagens", {
    eq: { clinica_id: clinicaId, role: "user" },
    gte: { criado_em: desdeStr },
  });
  return naJanela.filter((m: any) => String(m.telefone || "").startsWith("0000")).length;
}

// Mensagens de uma clinica num periodo (raio-x do trial: quem respondeu o que,
// e o que ficou sem resposta). Ignora numeros de teste (prefixo 0000).
export async function mensagensDoPeriodo(clinicaId: string, desdeISO: string) {
  const desde = IS_PG ? desdeISO : desdeISO.replace("T", " ");
  const rows = await driver().query("mensagens", {
    eq: { clinica_id: clinicaId },
    gte: { criado_em: desde },
  });
  return rows.filter((m: any) => !String(m.telefone || "").startsWith("0000"));
}

// Pacientes da clinica (sem os numeros de teste) — pro raio-x saber quem esta
// com a IA pausada e o nome de quem ficou esperando resposta.
export async function pacientesDaClinica(clinicaId: string) {
  const pacs = await driver().selectMany("pacientes", { clinica_id: clinicaId });
  return pacs.filter((p: any) => !String(p.telefone || "").startsWith("0000"));
}

export async function historicoConversa(clinicaId: string, telefone: string, limite = 20) {
  // pega as ultimas N no banco (order desc + limit) em vez de puxar tudo
  const ultimas = await driver().query("mensagens", {
    eq: { clinica_id: clinicaId, telefone },
    order: "criado_em desc",
    limit: limite,
  });
  // volta pra ordem cronologica
  return ultimas
    .reverse()
    .map((m: any) => ({ role: m.role, conteudo: m.conteudo }));
}

// Apaga o historico de conversa de um paciente (as mensagens) e reativa a IA —
// pro proximo "oi" a IA tratar como conversa NOVA (util pra TESTAR com um numero
// que ja tem historico, sem a IA continuar de onde parou).
export async function limparConversa(clinicaId: string, telefone: string): Promise<number> {
  const raw = driver().raw;
  let apagadas = 0;
  if (IS_PG) {
    const r = await raw.from("mensagens").delete({ count: "exact" }).eq("clinica_id", clinicaId).eq("telefone", telefone);
    apagadas = r?.count ?? 0;
  } else {
    const res = raw.prepare("DELETE FROM mensagens WHERE clinica_id = ? AND telefone = ?").run(clinicaId, telefone);
    apagadas = res?.changes ?? 0;
  }
  // reativa a IA pra esse paciente (se estava pausada) e limpa o resumo em cache
  await pausarIAPaciente(clinicaId, telefone, false).catch(() => {});
  return apagadas;
}

// Lista os telefones distintos que conversaram com a clinica, mais recentes
// primeiro, com a ultima mensagem + timestamp (pra tela de Conversas).
// Agrega em JS: a base de mensagens de uma clinica cabe tranquilo em memoria
// (piloto) e o driver nao tem GROUP BY generico. Se crescer, vira uma view/SQL.
// Lista as conversas (1 linha por telefone: ultima mensagem + quando).
// ESCALA: em vez de puxar a tabela inteira de mensagens (dezenas de milhares
// com 30 clinicas), busca so as N mensagens mais RECENTES da clinica (order
// desc + limit) e agrega por telefone. Cobre o caso real (ver conversas
// recentes). Pra historico exaustivo, o ideal futuro e uma RPC no Supabase
// com DISTINCT ON (telefone) — deixado como evolucao.
export async function listarConversas(clinicaId: string) {
  const recentes = await driver().query("mensagens", {
    eq: { clinica_id: clinicaId },
    order: "criado_em desc", // mais novas primeiro
    limit: JANELA_CONVERSAS,
  });
  const porTelefone = new Map<
    string,
    {
      telefone: string;
      nome: string | null;
      fotoUrl: string | null;
      ultimaMensagem: string;
      ultimoRole: string;
      quando: string;
      total: number;
      naoLida: boolean;
      importante: boolean;
      /** true = atendente humano assumiu (IA pausada); false = IA atendendo */
      humano: boolean;
      /** quando o PACIENTE falou por ultimo (interno: decide o "nao lida") */
      ultimaDoPaciente?: string;
      /** quando a CLINICA respondeu por ultimo (interno) */
      ultimaDaClinica?: string;
    }
  >();
  // como vem desc, a PRIMEIRA que aparece de cada telefone e a mais recente
  for (const m of recentes) {
    let atual = porTelefone.get(m.telefone);
    if (atual) {
      atual.total += 1;
    } else {
      atual = {
        telefone: m.telefone,
        nome: null,
        fotoUrl: null,
        ultimaMensagem: m.conteudo,
        ultimoRole: m.role,
        quando: m.criado_em,
        total: 1,
        naoLida: false,
        importante: false,
        humano: false,
      };
      porTelefone.set(m.telefone, atual);
    }
    // guarda o horario da ultima fala de CADA lado. Nao dependemos da ordem
    // relativa entre os dois: o SQLite grava criado_em com precisao de
    // SEGUNDO, entao pergunta e resposta no mesmo segundo empatam e a ordem
    // do SELECT vira indefinida. Comparar os dois lados por timestamp e o
    // criterio estavel (ver o calculo de naoLida abaixo).
    if (m.role === "user") atual.ultimaDoPaciente ??= m.criado_em;
    else if (m.role === "assistant") atual.ultimaDaClinica ??= m.criado_em;
  }
  // anexa o cadastro do paciente: nome (a busca acha por nome), foto do
  // WhatsApp, estrela de importante e o marcador de leitura.
  const pacs = await driver().selectMany("pacientes", { clinica_id: clinicaId });
  const porTel = new Map(pacs.map((p: any) => [p.telefone, p]));
  for (const c of porTelefone.values()) {
    const p: any = porTel.get(c.telefone);
    if (!p) continue;
    // nome que o paciente disse pra IA tem prioridade sobre o do WhatsApp
    c.nome = p.nome || p.wa_nome || null;
    c.fotoUrl = p.wa_foto_url || null;
    c.importante = isTrue(p.importante);
    // quem esta atendendo agora: ia_pausada = atendente humano assumiu
    c.humano = isTrue(p.ia_pausada);
    // NAO LIDA quando o paciente falou por ultimo (ninguem respondeu depois) e
    // a recepcao nao abriu a conversa desde entao. Sem lido_ate (migration
    // pendente ou conversa nunca aberta), a mensagem do paciente conta como
    // nao lida. Empate de timestamp entre pergunta e resposta conta como
    // RESPONDIDA — no pior caso deixamos de sinalizar algo ja tratado, melhor
    // que encher a aba de pendencia falsa.
    const doPaciente = tsMs(c.ultimaDoPaciente);
    const daClinica = tsMs(c.ultimaDaClinica);
    const aguardandoResposta = doPaciente > 0 && doPaciente > daClinica;
    c.naoLida = aguardandoResposta && (!p.lido_ate || tsMs(p.lido_ate) < doPaciente);
  }
  // ja em ordem de recencia (o Map preservou a ordem de insercao = desc).
  // Os carimbos por lado eram so pra calcular naoLida — nao vao pra tela.
  return Array.from(porTelefone.values()).map(({ ultimaDoPaciente, ultimaDaClinica, ...c }) => c);
}

// Conversa completa de um telefone (SEM o limite de 20 do historicoConversa),
// em ordem cronologica, com timestamp pra montar as bolhas na tela.
export async function conversaCompleta(clinicaId: string, telefone: string) {
  const msgs = await driver().query("mensagens", {
    eq: { clinica_id: clinicaId, telefone },
    order: "criado_em",
  });
  return msgs.map((m: any) => ({
    role: m.role,
    conteudo: m.conteudo,
    quando: m.criado_em,
    origem: m.origem || null,
  }));
}

// EXAMES marcados pela IA no nosso banco (a "agenda de exames do Facilita").
// A Pulmonar NAO tem espelho de exame na Feegow (desligado 22/07 — agendamento
// criado por API fica invisivel na Agenda de Equipamentos deles). Entao esses
// exames vivem SO aqui e a recepcao lanca manualmente na Feegow. Sem isso a
// aba "Agenda de exames" so mostrava o que ja estava na Feegow e o exame
// marcado pela IA sumia (reclamacao real da Cibele, 21/08).
// Exame = consulta com guia_url ou observacao de exame; nunca cancelada.
export async function examesMarcadosPelaIA(clinicaId: string, deISO: string, ateISO: string) {
  const consultas = await driver().query("consultas", {
    eq: { clinica_id: clinicaId },
    gte: { inicio: deISO },
    lte: { inicio: ateISO },
  });
  const validas = consultas.filter((c: any) => c.status !== "cancelada");
  if (validas.length === 0) return [];
  // nome/telefone do paciente pra recepcao conseguir lancar na Feegow
  const pacientes = await driver().selectMany("pacientes", { clinica_id: clinicaId });
  const porId = new Map(pacientes.map((p: any) => [p.id, p]));
  return validas.map((c: any) => {
    const p: any = porId.get(c.paciente_id);
    return {
      id: c.id,
      inicio: c.inicio,
      fim: c.fim,
      status: c.status,
      observacao: c.observacao || "",
      guiaUrl: c.guia_url || null,
      pacienteNome: p?.nome || p?.wa_nome || "",
      pacienteTelefone: p?.telefone || "",
      pacienteCpf: p?.cpf || "",
      pacienteNascimento: p?.nascimento || "",
      pagamento: c.pagamento || null,
      convenioNome: c.convenio_nome || null,
      feegowAgendamentoId: c.feegow_agendamento_id || null,
    };
  });
}


// Guarda CPF/nascimento do paciente (a recepcao precisa disso pra cadastrar no
// sistema da clinica quando o paciente ainda nao existe la). Update cirurgico:
// so grava o que veio, nunca apaga o que ja estava.
export async function salvarCadastroPaciente(
  clinicaId: string,
  telefone: string,
  dados: { cpf?: string; nascimento?: string }
) {
  const p = await getPacientePorTelefone(clinicaId, telefone);
  if (!p) return null;
  const campos: any = {};
  if (dados.cpf) campos.cpf = String(dados.cpf).replace(/\D/g, "").slice(0, 11);
  if (dados.nascimento) campos.nascimento = String(dados.nascimento).slice(0, 10);
  if (Object.keys(campos).length === 0) return p;
  return driver().update("pacientes", p.id, campos);
}
