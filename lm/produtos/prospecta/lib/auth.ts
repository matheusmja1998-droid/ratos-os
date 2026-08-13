// Auth do Prospecta — contas email+senha, papeis cliente/admin/interna.
// Portado do Facilita AI (testado em producao). Web Crypto = roda no Edge e no server.
//
// Sessao: cookie "papel:contaId:expira:versao.assinatura" (HMAC-SHA256).
//  - expira: epoch ms, 7 dias. Cookie vazado morre sozinho.
//  - versao: espelho de contas.sessao_versao; incrementar derruba sessoes ativas.
// Senha: PBKDF2-SHA256, formato "salt.hash" (hex).
// .env: SESSION_SECRET (string longa).

export const COOKIE_NOME = "prospecta_sessao";
export const SESSAO_VIDA_MS = 7 * 24 * 60 * 60 * 1000;

export type Papel = "cliente" | "admin" | "interna";
export type Sessao = { papel: Papel; contaId: string; versao: number };

const enc = new TextEncoder();
const getSecret = () => process.env.SESSION_SECRET || "";

const bufParaHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
function hexParaBuf(hex: string): Uint8Array {
  const arr = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

async function hmac(msg: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bufParaHex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

function tempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- Senhas (PBKDF2) ----------
export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey("raw", enc.encode(senha), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: 100000, hash: "SHA-256" }, km, 256);
  return `${bufParaHex(salt.buffer as ArrayBuffer)}.${bufParaHex(bits)}`;
}

export async function verificarSenha(senha: string, hashArmazenado: string): Promise<boolean> {
  const [saltHex, hashHex] = (hashArmazenado || "").split(".");
  if (!saltHex || !hashHex) return false;
  const km = await crypto.subtle.importKey("raw", enc.encode(senha), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexParaBuf(saltHex) as unknown as BufferSource, iterations: 100000, hash: "SHA-256" }, km, 256);
  return tempoConstante(bufParaHex(bits), hashHex);
}

// ---------- Sessao (cookie assinado) ----------
export async function criarSessao(s: Sessao): Promise<string> {
  const expira = Date.now() + SESSAO_VIDA_MS;
  const payload = `${s.papel}:${s.contaId}:${expira}:${s.versao ?? 1}`;
  return `${payload}.${await hmac(payload, getSecret())}`;
}

export async function lerSessao(cookie: string | undefined): Promise<Sessao | null> {
  if (!cookie) return null;
  const secret = getSecret();
  if (!secret) return null; // fail-closed
  const idx = cookie.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = cookie.slice(0, idx), sig = cookie.slice(idx + 1);
  if (!tempoConstante(sig, await hmac(payload, secret))) return null;
  const partes = payload.split(":");
  if (partes.length !== 4) return null;
  const [papel, contaId, expiraStr, versaoStr] = partes;
  if (!["cliente", "admin", "interna"].includes(papel)) return null;
  const expira = Number(expiraStr);
  if (!Number.isFinite(expira) || Date.now() > expira) return null;
  const versao = Number(versaoStr);
  if (!Number.isFinite(versao)) return null;
  return { papel: papel as Papel, contaId, versao };
}

// ---------- Criptografia do token Anthropic (guardado no banco) ----------
// AES-GCM com chave derivada do SESSION_SECRET. O token do cliente nunca fica
// em texto puro no banco nem volta pro browser.
async function chaveCripto(): Promise<CryptoKey> {
  const bits = await crypto.subtle.digest("SHA-256", enc.encode(getSecret() + "|anthropic"));
  return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
export async function cifrar(texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveCripto(), enc.encode(texto));
  return `${bufParaHex(iv.buffer as ArrayBuffer)}.${bufParaHex(ct)}`;
}
export async function decifrar(guardado: string): Promise<string> {
  const [ivHex, ctHex] = (guardado || "").split(".");
  if (!ivHex || !ctHex) return "";
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexParaBuf(ivHex) as unknown as BufferSource } as any, await chaveCripto(),
    hexParaBuf(ctHex) as unknown as BufferSource);
  return new TextDecoder().decode(pt);
}
