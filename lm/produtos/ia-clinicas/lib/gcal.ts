// Google Calendar POR MEDICO — cada profissional vincula a propria agenda
// via OAuth. A agenda do painel LE os eventos do Google do medico (fonte da
// verdade) e a IA ESCREVE quando marca consulta.
//
// .env (o Matheus cria o app no Google Cloud Console):
//   GOOGLE_CLIENT_ID      -> OAuth 2.0 Client ID (Web application)
//   GOOGLE_CLIENT_SECRET  -> secret do mesmo client
//   APP_URL               -> base do app (pro redirect do OAuth), ex https://ia-clinicas.vercel.app
//
// Sem CLIENT_ID/SECRET, tudo aqui e no-op gracioso (o botao "Conectar Google"
// avisa que nao esta configurado; a agenda cai pra agenda interna).

import { getProfissionalComToken, consultaCompleta, getClinica, vincularGoogleProfissional } from "./db";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const APP_URL = process.env.APP_URL || "https://ia-clinicas.vercel.app";
const REDIRECT_URI = `${APP_URL}/api/gcal/callback`;
const SCOPE = "https://www.googleapis.com/auth/calendar.events openid email";
const TZ = "America/Sao_Paulo";
const OFFSET = "-03:00";

export const gcalConfigurado = () => Boolean(CLIENT_ID && CLIENT_SECRET);

// ---------- OAuth: fluxo de conexao por medico ----------

// --- State assinado (anti-CSRF de account-linking, RFC 6749 §10.12) ---
// O state carrega profId + nonce + HMAC(profId.nonce, SESSION_SECRET). O nonce
// tambem vai num cookie HttpOnly; o callback so aceita se o HMAC bater E o nonce
// do state == nonce do cookie. Assim so quem INICIOU o fluxo (tem o cookie)
// consegue completar o vinculo — um link forjado do atacante nao casa.
import { createHmac, randomBytes } from "crypto";
export const NONCE_COOKIE = "gcal_oauth_nonce";

function assinar(msg: string): string {
  const secret = process.env.SESSION_SECRET || "";
  return createHmac("sha256", secret).update(msg).digest("hex");
}
export function montarState(profissionalId: string): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const corpo = `${profissionalId}.${nonce}`;
  const state = `${corpo}.${assinar(corpo)}`;
  return { state, nonce };
}
export function validarState(
  state: string,
  nonceCookie: string
): { ok: boolean; profissionalId?: string } {
  if (!state || !nonceCookie) return { ok: false };
  const partes = state.split(".");
  if (partes.length !== 3) return { ok: false };
  const [profId, nonce, sig] = partes;
  const corpo = `${profId}.${nonce}`;
  // HMAC bate? (comparacao simples; hex de tamanho fixo)
  if (sig !== assinar(corpo)) return { ok: false };
  // nonce do state == nonce do cookie? (liga a quem iniciou o fluxo)
  if (nonce !== nonceCookie) return { ok: false };
  return { ok: true, profissionalId: profId };
}

// URL pra onde o medico vai autorizar. Recebe o state assinado (montado na rota).
export function urlAutorizacao(state: string): string | null {
  if (!gcalConfigurado()) return null;
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // pra receber refresh token
    prompt: "consent", // forca refresh token mesmo em re-conexao
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

// Troca o code do callback por refresh token e guarda no medico.
export async function trocarCodePorToken(
  code: string,
  profissionalId: string
): Promise<{ ok: boolean; erro?: string }> {
  if (!gcalConfigurado()) return { ok: false, erro: "google nao configurado" };
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const raw: any = await res.json().catch(() => null);
    if (!res.ok || !raw?.refresh_token) {
      return { ok: false, erro: raw?.error || `HTTP ${res.status} (sem refresh_token)` };
    }
    // pega o email da conta (id_token vem no response; decodifica o payload)
    let email: string | undefined;
    try {
      if (raw.id_token) {
        const payload = JSON.parse(Buffer.from(raw.id_token.split(".")[1], "base64").toString());
        email = payload?.email;
      }
    } catch {}
    await vincularGoogleProfissional(profissionalId, {
      gcal_refresh_token: raw.refresh_token,
      gcal_email: email,
      gcal_id: "primary",
    });
    invalidarTokenCache(profissionalId); // limpa cache velho ao revincular
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// ---------- Access token por medico (cache em memoria por profissional) ----------
const _tokens: Map<string, { valor: string; expiraEm: number }> = new Map();

// invalida o cache quando o vinculo muda (revincular/desvincular) — senao um
// access token velho (de outro refresh) poderia ser reusado.
export function invalidarTokenCache(profissionalId: string) {
  _tokens.delete(profissionalId);
}

async function accessTokenDoMedico(prof: any): Promise<string | null> {
  if (!gcalConfigurado() || !prof?.gcal_refresh_token) return null;
  const cache = _tokens.get(prof.id);
  if (cache && Date.now() < cache.expiraEm) return cache.valor;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: prof.gcal_refresh_token,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const raw: any = await res.json().catch(() => null);
    if (!res.ok || !raw?.access_token) {
      console.warn(`[gcal] refresh do medico ${prof.id} falhou:`, raw?.error || res.status);
      return null;
    }
    const vidaMs = (Number(raw.expires_in) || 3600) * 1000;
    _tokens.set(prof.id, { valor: raw.access_token, expiraEm: Date.now() + vidaMs - 60_000 });
    return raw.access_token;
  } catch (e: any) {
    console.warn("[gcal] erro no refresh do medico:", e.message);
    return null;
  }
}

// ---------- LER eventos do Google do medico (fonte da verdade da agenda) ----------
// Retorna eventos entre deISO e ateISO (wall-clock SP) normalizados pro formato
// interno: { inicio, fim, titulo, origem: 'gcal' }.
export async function eventosDoMedico(
  profissionalId: string,
  deISO: string,
  ateISO: string,
  clinicaId?: string // defesa em profundidade: se passado, exige que o medico seja dessa clinica
): Promise<{ inicio: string; fim: string; titulo: string; origem: string }[] | null> {
  if (!gcalConfigurado()) return null;
  const prof = await getProfissionalComToken(profissionalId);
  if (!prof) return null;
  if (clinicaId && prof.clinica_id !== clinicaId) return null; // isolamento na propria funcao
  if (!prof?.gcal_conectado || !prof?.gcal_refresh_token) return null; // medico nao vinculou
  const token = await accessTokenDoMedico(prof);
  if (!token) return null;

  const calId = encodeURIComponent(prof.gcal_id || "primary");
  const timeMin = new Date(deISO + OFFSET).toISOString();
  const timeMax = new Date(ateISO + OFFSET).toISOString();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events` +
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=250`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`[gcal] listar eventos do medico ${profissionalId}: HTTP ${res.status}`);
      return null;
    }
    const raw: any = await res.json().catch(() => null);
    const items: any[] = raw?.items || [];
    // normaliza pro wall-clock SP "YYYY-MM-DDTHH:mm:00"
    const paraSP = (dt: string) => {
      // dt pode vir "2026-07-13T08:00:00-03:00" ou "2026-07-13" (dia inteiro)
      if (dt.length <= 10) return dt + "T00:00:00";
      const d = new Date(dt);
      const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      const p = (n: number) => String(n).padStart(2, "0");
      return `${sp.getUTCFullYear()}-${p(sp.getUTCMonth() + 1)}-${p(sp.getUTCDate())}T${p(sp.getUTCHours())}:${p(sp.getUTCMinutes())}:00`;
    };
    return items
      .filter((e) => e.status !== "cancelled" && (e.start?.dateTime || e.start?.date))
      // evento marcado como LIVRE (transparency=transparent) nao ocupa horario —
      // e o default de aniversario/feriado/lembrete de dia inteiro no Google.
      // Sem esse filtro, um aniversario bloqueava o dia INTEIRO da agenda.
      .filter((e) => e.transparency !== "transparent")
      // espelhos criados por NOS (consulta marcada aqui vira evento no Google):
      // ja contam pela tabela consultas — contar de novo aqui duplicava o
      // bloqueio e impedia remarcar a propria consulta ("horario ocupado" falso).
      .filter((e) => !String(e.description || "").includes("Agendado pela IA ("))
      .map((e) => ({
        inicio: paraSP(e.start.dateTime || e.start.date),
        fim: paraSP(e.end?.dateTime || e.end?.date || e.start.dateTime || e.start.date),
        titulo: e.summary || "(sem titulo)",
        origem: "gcal",
      }));
  } catch (e: any) {
    console.warn("[gcal] erro lendo eventos:", e.message);
    return null;
  }
}

// ---------- ESCREVER: cria o evento da consulta no Google do medico ----------
// BEST-EFFORT: nunca lanca. No-op se o medico nao vinculou o Google.
// Retorna o eventId do Google (pra guardar em consultas.gcal_event_id e depois
// conseguir atualizar/apagar quando remarcar/cancelar — sem isso o evento fica
// orfao no Google quando a IA mexe na consulta pelo nosso banco).
export async function criarEventoGCal(consulta: any): Promise<string | null> {
  try {
    if (!consulta?.id || !gcalConfigurado()) return null;
    const prof = await getProfissionalComToken(consulta.profissional_id);
    if (!prof?.gcal_conectado || !prof?.gcal_refresh_token) return null;
    const token = await accessTokenDoMedico(prof);
    if (!token) return null;

    const cheia = await consultaCompleta(consulta.id);
    const clinica = await getClinica(consulta.clinica_id);
    const paciente = cheia?.paciente_nome || cheia?.telefone || "Paciente";

    const evento = {
      summary: `Consulta — ${paciente}`,
      description: [
        `Paciente: ${paciente}`,
        cheia?.telefone ? `Telefone: ${cheia.telefone}` : null,
        clinica?.nome ? `Clinica: ${clinica.nome}` : null,
        consulta.observacao ? `Obs: ${consulta.observacao}` : null,
        `Agendado pela IA (${consulta.id})`,
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: consulta.inicio + OFFSET, timeZone: TZ },
      end: { dateTime: consulta.fim + OFFSET, timeZone: TZ },
    };

    const calId = encodeURIComponent(prof.gcal_id || "primary");
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(evento),
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) {
      const d = await res.text().catch(() => "");
      console.warn(`[gcal] criar evento HTTP ${res.status}: ${d.slice(0, 200)}`);
      return null;
    }
    const raw: any = await res.json().catch(() => null);
    return raw?.id || null;
  } catch (e: any) {
    console.warn("[gcal] falha best-effort (agendamento segue):", e.message);
    return null;
  }
}

// ---------- ATUALIZAR: move o evento existente (remarcar) ----------
// BEST-EFFORT: nunca lanca. Sem eventId ou sem vinculo, no-op silencioso —
// o agendamento no nosso banco e a fonte da verdade real, o Google e espelho.
export async function atualizarEventoGCal(
  profissionalId: string,
  eventId: string,
  novoInicioISO: string,
  novoFimISO: string
): Promise<boolean> {
  try {
    if (!eventId || !gcalConfigurado()) return false;
    const prof = await getProfissionalComToken(profissionalId);
    if (!prof?.gcal_conectado || !prof?.gcal_refresh_token) return false;
    const token = await accessTokenDoMedico(prof);
    if (!token) return false;

    const calId = encodeURIComponent(prof.gcal_id || "primary");
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { dateTime: novoInicioISO + OFFSET, timeZone: TZ },
          end: { dateTime: novoFimISO + OFFSET, timeZone: TZ },
        }),
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) {
      console.warn(`[gcal] atualizar evento HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.warn("[gcal] falha best-effort ao atualizar evento:", e.message);
    return false;
  }
}

// ---------- CANCELAR: apaga o evento existente ----------
// BEST-EFFORT: nunca lanca. 404 conta como sucesso (ja nao existe = objetivo cumprido).
export async function cancelarEventoGCal(profissionalId: string, eventId: string): Promise<boolean> {
  try {
    if (!eventId || !gcalConfigurado()) return false;
    const prof = await getProfissionalComToken(profissionalId);
    if (!prof?.gcal_conectado || !prof?.gcal_refresh_token) return false;
    const token = await accessTokenDoMedico(prof);
    if (!token) return false;

    const calId = encodeURIComponent(prof.gcal_id || "primary");
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      console.warn(`[gcal] cancelar evento HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.warn("[gcal] falha best-effort ao cancelar evento:", e.message);
    return false;
  }
}
