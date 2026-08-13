// Conector uazapi (Prospecta). Servidor uazapi compartilhado; cada INSTANCIA
// (WhatsApp) tem seu token proprio, guardado em instancias.uazapi_token por conta.
const UAZAPI_URL = process.env.UAZAPI_URL || "";
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const APP_URL = process.env.APP_URL || "";

export const uazapiConfigurada = () => Boolean(UAZAPI_URL);

export function markdownParaWhatsapp(texto: string): string {
  return String(texto || "")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/__([^_\n]+)__/g, "_$1_");
}

type Envio = { ok: boolean; demo?: boolean; erro?: string; raw?: any };

export async function enviarTexto(token: string, telefone: string, texto: string): Promise<Envio> {
  const t = markdownParaWhatsapp(texto);
  if (!uazapiConfigurada()) { console.log(`[uazapi DEMO] -> ${telefone}: ${t}`); return { ok: true, demo: true }; }
  try {
    const res = await fetch(`${UAZAPI_URL}/send/text`, {
      method: "POST", headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: telefone, text: t }), signal: AbortSignal.timeout(15000),
    });
    const raw = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, raw } : { ok: false, erro: `HTTP ${res.status}`, raw };
  } catch (e: any) { return { ok: false, erro: e.message }; }
}

export async function mostrarDigitando(token: string, telefone: string): Promise<void> {
  if (!uazapiConfigurada()) return;
  try {
    await fetch(`${UAZAPI_URL}/message/presence`, {
      method: "POST", headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: telefone, presence: "composing" }), signal: AbortSignal.timeout(5000),
    });
  } catch { /* best-effort */ }
}

export async function enviarMidia(token: string, telefone: string, m: { tipo: string; arquivo: string; nomeArquivo?: string }): Promise<Envio> {
  if (!uazapiConfigurada()) return { ok: true, demo: true };
  try {
    const res = await fetch(`${UAZAPI_URL}/send/media`, {
      method: "POST", headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: telefone, type: m.tipo, file: m.arquivo, ...(m.nomeArquivo ? { docName: m.nomeArquivo } : {}) }),
      signal: AbortSignal.timeout(30000),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (typeof raw?.message === "string" && raw.message) || (typeof raw?.error === "string" && raw.error) || `HTTP ${res.status}`;
      return { ok: false, erro: msg, raw };
    }
    return { ok: true, raw };
  } catch (e: any) { return { ok: false, erro: e.message }; }
}

// webhook aponta pra /api/webhook?secret=...&conta=<id>&inst=<id> (multi-tenant:
// o proprio webhook ja sabe de quem e a mensagem sem precisar casar numero)
export async function configurarWebhook(token: string, contaId: string, instanciaId: string): Promise<boolean> {
  if (!uazapiConfigurada() || !WEBHOOK_SECRET || !APP_URL) return false;
  try {
    const url = `${APP_URL}/api/webhook?secret=${WEBHOOK_SECRET}&conta=${contaId}&inst=${instanciaId}`;
    const res = await fetch(`${UAZAPI_URL}/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ url, enabled: true, events: ["messages"], addUrlTypesMedia: ["audio", "image", "video", "document", "ptt"], excludeMessages: [] }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

export async function criarInstancia(nome: string): Promise<{ token?: string; erro?: string; demo?: boolean }> {
  if (!uazapiConfigurada()) return { token: `demo-${nome}`, demo: true };
  try {
    const res = await fetch(`${UAZAPI_URL}/instance/init`, {
      method: "POST", headers: { "Content-Type": "application/json", admintoken: UAZAPI_ADMIN_TOKEN },
      body: JSON.stringify({ name: nome }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) return { erro: raw?.error || raw?.message || `HTTP ${res.status}` };
    return { token: raw?.token || raw?.instance?.token };
  } catch (e: any) { return { erro: e.message }; }
}

export const statusConectado = (s?: string) => s === "connected" || s === "open" || s === "conectado";

export async function statusInstanciaLive(token: string): Promise<{ conectado: boolean; status: string }> {
  if (!uazapiConfigurada()) return { conectado: true, status: "demo" };
  try {
    const res = await fetch(`${UAZAPI_URL}/instance/status`, { headers: { token }, signal: AbortSignal.timeout(8000) });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) return { conectado: false, status: String(raw?.message || raw?.error || `HTTP ${res.status}`) };
    const i = raw?.instance || raw;
    const st = String(i?.status || "desconhecido");
    return { conectado: statusConectado(st), status: st };
  } catch (e: any) { return { conectado: false, status: e.message }; }
}

export async function conectarInstancia(token: string): Promise<{ status: string; qrcode?: string | null; paircode?: string | null; owner?: string; tokenInvalido?: boolean }> {
  if (!uazapiConfigurada()) return { status: "demo", qrcode: null };
  try {
    const res = await fetch(`${UAZAPI_URL}/instance/connect`, {
      method: "POST", headers: { "Content-Type": "application/json", token }, body: JSON.stringify({}),
    });
    const raw = await res.json().catch(() => ({}));
    const msgErro = String(raw?.error || raw?.message || "").toLowerCase();
    if (res.status === 401 || res.status === 403 || msgErro.includes("invalid token"))
      return { status: "token_invalido", tokenInvalido: true };
    if (!res.ok) return { status: "erro" };
    const i = raw?.instance || raw;
    return { status: i?.status || "desconhecido", qrcode: i?.qrcode || null, paircode: i?.paircode || null, owner: i?.owner };
  } catch { return { status: "erro" }; }
}

export async function checarWhatsapp(token: string, telefone: string): Promise<{ temWhatsapp: boolean | null; numeroCorrigido?: string; erro?: string }> {
  if (!uazapiConfigurada()) return { temWhatsapp: true, numeroCorrigido: telefone };
  try {
    const res = await fetch(`${UAZAPI_URL}/chat/check`, {
      method: "POST", headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ numbers: [telefone] }), signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { temWhatsapp: null, erro: `HTTP ${res.status}` };
    const arr = await res.json().catch(() => []);
    const r = Array.isArray(arr) ? arr[0] : arr;
    const jid = String(r?.jid || "");
    return { temWhatsapp: Boolean(r?.isInWhatsapp), numeroCorrigido: jid ? jid.replace(/@.*$/, "").replace(/\D/g, "") : telefone };
  } catch (e: any) { return { temWhatsapp: null, erro: e.message }; }
}

export function parseWebhook(body: any) {
  const msg = body?.message || body?.data?.message || body;
  if (!msg) return null;
  const fromMe = Boolean(msg.fromMe ?? msg.key?.fromMe);
  const enviadaPelaApi = Boolean(msg.fromApi ?? msg.wasSentByApi ?? msg.sentByApi ?? msg.api ?? (typeof msg.source === "string" && /api/i.test(msg.source)));
  const chatidRaw = String(msg.chatid || msg.sender || msg.from || msg.key?.remoteJid || "");
  const ehGrupo = chatidRaw.includes("@g.us") || Boolean(msg.isGroup) || Boolean(msg.isgroup) || Boolean(msg.key?.remoteJid?.includes?.("@g.us"));
  const textoRaw = msg.text ?? msg.body ?? msg.caption ?? msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? msg.message?.imageMessage?.caption ?? msg.message?.videoMessage?.caption ?? msg.message?.documentMessage?.caption ?? "";
  const texto = typeof textoRaw === "string" ? textoRaw : "";
  const messageId = String(msg.id || msg.messageid || msg.messageId || msg.key?.id || msg.message?.key?.id || "") || null;
  const chatid = msg.chatid || msg.sender || msg.from || msg.key?.remoteJid || "";
  const telefone = String(chatid).replace(/@.*$/, "").replace(/\D/g, "");
  const rawTipo = String(msg.messageType || msg.type || Object.keys(msg.message || {})[0] || "").toLowerCase();
  let tipo: "texto" | "audio" | "imagem" | "figurinha" | "outro" = "texto";
  if (!texto) {
    if (rawTipo.includes("sticker")) tipo = "figurinha";
    else if (rawTipo.includes("audio") || rawTipo.includes("ptt")) tipo = "audio";
    else if (rawTipo.includes("image") || rawTipo.includes("imagem")) tipo = "imagem";
    else tipo = "outro";
  }
  if (!telefone) return null;
  return { telefone, texto, tipo, fromMe, enviadaPelaApi, ehGrupo, messageId };
}
