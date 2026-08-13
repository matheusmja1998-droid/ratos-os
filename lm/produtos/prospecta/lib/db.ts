// Prospecta — camada de dados multi-tenant (Supabase/Postgres).
// REGRA DE OURO: toda funcao que le/escreve dados de conta RECEBE contaId e
// filtra por ele. Nunca uma conta enxerga dados de outra.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_KEY || "";
export const supabaseConfigurado = () => Boolean(URL && KEY);

// Client PREGUICOSO: so cria na 1a chamada. Assim o build da Vercel (que coleta
// as rotas sem env de runtime) nao quebra com "supabaseUrl is required".
let _sb: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (!_sb) {
    if (!URL || !KEY) throw new Error("Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
    _sb = createClient(URL, KEY, { auth: { persistSession: false } });
  }
  return _sb;
}
// proxy pra manter o mesmo uso `sb.from(...)` no resto do arquivo
export const sb: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) { return (client() as any)[prop]; },
});

// ---------- CONTAS ----------
export async function criarConta(dados: {
  nome?: string; email: string; senha_hash: string; papel?: string;
}) {
  const trialAte = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await sb.from("contas").insert({
    nome: dados.nome ?? null,
    email: dados.email.toLowerCase().trim(),
    senha_hash: dados.senha_hash,
    papel: dados.papel ?? "cliente",
    plano: "trial",
    trial_ate: trialAte,
    whatsapps_limite: 1,
  }).select("id, email, papel, plano").single();
  if (error) throw error;
  return data;
}

export async function contaPorEmail(email: string) {
  const { data } = await sb.from("contas").select("*")
    .eq("email", email.toLowerCase().trim()).maybeSingle();
  return data;
}

export async function contaPorId(id: string) {
  const { data } = await sb.from("contas").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function atualizarConta(id: string, campos: Record<string, any>) {
  const { error } = await sb.from("contas").update(campos).eq("id", id);
  if (error) throw error;
}

export async function listarContas() {
  const { data } = await sb.from("contas")
    .select("id, nome, email, papel, plano, whatsapps_limite, trial_ate, assinatura_status, criado_em")
    .order("criado_em", { ascending: false });
  return data || [];
}

// ---------- CONFIG (cerebro por conta) ----------
export async function getConfig(contaId: string, chave: string, def = "") {
  const { data } = await sb.from("config").select("valor")
    .eq("conta_id", contaId).eq("chave", chave).maybeSingle();
  return data?.valor ?? def;
}
export async function setConfig(contaId: string, chave: string, valor: string) {
  const { error } = await sb.from("config")
    .upsert({ conta_id: contaId, chave, valor: String(valor ?? "") }, { onConflict: "conta_id,chave" });
  if (error) throw error;
}
export async function getConfigMuitas(contaId: string, chaves: string[]) {
  const { data } = await sb.from("config").select("chave, valor")
    .eq("conta_id", contaId).in("chave", chaves);
  const out: Record<string, string> = {};
  for (const c of chaves) out[c] = "";
  for (const row of data || []) out[row.chave] = row.valor ?? "";
  return out;
}

// ---------- INSTANCIAS (multi-WhatsApp) ----------
export async function listarInstancias(contaId: string) {
  const { data } = await sb.from("instancias").select("*")
    .eq("conta_id", contaId).order("ordem", { ascending: true });
  return data || [];
}
export async function criarInstanciaDB(contaId: string, nome: string) {
  const { data } = await sb.from("instancias")
    .insert({ conta_id: contaId, nome, status: "desconectado" }).select("*").single();
  return data;
}
export async function atualizarInstancia(id: string, campos: Record<string, any>) {
  await sb.from("instancias").update(campos).eq("id", id);
}
export async function instanciasConectadas(contaId: string) {
  const { data } = await sb.from("instancias").select("*")
    .eq("conta_id", contaId).eq("status", "conectado").order("ordem", { ascending: true });
  return data || [];
}

// ---------- LEADS ----------
const soDigitos = (t: string) => String(t || "").replace(/\D/g, "");
// nono digito BR: casa "5547992056022" e "554792056022"
function variantesTelefone(tel: string): string[] {
  const t = soDigitos(tel), v = new Set([t]);
  if (/^55\d{10}$/.test(t)) v.add(t.slice(0, 4) + "9" + t.slice(4));
  if (/^55\d{2}9\d{8}$/.test(t)) v.add(t.slice(0, 4) + t.slice(5));
  return [...v];
}

export async function upsertLead(contaId: string, l: any) {
  const tel = soDigitos(l.telefone);
  if (!tel) return null;
  const { data: existe } = await sb.from("leads").select("id")
    .eq("conta_id", contaId).in("telefone", variantesTelefone(tel)).maybeSingle();
  if (existe) return existe.id;
  const { data } = await sb.from("leads").insert({
    conta_id: contaId, nome_empresa: l.nome_empresa || "Empresa", telefone: tel,
    cidade: l.cidade ?? null, nicho: l.nicho ?? null, site: l.site ?? null,
    origem_lista: l.origem_lista ?? null,
  }).select("id").single();
  return data?.id ?? null;
}

export async function getLead(contaId: string, id: string) {
  const { data } = await sb.from("leads").select("*")
    .eq("conta_id", contaId).eq("id", id).maybeSingle();
  return data;
}
export async function getLeadPorTelefone(contaId: string, tel: string) {
  const { data } = await sb.from("leads").select("*")
    .eq("conta_id", contaId).in("telefone", variantesTelefone(tel)).maybeSingle();
  return data;
}
export async function atualizarLead(contaId: string, id: string, campos: Record<string, any>) {
  const permitidos = ["status", "nome_contato", "eh_responsavel", "audio_enviado", "dor",
    "info_extra", "motivo_perda", "ia_pausada", "nome_empresa", "cidade", "nicho",
    "telefone_decisor", "followup_em", "followup_msg"];
  const patch: Record<string, any> = { atualizado_em: new Date().toISOString() };
  for (const k of permitidos) if (campos[k] !== undefined) patch[k] = campos[k];
  await sb.from("leads").update(patch).eq("conta_id", contaId).eq("id", id);
}
export async function listarLeads(contaId: string, opts: { status?: string } = {}) {
  let q = sb.from("leads").select("*").eq("conta_id", contaId);
  if (opts.status) q = q.eq("status", opts.status);
  const { data } = await q.order("atualizado_em", { ascending: false }).limit(1000);
  return data || [];
}

// ---------- MENSAGENS ----------
export async function salvarMensagem(contaId: string, leadId: string, role: string, texto: string, tipo = "texto") {
  await sb.from("mensagens").insert({ conta_id: contaId, lead_id: leadId, role, texto, tipo });
}
export async function historicoLead(contaId: string, leadId: string, limite = 60) {
  const { data } = await sb.from("mensagens").select("role, texto, tipo, criado_em")
    .eq("conta_id", contaId).eq("lead_id", leadId).order("criado_em", { ascending: true }).limit(limite);
  return data || [];
}

// ---------- BLOCKLIST ----------
export async function naBlocklist(contaId: string, tel: string) {
  const { data } = await sb.from("blocklist").select("telefone")
    .eq("conta_id", contaId).in("telefone", variantesTelefone(tel)).maybeSingle();
  return Boolean(data);
}
export async function bloquear(contaId: string, tel: string, motivo: string) {
  await sb.from("blocklist").upsert({ conta_id: contaId, telefone: soDigitos(tel), motivo });
}

// ---------- EVENTOS ----------
export async function registrarEvento(contaId: string, leadId: string | null, tipo: string, detalhe = "") {
  await sb.from("eventos").insert({ conta_id: contaId, lead_id: leadId, tipo, detalhe });
}

// ---------- DEDUP WEBHOOK ----------
export async function webhookJaVisto(messageId: string | null) {
  if (!messageId) return false;
  const { error } = await sb.from("webhook_eventos").insert({ message_id: messageId });
  return Boolean(error); // PK duplicada = ja visto
}

// ---------- CAMPANHAS ----------
export async function listarCampanhas(contaId: string) {
  const { data } = await sb.from("campanhas").select("*").eq("conta_id", contaId).order("criado_em", { ascending: false });
  return data || [];
}
export async function campanhaAtiva(contaId: string) {
  const { data } = await sb.from("campanhas").select("*").eq("conta_id", contaId).eq("status", "ativa").limit(1).maybeSingle();
  return data;
}
export async function criarCampanha(contaId: string, c: any) {
  const { data } = await sb.from("campanhas").insert({
    conta_id: contaId, nome: c.nome, teto_dia: c.teto_dia ?? 25,
    cadencia_min_seg: c.cadencia_min_seg ?? 180, cadencia_max_seg: c.cadencia_max_seg ?? 420,
    janela_inicio: c.janela_inicio ?? "08:30", janela_fim: c.janela_fim ?? "18:00",
  }).select("id").single();
  return data?.id;
}
export async function atualizarCampanha(contaId: string, id: string, campos: any) {
  await sb.from("campanhas").update(campos).eq("conta_id", contaId).eq("id", id);
}
export async function templatesDaCampanha(contaId: string, campanhaId: string, tipo = "abertura") {
  const { data } = await sb.from("templates").select("*").eq("conta_id", contaId).eq("campanha_id", campanhaId).eq("tipo", tipo);
  return data || [];
}
export async function setTemplates(contaId: string, campanhaId: string, tipo: string, textos: string[]) {
  await sb.from("templates").delete().eq("conta_id", contaId).eq("campanha_id", campanhaId).eq("tipo", tipo);
  const rows = textos.filter(Boolean).map((texto) => ({ conta_id: contaId, campanha_id: campanhaId, tipo, texto }));
  if (rows.length) await sb.from("templates").insert(rows);
}
export async function vincularLeadsNovos(contaId: string, campanhaId: string) {
  const { data: leads } = await sb.from("leads").select("id").eq("conta_id", contaId).eq("status", "novo");
  if (!leads?.length) return 0;
  const rows = leads.map((l) => ({ campanha_id: campanhaId, lead_id: l.id }));
  await sb.from("campanha_leads").upsert(rows, { onConflict: "campanha_id,lead_id", ignoreDuplicates: true });
  return leads.length;
}

// disparos REAIS de hoje (evento 'disparo') — sem_whatsapp nao conta
export async function disparosHoje(contaId: string) {
  const inicioDia = new Date(); inicioDia.setUTCHours(3, 0, 0, 0); // ~00h BRT
  const { count } = await sb.from("eventos").select("id", { count: "exact", head: true })
    .eq("conta_id", contaId).eq("tipo", "disparo").gte("criado_em", inicioDia.toISOString());
  return count || 0;
}
// proximo lead pra disparar numa campanha (nao disparado, status novo, nao bloqueado)
export async function proximoLeadPraDisparo(contaId: string, campanhaId: string) {
  const { data } = await sb.rpc("proximo_lead_disparo", { p_conta: contaId, p_campanha: campanhaId }).maybeSingle?.() ?? { data: null };
  if (data) return data;
  // fallback sem RPC: join manual
  const { data: cl } = await sb.from("campanha_leads").select("lead_id")
    .eq("campanha_id", campanhaId).is("disparado_em", null).limit(50);
  if (!cl?.length) return null;
  for (const row of cl) {
    const lead = await getLead(contaId, row.lead_id);
    if (lead && lead.status === "novo" && !(await naBlocklist(contaId, lead.telefone))) return lead;
  }
  return null;
}
export async function marcarDisparado(campanhaId: string, leadId: string) {
  await sb.from("campanha_leads").update({ disparado_em: new Date().toISOString() }).eq("campanha_id", campanhaId).eq("lead_id", leadId);
}

// ---------- METRICAS ----------
export async function metricas(contaId: string) {
  const conta = async (tipo: string) => {
    const { count } = await sb.from("eventos").select("id", { count: "exact", head: true })
      .eq("conta_id", contaId).eq("tipo", tipo);
    return count || 0;
  };
  const { data: porStatusRaw } = await sb.from("leads").select("status")
    .eq("conta_id", contaId);
  const porStatus: Record<string, number> = {};
  for (const r of porStatusRaw || []) porStatus[r.status] = (porStatus[r.status] || 0) + 1;
  return {
    disparos: await conta("disparo"),
    respostas: await conta("resposta"),
    reunioes: await conta("reuniao"),
    optouts: await conta("optout"),
    porStatus,
  };
}
