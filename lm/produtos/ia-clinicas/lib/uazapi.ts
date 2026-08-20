// Conector uazapi — envio de mensagem e gestao de instancia.
// Docs: https://docs.uazapi.com  (endpoints tipicos abaixo)
//
// MODO DEMO: sem UAZAPI_URL configurada, o envio vira console.log e o app
// funciona 100% (simulador). Ao plugar a conta, so setar as env vars.

import { upsertInstancia } from "./db";

const UAZAPI_URL = process.env.UAZAPI_URL || "";
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || "";

export const uazapiConfigurada = () => Boolean(UAZAPI_URL);

type EnvioResultado = { ok: boolean; demo?: boolean; erro?: string; raw?: any };

/**
 * Envia mensagem de texto por uma instancia.
 * @param instanceToken token da instancia (guardado em instancias.uazapi_token)
 * @param telefone      destino em formato E.164 sem "+" (ex: 5535999998888)
 */
// Converte markdown (que a IA gera) pra formatacao do WhatsApp:
//  - negrito: **texto** (markdown) -> *texto* (WhatsApp usa 1 asterisco)
//  - italico __texto__ -> _texto_
// Feito na saida pra o paciente ver *negrito* de verdade, nao "**negrito**".
export function markdownParaWhatsapp(texto: string): string {
  return String(texto || "")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*") // **negrito** -> *negrito*
    .replace(/__([^_\n]+)__/g, "_$1_"); // __italico__ -> _italico_
}

export async function enviarTexto(
  instanceToken: string,
  telefone: string,
  texto: string
): Promise<EnvioResultado> {
  const textoFmt = markdownParaWhatsapp(texto); // ajusta negrito pro WhatsApp
  if (!uazapiConfigurada()) {
    console.log(`[uazapi DEMO] -> ${telefone}: ${textoFmt}`);
    return { ok: true, demo: true };
  }
  try {
    const res = await fetch(`${UAZAPI_URL}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: instanceToken,
      },
      body: JSON.stringify({ number: telefone, text: textoFmt }),
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, erro: `HTTP ${res.status}`, raw };
    return { ok: true, raw };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

/**
 * Mostra "digitando..." no WhatsApp do paciente (presence composing).
 * Best-effort: nunca lanca. O WhatsApp mostra "digitando" por alguns segundos.
 */
export async function mostrarDigitando(instanceToken: string, telefone: string): Promise<void> {
  if (!uazapiConfigurada()) return;
  try {
    await fetch(`${UAZAPI_URL}/message/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ number: telefone, presence: "composing" }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    /* best-effort */
  }
}

// URL do nosso webhook (com o secret) pra uazapi mandar as mensagens recebidas.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const APP_URL = process.env.APP_URL || "https://ia-clinicas.vercel.app";
function nossaUrlWebhook(): string {
  return `${APP_URL}/api/webhook${WEBHOOK_SECRET ? `?secret=${WEBHOOK_SECRET}` : ""}`;
}

/**
 * Configura o webhook da instancia pra apontar pro nosso /api/webhook.
 * CRITICO: sem isso, o WhatsApp conecta mas a IA nunca recebe as mensagens
 * (a uazapi nao sabe pra onde mandar). Chamado ao criar e ao conectar.
 * Best-effort: nao lanca (a conexao nao pode falhar so por isso).
 */
export async function configurarWebhook(instanceToken: string): Promise<boolean> {
  if (!uazapiConfigurada() || !WEBHOOK_SECRET) return false;
  try {
    const res = await fetch(`${UAZAPI_URL}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({
        url: nossaUrlWebhook(),
        enabled: true,
        events: ["messages"],
        // NAO ligar addUrlTypesMessages/addUrlEvents aqui: testado 20/08 em
        // producao e a ENTREGA dos webhooks PAROU (mensagem nenhuma chegava;
        // atendimento da Pulmonar ficou mudo ate reverter). A midia e baixada
        // pelo /message/download com retry (lib/transcrever.ts) — o payload
        // padrao ja traz o message id, que e o que precisamos.
        excludeMessages: [],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch (e: any) {
    console.warn("[uazapi] falha ao configurar webhook:", e.message);
    return false;
  }
}

/**
 * Envia MIDIA (audio gravado, documento, imagem) pro paciente via uazapi.
 * `arquivo` e um data-URL (data:mime;base64,...) ou URL http.
 * tipo "audio" = nota de voz no WhatsApp (aquela bolinha de play);
 * "document" = arquivo anexado com nome; "image" = foto no chat.
 * Best-effort: retorna ok=false com erro em falha (quem chama avisa o atendente).
 */
export async function enviarMidia(
  instanceToken: string,
  telefone: string,
  m: { tipo: "audio" | "document" | "image"; arquivo: string; nomeArquivo?: string }
): Promise<EnvioResultado> {
  if (!uazapiConfigurada()) {
    console.log(`[uazapi DEMO] midia ${m.tipo} -> ${telefone} (${m.nomeArquivo || "sem nome"})`);
    return { ok: true, demo: true };
  }
  try {
    const res = await fetch(`${UAZAPI_URL}/send/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({
        number: telefone,
        type: m.tipo,
        file: m.arquivo,
        ...(m.nomeArquivo ? { docName: m.nomeArquivo } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      // a uazapi as vezes manda { error: true, message: "..." } — "true" sozinho
      // nao ajuda ninguem; monta um erro legivel de verdade
      const msg =
        (typeof raw?.message === "string" && raw.message) ||
        (typeof raw?.error === "string" && raw.error) ||
        `HTTP ${res.status}`;
      return { ok: false, erro: msg, raw };
    }
    return { ok: true, raw };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

/**
 * Cria uma instancia nova na uazapi e retorna o token dela.
 * Ja configura o webhook automaticamente (senao a IA nao recebe mensagens).
 */
export async function criarInstancia(nome: string): Promise<{ token?: string; erro?: string; demo?: boolean }> {
  if (!uazapiConfigurada()) {
    return { token: `demo-token-${nome}`, demo: true };
  }
  try {
    const res = await fetch(`${UAZAPI_URL}/instance/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json", admintoken: UAZAPI_ADMIN_TOKEN },
      body: JSON.stringify({ name: nome }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) return { erro: raw?.error || raw?.message || `HTTP ${res.status}` };
    const token = raw?.token || raw?.instance?.token;
    // ja aponta o webhook pra nossa API (senao a IA nao recebe nada)
    if (token) await configurarWebhook(token);
    return { token };
  } catch (e: any) {
    return { erro: e.message };
  }
}

type ConexaoResultado = {
  status: string;
  qrcode?: string | null;
  paircode?: string | null;
  owner?: string;
  tokenInvalido?: boolean;
  erro?: string;
};

// status que a uazapi usa quando o WhatsApp esta pareado
export const statusConectado = (s?: string) =>
  s === "connected" || s === "open" || s === "conectado";

/**
 * Status AO VIVO da instancia (GET /instance/status — nao mexe em QR/pareamento).
 * conectado=false cobre token invalido (instancia apagada no servidor — o
 * free.uazapi.com apaga em ~1h), desconexao e timeout. Usado pelo watchdog.
 */
export async function statusInstanciaLive(
  instanceToken: string
): Promise<{ conectado: boolean; status: string }> {
  if (!uazapiConfigurada()) return { conectado: true, status: "demo" };
  try {
    const res = await fetch(`${UAZAPI_URL}/instance/status`, {
      headers: { token: instanceToken },
      signal: AbortSignal.timeout(8_000),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) return { conectado: false, status: String(raw?.message || raw?.error || `HTTP ${res.status}`) };
    const i = raw?.instance || raw;
    const st = String(i?.status || "desconhecido");
    return { conectado: statusConectado(st), status: st };
  } catch (e: any) {
    return { conectado: false, status: e.message };
  }
}

/**
 * Chama /instance/connect e devolve status + QR (data-url) + paircode.
 * tokenInvalido=true quando a uazapi rejeita o token da instancia — acontece
 * quando o servidor apagou a instancia (o free.uazapi.com apaga em ~1h; no
 * pago tambem pode cair). Quem trata isso e conectarComRecuperacao().
 */
export async function conectarInstancia(instanceToken: string): Promise<ConexaoResultado> {
  if (!uazapiConfigurada()) return { status: "demo", qrcode: null };
  try {
    const res = await fetch(`${UAZAPI_URL}/instance/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({}),
    });
    const raw = await res.json().catch(() => ({}));
    const msgErro = String(raw?.error || raw?.message || "").toLowerCase();
    if (res.status === 401 || res.status === 403 || msgErro.includes("invalid token")) {
      return { status: "token_invalido", tokenInvalido: true, erro: raw?.error || `HTTP ${res.status}` };
    }
    if (!res.ok) return { status: "erro", erro: raw?.error || `HTTP ${res.status}` };
    const i = raw?.instance || raw;
    return {
      status: i?.status || "desconhecido",
      qrcode: i?.qrcode || null,
      paircode: i?.paircode || null,
      owner: i?.owner,
    };
  } catch (e: any) {
    return { status: "erro", erro: e.message };
  }
}

/**
 * Conecta com AUTO-RECUPERACAO de token morto:
 *  1. tenta /instance/connect com o token salvo no banco
 *  2. se o token morreu (401), recria a instancia via /instance/init,
 *     salva o token novo no banco e conecta de novo — o QR sai na hora,
 *     nunca trava por instancia apagada no servidor
 *  3. se detectar connected/open, marca status=conectado no banco
 * Recebe o registro da tabela instancias (precisa de id/clinica_id).
 */
export async function conectarComRecuperacao(
  inst: any
): Promise<ConexaoResultado & { recriada?: boolean }> {
  if (!uazapiConfigurada()) return { status: "demo", qrcode: null };

  let recriada = false;
  let token: string = inst?.uazapi_token || "";
  let r: ConexaoResultado = token
    ? await conectarInstancia(token)
    : { status: "token_invalido", tokenInvalido: true, erro: "instancia sem token" };

  if (r.tokenInvalido) {
    const nome = inst?.uazapi_instance || inst?.nome || `clinica-${inst?.clinica_id || "nova"}`;
    const nova = await criarInstancia(nome);
    if (!nova.token) {
      return {
        status: "erro",
        erro: `token morto e nao consegui recriar a instancia: ${nova.erro || "sem token"}`,
      };
    }
    token = nova.token;
    recriada = true;
    await upsertInstancia({ ...inst, uazapi_token: token, status: "desconectado" });
    r = await conectarInstancia(token);
  }

  if (statusConectado(r.status)) {
    await upsertInstancia({
      ...inst,
      uazapi_token: token,
      status: "conectado",
      numero: r.owner || inst?.numero,
    });
    // garante o webhook ao conectar (cobre instancias antigas sem webhook)
    await configurarWebhook(token);
  }

  return { ...r, recriada };
}

/**
 * Desconecta (faz logout) do WhatsApp da instancia — o numero para de atender.
 * Best-effort: se a uazapi nao responder, seguimos marcando desconectado no
 * banco do mesmo jeito (o importante e a IA parar de responder por esse numero).
 * Retorna true se a uazapi confirmou o logout.
 */
export async function desconectarInstancia(instanceToken: string): Promise<boolean> {
  if (!uazapiConfigurada() || !instanceToken) return false;
  try {
    const res = await fetch(`${UAZAPI_URL}/instance/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch (e: any) {
    console.warn("[uazapi] falha ao desconectar:", e.message);
    return false;
  }
}

/**
 * Apaga a instancia DE VEZ no servidor uazapi (libera o slot). Usado quando a
 * clinica remove o numero da lista (nao so desconecta). Best-effort: se falhar,
 * a remocao do registro no nosso banco segue mesmo assim.
 */
export async function deletarInstancia(instanceToken: string): Promise<boolean> {
  if (!uazapiConfigurada() || !instanceToken) return false;
  try {
    // logout primeiro (pra derrubar a sessao do WhatsApp), depois delete
    await desconectarInstancia(instanceToken).catch(() => {});
    const res = await fetch(`${UAZAPI_URL}/instance`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", token: instanceToken },
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch (e: any) {
    console.warn("[uazapi] falha ao deletar instancia:", e.message);
    return false;
  }
}

/**
 * Retorna o QR code (base64) pra clinica escanear e conectar o WhatsApp.
 */
export async function getQrCode(instanceToken: string): Promise<{ qrcode?: string; conectado?: boolean; demo?: boolean }> {
  if (!uazapiConfigurada()) {
    return { qrcode: undefined, conectado: false, demo: true };
  }
  try {
    const res = await fetch(`${UAZAPI_URL}/instance/qrcode`, {
      headers: { token: instanceToken },
    });
    const raw = await res.json();
    return { qrcode: raw?.qrcode, conectado: raw?.connected };
  } catch {
    return { conectado: false };
  }
}

/**
 * Nome publicado e foto de perfil de um contato do WhatsApp.
 *
 * Serve pra lista de Conversas mostrar a MESMA cara que a clinica ve no
 * celular (foto + nome do contato) em vez de um numero cru.
 *
 * Best-effort por natureza: se o WhatsApp estiver desconectado, se o contato
 * escondeu a foto nas configuracoes de privacidade, ou se a uazapi mudar o
 * formato, devolve {} e a tela cai no fallback (iniciais do nome). NUNCA
 * lanca — foto de perfil nao pode derrubar a listagem.
 *
 * O endpoint devolve chaves com nomes diferentes entre versoes da uazapi,
 * entao lemos todos os aliases conhecidos em vez de fixar um.
 */
export async function buscarContato(
  instanceToken: string,
  telefone: string
): Promise<{ nome?: string; fotoUrl?: string }> {
  if (!uazapiConfigurada()) return {};
  try {
    const res = await fetch(`${UAZAPI_URL}/chat/GetNameAndImageURL`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ number: telefone, preview: false }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const raw = await res.json().catch(() => null);
    if (!raw || raw.error) return {};
    // a resposta pode vir direta ou embrulhada em chat/contact/result
    const c = raw.chat || raw.contact || raw.result || raw;
    const nome = c.name || c.pushName || c.pushname || c.verifiedName || c.wa_name || "";
    const fotoUrl =
      c.imagePreview || c.image || c.imgUrl || c.profilePicUrl || c.picture || c.urlImage || "";
    return {
      nome: typeof nome === "string" && nome.trim() ? nome.trim() : undefined,
      fotoUrl: typeof fotoUrl === "string" && /^https?:\/\//.test(fotoUrl) ? fotoUrl : undefined,
    };
  } catch {
    return {}; // timeout, rede, contato sem foto: segue sem — nunca quebra a tela
  }
}

/**
 * Normaliza o payload do webhook da uazapi pro formato interno.
 * A uazapi manda eventos de mensagem recebida; extraimos numero + texto.
 */
export function parseWebhook(body: any): {
  telefone: string;
  texto: string;
  tipo: "texto" | "audio" | "imagem" | "figurinha" | "outro";
  instancia?: string;
  numeroClinica?: string;
  fromMe: boolean;
  enviadaPelaApi: boolean;
  ehGrupo: boolean;
  messageId: string | null;
  pushName?: string;
} | null {
  // Formato tipico uazapi: { message: { chatid, text, fromMe }, token/instance }
  const msg = body?.message || body?.data?.message || body;
  if (!msg) return null;

  const fromMe = Boolean(msg.fromMe ?? msg.key?.fromMe);
  // A mensagem que a PROPRIA IA envia volta como fromMe=true (eco do WhatsApp).
  // Precisamos distinguir: se saiu PELA API (foi a IA/o sistema), IGNORAR — se
  // fosse tratada como "atendente respondeu", a IA se auto-pausaria depois da
  // 1a resposta. A uazapi sinaliza isso em varios aliases entre versoes.
  const enviadaPelaApi = Boolean(
    msg.fromApi ?? msg.wasSentByApi ?? msg.sentByApi ?? msg.api ??
    (typeof msg.source === "string" && /api/i.test(msg.source))
  );
  // grupo: o chatid termina em @g.us (mensagem de grupo, NAO respondemos)
  const chatidRaw = String(msg.chatid || msg.sender || msg.from || msg.key?.remoteJid || "");
  const ehGrupo =
    chatidRaw.includes("@g.us") ||
    Boolean(msg.isGroup) ||
    Boolean(msg.isgroup) ||
    Boolean(msg.key?.remoteJid?.includes?.("@g.us"));
  // extrai texto de todos os formatos comuns, INCLUINDO legenda de imagem/video
  // (paciente manda foto do convenio com legenda = o texto nao pode sumir).
  // Coagido pra string SEMPRE: se a uazapi mandar um formato inesperado onde
  // esses campos vem como objeto, "" e mais seguro que deixar passar um objeto
  // (que quebraria .trim()/.toLowerCase() la na frente com TypeError -> 500 -> loop).
  const textoRaw =
    msg.text ??
    msg.body ??
    msg.caption ??
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    msg.message?.imageMessage?.caption ??
    msg.message?.videoMessage?.caption ??
    msg.message?.documentMessage?.caption ??
    "";
  const texto = typeof textoRaw === "string" ? textoRaw : "";

  // id da mensagem, pra dedup (a uazapi reenvia webhook sem 200 a tempo — sem
  // um id estavel pra travar, reenvio vira mensagem/resposta/consulta duplicada)
  const messageId = String(
    msg.id || msg.messageid || msg.messageId || msg.key?.id || msg.message?.key?.id || ""
  ) || null;

  const chatid = msg.chatid || msg.sender || msg.from || msg.key?.remoteJid || "";
  const telefone = String(chatid).replace(/@.*$/, "").replace(/\D/g, "");

  // detecta o tipo (a uazapi manda messageType ou o proprio objeto message.*)
  const rawTipo = String(
    msg.messageType || msg.type || Object.keys(msg.message || {})[0] || ""
  ).toLowerCase();
  let tipo: "texto" | "audio" | "imagem" | "figurinha" | "outro" = "texto";
  // O TIPO vem SEMPRE do messageType — nunca da presenca de texto. Antes, so
  // detectavamos midia quando texto era vazio; documento com LEGENDA (o
  // WhatsApp poe o nome do arquivo como caption, ex: "PEDIDO.pdf") era
  // classificado como texto puro e a guia NUNCA chegava no leitor de PDF (a IA
  // respondia "nao consegui abrir o arquivo" — caso real 20/08, Pulmonar).
  // figurinha (sticker) e expressao, nao pergunta — o webhook ignora em silencio.
  if (rawTipo.includes("sticker")) tipo = "figurinha";
  else if (rawTipo.includes("audio") || rawTipo.includes("ptt")) tipo = "audio";
  else if (rawTipo.includes("image") || rawTipo.includes("imagem")) tipo = "imagem";
  else if (
    rawTipo.includes("document") ||
    rawTipo.includes("video") ||
    (!texto && !rawTipo.includes("conversation") && !rawTipo.includes("text"))
  ) tipo = "outro"; // documento/PDF/video -> leitor de midia (texto vira legenda)
  else if (!texto) tipo = "outro";

  // numero da instancia que RECEBEU a mensagem (a clinica), pra rotear certo
  // em multi-tenant. A uazapi expoe isso como owner/me/instanceOwner.
  const donoRaw =
    body?.owner || msg?.owner || body?.me || msg?.me || body?.instanceOwner || "";
  const numeroClinica = String(donoRaw).replace(/@.*$/, "").replace(/\D/g, "") || undefined;

  // nome que o contato publica no WhatsApp. Vem de graca no proprio evento
  // (sem chamada extra), e e o que a clinica ve no celular dela. Guardamos pra
  // a lista de Conversas mostrar nome em vez de numero cru.
  const pushNameRaw =
    msg.senderName || msg.pushName || msg.pushname || msg.notifyName ||
    msg.chatName || body?.pushName || "";
  const pushName =
    typeof pushNameRaw === "string" && pushNameRaw.trim() ? pushNameRaw.trim().slice(0, 80) : undefined;

  if (!telefone) return null;
  // sem telefone descartamos; sem texto mas com telefone, e midia (tratada no webhook)
  return {
    telefone,
    texto,
    tipo,
    instancia: body?.instance || body?.token || msg?.instance || msg?.token,
    numeroClinica,
    fromMe,
    enviadaPelaApi,
    ehGrupo,
    messageId,
    pushName,
  };
}
