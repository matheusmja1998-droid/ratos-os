// Auth de 2 papeis (admin + clinica) com contas email+senha.
// Tudo via Web Crypto pra funcionar no Edge (middleware) e no server.
//
// Sessao: cookie "papel:contaId:clinicaId:expira:versao.assinatura" (HMAC).
//  - expira: epoch ms. Cookie capturado deixa de valer sozinho em 7 dias —
//    antes nao tinha validade nenhuma server-side (valia PRA SEMPRE).
//  - versao: espelho de contas.sessao_versao. Incrementar a versao no banco
//    derruba todas as sessoes ativas da conta (funcionario saiu, senha trocada).
//    A checagem contra o banco e feita em lib/sessao.ts (server), nao no
//    middleware (edge, sem acesso ao banco) — o middleware valida HMAC+expiracao.
// Senha: PBKDF2-SHA256 com salt aleatorio, formato "salt.hash" (hex).
//
// .env:
//   SESSION_SECRET=...  (segredo pra assinar o cookie; string longa)

export const COOKIE_NOME = "ia_clinicas_sessao";

// vida da sessao server-side (igual ao maxAge do cookie no login)
export const SESSAO_VIDA_MS = 7 * 24 * 60 * 60 * 1000;

export type Sessao = {
  papel: "admin" | "clinica";
  contaId: string;
  clinicaId: string | null;
  versao: number;
};

function getSecret(): string {
  return process.env.SESSION_SECRET || "";
}

const enc = new TextEncoder();

function bufParaHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function hexParaBuf(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

// HMAC-SHA256 (assinatura do cookie)
async function hmac(msg: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return bufParaHex(sig);
}

// comparacao de tempo constante
function tempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- Senhas (PBKDF2) ----------
export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(senha),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return `${bufParaHex(salt.buffer as ArrayBuffer)}.${bufParaHex(bits)}`;
}

export async function verificarSenha(senha: string, hashArmazenado: string): Promise<boolean> {
  const [saltHex, hashHex] = hashArmazenado.split(".");
  if (!saltHex || !hashHex) return false;
  const salt = hexParaBuf(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(senha),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return tempoConstante(bufParaHex(bits), hashHex);
}

// ---------- Sessao (cookie assinado) ----------
export async function criarSessao(s: Sessao): Promise<string> {
  const secret = getSecret();
  const expira = Date.now() + SESSAO_VIDA_MS;
  const payload = `${s.papel}:${s.contaId}:${s.clinicaId ?? ""}:${expira}:${s.versao ?? 1}`;
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
}

export async function lerSessao(cookie: string | undefined): Promise<Sessao | null> {
  if (!cookie) return null;
  const secret = getSecret();
  if (!secret) return null; // fail-closed
  const idx = cookie.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = cookie.slice(0, idx);
  const sig = cookie.slice(idx + 1);
  const esperado = await hmac(payload, secret);
  if (!tempoConstante(sig, esperado)) return null;
  const partes = payload.split(":");
  // formato atual tem 5 partes; cookie antigo (3 partes, sem expiracao) e
  // rejeitado — o usuario so precisa logar de novo uma vez.
  if (partes.length !== 5) return null;
  const [papel, contaId, clinicaId, expiraStr, versaoStr] = partes;
  if (papel !== "admin" && papel !== "clinica") return null;
  const expira = Number(expiraStr);
  if (!Number.isFinite(expira) || Date.now() > expira) return null; // expirou
  const versao = Number(versaoStr);
  if (!Number.isFinite(versao)) return null;
  return { papel, contaId, clinicaId: clinicaId || null, versao };
}
