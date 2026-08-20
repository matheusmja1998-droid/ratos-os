// Transcricao de audio do WhatsApp via OpenAI Whisper.
// Fluxo: webhook recebe audio -> baixa o arquivo da uazapi -> manda pro Whisper
// -> devolve o texto pra IA responder normal.
//
// Precisa no .env: OPENAI_API_KEY (sem ela, retorna null e o webhook cai no
// fallback de "escreve por texto" — nada quebra).

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const UAZAPI_URL = process.env.UAZAPI_URL || "";

// Audio de WhatsApp e sempre pequeno (<1MB). Cap conservador de 25MB (limite
// do Whisper) — mas checamos o Content-Length ANTES de baixar pra nao encher
// memoria com um arquivo gigante de uma URL maliciosa.
const MAX_BYTES = 25 * 1024 * 1024;
// timeouts pensados pro teto de 30s da funcao do webhook (app/api/webhook/route.ts
// maxDuration=30): audio de WhatsApp e curto, entao um timeout de 60s pro Whisper
// sozinho ja estourava o teto da funcao. 8s download + 12s Whisper deixa folga
// pro delay humanizado minimo e pro proprio round-trip da IA.
// 20s: o /message/download da uazapi BAIXA E DESCRIPTOGRAFA o arquivo do
// WhatsApp na 1a vez — PDF real levou mais de 8s e o timeout antigo matava a
// leitura da guia (caso real 20/08: "nao consegui abrir o arquivo"). Na 2a
// chamada a uazapi responde do cache em <1s — por isso tambem ha RETRY abaixo.
const TIMEOUT_DOWNLOAD_MS = 20_000;
const TIMEOUT_WHISPER_MS = 12_000;

export const whisperConfigurado = () => Boolean(OPENAI_API_KEY);

// SSRF guard: so baixamos de hosts confiaveis (o servidor da uazapi + variantes).
// A URL do audio vem do payload do webhook, que e controlavel — sem allowlist,
// um atacante (com o WEBHOOK_SECRET) poderia nos fazer buscar IPs internos.
function hostConfiavel(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  // bloqueia IP literal / localhost / redes privadas de cara
  if (
    host === "localhost" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  // allowlist: mesmo host do UAZAPI_URL, ou dominio uazapi
  const permitidos: string[] = [];
  try {
    if (UAZAPI_URL) permitidos.push(new URL(UAZAPI_URL).hostname.toLowerCase());
  } catch {}
  const okBase = permitidos.some((p) => host === p || host.endsWith("." + p));
  if (okBase || host === "uazapi.com" || host.endsWith(".uazapi.com")) return true;
  // a uazapi hospeda midia em storage proprio (S3/minio) em subdominios de CDN.
  // Aceitamos os hosts de storage publicos conhecidos que ela usa pra servir arquivo.
  return (
    host.endsWith(".amazonaws.com") ||
    host.endsWith(".backblazeb2.com") ||
    host.endsWith(".digitaloceanspaces.com") ||
    host.endsWith(".r2.cloudflarestorage.com") ||
    host.endsWith(".wasabisys.com")
  );
}

// Varre o payload cru do webhook atras de uma URL direta do arquivo de audio.
// A uazapi (com download automatico ligado) inclui a midia ja hospedada em
// campos tipo file/fileURL/mediaUrl. URLs .enc do WhatsApp sao criptografadas
// e NAO servem — ignoramos.
function acharUrlDireta(body: any): string | null {
  const msg = body?.message || body?.data?.message || body || {};
  const candidatos = [
    msg.file,
    msg.fileURL,
    msg.fileUrl,
    msg.mediaUrl,
    msg.media_url,
    msg.content,
    msg.message?.audioMessage?.url,
  ];
  for (const c of candidatos) {
    if (typeof c === "string" && /^https?:\/\//i.test(c) && !c.includes(".enc")) {
      return c;
    }
  }
  return null;
}

// Extrai o id da mensagem (pra pedir o download pra uazapi quando o payload
// nao traz a URL direta).
function acharMessageId(body: any): string | null {
  const msg = body?.message || body?.data?.message || body || {};
  return (
    msg.id ||
    msg.messageid ||
    msg.messageId ||
    msg.key?.id ||
    msg.message?.key?.id ||
    null
  );
}

// Baixa os bytes do audio. Tenta URL direta do payload; senao pede pra uazapi
// via POST /message/download (autenticado com o token da instancia).
async function baixarAudio(body: any, instanceToken: string): Promise<Buffer | null> {
  // 1) URL direta no payload
  const urlDireta = acharUrlDireta(body);
  if (urlDireta) {
    const buf = await baixarUrl(urlDireta);
    if (buf) return buf;
  }

  // 2) endpoint de download da uazapi
  if (!UAZAPI_URL || !instanceToken) return null;
  const id = acharMessageId(body);
  if (!id) return null;

  // ate 2 tentativas: se a 1a estourar o tempo (uazapi baixando/descriptografando
  // do WhatsApp), a 2a acerta o cache dela e volta instantaneo
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const res = await fetch(`${UAZAPI_URL}/message/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instanceToken },
        body: JSON.stringify({ id }),
        signal: AbortSignal.timeout(TIMEOUT_DOWNLOAD_MS),
      });
      if (!res.ok) {
        console.warn(`[transcrever] uazapi download HTTP ${res.status} (tentativa ${tentativa})`, (await res.text().catch(() => "")).slice(0, 200));
        continue;
      }
      const raw: any = await res.json().catch(() => null);
      if (!raw) continue;

      // a uazapi pode devolver uma URL do arquivo ou o conteudo em base64
      const fileURL = raw.fileURL || raw.fileUrl || raw.file || raw.url;
      if (typeof fileURL === "string" && /^https?:\/\//i.test(fileURL)) {
        const buf = await baixarUrl(fileURL);
        if (buf) return buf;
        continue;
      }
      const b64 = raw.base64 || raw.data;
      if (typeof b64 === "string" && b64.length > 100) {
        // pode vir como data URI ("data:audio/ogg;base64,....")
        const puro = b64.includes(",") ? b64.split(",").pop()! : b64;
        const buf = Buffer.from(puro, "base64");
        if (buf.length > 0 && buf.length <= MAX_BYTES) return buf;
      }
    } catch (e: any) {
      console.warn(`[transcrever] erro no download uazapi (tentativa ${tentativa}):`, e.message);
    }
  }
  return null;
}

async function baixarUrl(url: string): Promise<Buffer | null> {
  // SSRF guard: valida host ANTES de qualquer request
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!hostConfiavel(u)) {
    console.warn("[transcrever] URL de audio recusada (host nao confiavel):", u.hostname);
    return null;
  }
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_DOWNLOAD_MS) });
    if (!res.ok) return null;
    // cap por Content-Length antes de bufferizar (evita encher memoria)
    const tam = Number(res.headers.get("content-length") || 0);
    if (tam > MAX_BYTES) {
      console.warn("[transcrever] audio grande demais:", tam);
      return null;
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > MAX_BYTES) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

// Manda os bytes pro Whisper (whisper-1, pt) e devolve o texto transcrito.
async function whisper(audio: Buffer): Promise<string | null> {
  const form = new FormData();
  // audio de WhatsApp e ogg/opus; o Whisper detecta pelo conteudo, o nome so
  // precisa ter uma extensao aceita.
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/ogg" }), "audio.ogg");
  form.append("model", "whisper-1");
  form.append("language", "pt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_WHISPER_MS),
  });
  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.warn(`[transcrever] whisper HTTP ${res.status}: ${detalhe.slice(0, 200)}`);
    return null;
  }
  const raw: any = await res.json().catch(() => null);
  const texto = (raw?.text || "").trim();
  return texto || null;
}

/**
 * Baixa QUALQUER midia do webhook (imagem/PDF/audio) — mesmo pipeline do audio
 * (URL direta do payload ou POST /message/download). Retorna os bytes + a URL
 * direta quando existir (a URL vira o anexo da guia na consulta).
 * Nunca lanca; { buf: null } em falha.
 */
export async function baixarMidiaComUrl(
  body: any,
  instanceToken: string
): Promise<{ buf: Buffer | null; url: string | null }> {
  try {
    const url = acharUrlDireta(body);
    const buf = await baixarAudio(body, instanceToken); // generico: baixa qualquer midia
    return { buf, url };
  } catch (e: any) {
    console.warn("[transcrever] baixarMidiaComUrl falhou:", e.message);
    return { buf: null, url: null };
  }
}

/**
 * Transcreve o audio de um webhook da uazapi.
 * Recebe o body CRU do webhook + token da instancia (pra baixar a midia).
 * Retorna o texto, ou null em QUALQUER falha (o chamador cai no fallback).
 * Nunca lanca erro. Compat: quem so precisa do texto usa isto.
 */
export async function transcrever(body: any, instanceToken: string): Promise<string | null> {
  const r = await transcreverDetalhado(body, instanceToken);
  return r.texto ?? null;
}

/**
 * Igual a transcrever(), mas devolve o MOTIVO da falha pra diagnostico.
 * O webhook usa isto pra alertar (em vez de falhar em silencio) quando um
 * audio chega e nao conseguimos entender — assim a gente ve o que quebrou.
 */
export async function transcreverDetalhado(
  body: any,
  instanceToken: string
): Promise<{ texto?: string; erro?: string }> {
  try {
    if (!whisperConfigurado()) {
      return { erro: "OPENAI_API_KEY ausente no ambiente" };
    }
    const audio = await baixarAudio(body, instanceToken);
    if (!audio) {
      // loga os campos do payload pra descobrir o formato real do audio da uazapi
      const msg = body?.message || body?.data?.message || body || {};
      const campos = Object.keys(msg).join(",");
      console.warn("[transcrever] download falhou. campos do msg:", campos);
      return { erro: `nao consegui baixar o audio (campos: ${campos})` };
    }
    const texto = await whisper(audio);
    if (!texto) return { erro: "whisper voltou vazio" };
    return { texto };
  } catch (e: any) {
    return { erro: e.message || "erro desconhecido" };
  }
}
