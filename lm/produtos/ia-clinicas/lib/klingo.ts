// Conector Klingo — sistema de gestao de unidades de saude (klingo.com.br).
// Mesmo papel do Feegow/Clinicorp: espelhar a agenda pra nao ter divergencia:
//  - LER: atendimentos do Klingo aparecem no painel e bloqueiam slots da IA
//  - DISPONIBILIDADE: /agenda/horarios devolve os slots REALMENTE marcaveis
//  - ESCREVER: consulta marcada pela IA e espelhada via reserva+confirmacao
//
// Docs: Swagger "Klingo API Externa" (app.swaggerhub.com/apis/agsx30/klingo-api-externa)
//       + collection Postman publica (postman.com/klingosistemas).
// Base: https://api-externa.klingo.app/api  (GET /live => "OK [API2]", testado 10/08/26)
//
// AUTH em 2 niveis:
//  - X-APP-TOKEN: token da aplicacao (a UNICA credencial que o cliente cola).
//  - Bearer por PACIENTE: /paciente/identificar {telefone} devolve access_token;
//    marcar/cancelar agenda exige esse bearer (a marcacao e "do paciente").
//
// TUDO best-effort: falha no Klingo NUNCA derruba o fluxo local — loga, alerta
// quando importa (LANCAR MANUALMENTE), e segue. Fonte local continua sozinha.
//
// NOTA: mapeamentos defensivos (aliases) — a doc publica nao traz todos os
// exemplos de resposta. Validar no primeiro teste com o token real do cliente.

import { getClinica, getProfissional, registrarLog } from "./db";

const BASE = process.env.KLINGO_API_URL || "https://api-externa.klingo.app/api";

// pronta pra usar quando a clinica colou o app token
export function klingoConectada(clinica: any): boolean {
  return Boolean(clinica?.klingo_app_token);
}

// request generica com timeout e parse defensivo
async function kg(
  token: string,
  path: string,
  opts?: { method?: string; body?: any; query?: Record<string, any>; bearer?: string }
): Promise<{ ok: boolean; data?: any; status?: number; erro?: string }> {
  try {
    let url = `${BASE}${path}`;
    if (opts?.query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
      }
      const qs = q.toString();
      if (qs) url += `?${qs}`;
    }
    const headers: Record<string, string> = {
      "X-APP-TOKEN": token,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (opts?.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
    const res = await fetch(url, {
      method: opts?.method || "GET",
      headers,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(12_000),
    });
    const texto = await res.text();
    let data: any = null;
    try { data = JSON.parse(texto); } catch { data = texto; }
    if (!res.ok) {
      const erro =
        (data && typeof data === "object" && (data.message || data.error || data.erro)) ||
        (typeof data === "string" && data.slice(0, 200)) ||
        `HTTP ${res.status}`;
      return { ok: false, status: res.status, erro: String(erro), data };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// o Klingo costuma devolver array direto, ou embrulhar em { data }/{ results }
function conteudo(data: any): any {
  if (Array.isArray(data)) return data;
  return data?.data ?? data?.results ?? data?.list ?? data;
}

// ---------- validacao / listas (pro setup da integracao) ----------

// Valida o app token com uma chamada leve (lista de profissionais).
export async function validarKlingo(token: string): Promise<{ ok: boolean; erro?: string; profissionais?: number }> {
  const r = await kg(token, "/profissionais");
  if (!r.ok) return { ok: false, erro: r.erro || "token recusado pelo Klingo" };
  const lista = conteudo(r.data);
  return { ok: true, profissionais: Array.isArray(lista) ? lista.length : 0 };
}

export async function listarProfissionaisKlingo(
  clinica: any
): Promise<{ id: string; nome: string; especialidade: string; crm: string }[]> {
  if (!klingoConectada(clinica)) return [];
  const r = await kg(clinica.klingo_app_token, "/profissionais", {
    query: { cnes: clinica.klingo_cnes || undefined },
  });
  if (!r.ok) return [];
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return [];
  return lista
    .map((p: any) => ({
      id: String(p.id ?? p.Id ?? ""),
      // formato REAL (conta exito, 13/08): nome cru + especialidades como ARRAY
      // [{codigo, nome, cbos}] — usamos a primeira como rotulo
      nome: [p.tratamento, p.nome ?? p.name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || "(sem nome)",
      especialidade: String(p.especialidades?.[0]?.nome ?? p.especialidade?.nome ?? p.subespecialidade ?? ""),
      crm: String(p.numero ?? p.crm ?? ""),
    }))
    .filter((p) => p.id);
}

// ---------- CACHE do cadastro de profissionais (id -> CBOS) ----------
// /agenda/horarios EXIGE a especialidade (CBOS). Numa clinica multi (exito:
// 73 profissionais, 14 especialidades) o CBOS certo e o DO profissional —
// derivamos do proprio /profissionais, cacheado, em vez de pedir mais um
// campo de configuracao.
const CACHE_PROFS_MIN = Number(process.env.KLINGO_CACHE_PROFS_MIN || 30);
type CacheProfs = { validoAte: number; porId: Map<string, { cbos: string }> };
const _cacheProfs = new Map<string, CacheProfs>();

async function cbosDoProfissional(clinica: any, klingoProfId: string): Promise<string> {
  const chave = String(clinica.id);
  let hit = _cacheProfs.get(chave);
  if (!hit || hit.validoAte <= Date.now()) {
    const r = await kg(clinica.klingo_app_token, "/profissionais");
    const lista = r.ok ? conteudo(r.data) : null;
    const porId = new Map<string, { cbos: string }>();
    if (Array.isArray(lista)) {
      for (const p of lista) {
        porId.set(String(p.id), { cbos: String(p.especialidades?.[0]?.cbos ?? "") });
      }
    }
    hit = { validoAte: Date.now() + CACHE_PROFS_MIN * 60_000, porId };
    _cacheProfs.set(chave, hit);
  }
  return hit.porId.get(String(klingoProfId))?.cbos || String(clinica.klingo_especialidade || "");
}

// ---------- CACHE de atendimentos por DIA ----------
// /atendimentos?data=YYYY-MM-DD devolve o dia inteiro — cache por clinica+dia
// (TTL curto) pra pagina de agenda + slots + agendar nao repetirem a chamada.
const CACHE_MIN = Number(process.env.KLINGO_CACHE_MIN || 5);
type CacheDia = { validoAte: number; lista: any[] };
const _cacheDia = new Map<string, CacheDia>();
const _emVoo = new Map<string, Promise<any[] | null>>();

async function marcacoesDoDia(clinica: any, dia: string): Promise<any[] | null> {
  const chave = `${clinica.id}|${dia}`;
  const hit = _cacheDia.get(chave);
  if (hit && hit.validoAte > Date.now()) return hit.lista;
  const voando = _emVoo.get(chave);
  if (voando) return voando;
  const p = (async () => {
    // /telefonia/lista/:data e quem devolve as MARCACOES do dia com hora +
    // medico_id (formato real validado na conta exito, 13/08). O /atendimentos
    // do Swagger NAO traz horario (e a lista de quem ja foi atendido).
    const r = await kg(clinica.klingo_app_token, `/telefonia/lista/${dia}`);
    if (!r.ok) {
      console.warn("[klingo] /telefonia/lista falhou:", r.erro);
      return hit?.lista ?? null;
    }
    const lista = conteudo(r.data);
    const arr = Array.isArray(lista) ? lista : [];
    _cacheDia.set(chave, { validoAte: Date.now() + CACHE_MIN * 60_000, lista: arr });
    return arr;
  })().finally(() => _emVoo.delete(chave));
  _emVoo.set(chave, p);
  return p;
}

export function invalidarCacheKlingo(clinicaId: string) {
  for (const k of _cacheDia.keys()) if (k.startsWith(`${clinicaId}|`)) _cacheDia.delete(k);
  for (const k of _cacheDisp.keys()) if (k.startsWith(`${clinicaId}|`)) _cacheDisp.delete(k);
}

function hhmm(s: any): string {
  const m = String(s || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

// Eventos do Klingo que ocupam a agenda de um profissional no intervalo.
// Mapeamento DEFENSIVO: a doc nao garante os campos de data/hora do
// atendimento — aceita os aliases mais provaveis e ignora o que nao entender.
export async function eventosKlingo(
  profissionalId: string,
  deISO: string,
  ateISO: string,
  clinicaId?: string
): Promise<{ inicio: string; fim: string; titulo: string }[]> {
  try {
    const prof = await getProfissional(profissionalId);
    if (!prof?.klingo_professional_id) return [];
    if (clinicaId && prof.clinica_id !== clinicaId) return [];
    const clinica = await getClinica(prof.clinica_id);
    if (!klingoConectada(clinica)) return [];

    const eventos: { inicio: string; fim: string; titulo: string }[] = [];
    // varre cada dia do intervalo (normalmente e 1 dia so)
    const d0 = new Date(deISO.slice(0, 10) + "T00:00:00Z");
    const d1 = new Date(ateISO.slice(0, 10) + "T00:00:00Z");
    for (let d = d0; d <= d1; d = new Date(d.getTime() + 86400000)) {
      const dia = d.toISOString().slice(0, 10);
      const lista = await marcacoesDoDia(clinica, dia);
      if (!lista) continue;
      for (const a of lista) {
        // formato real: { medico_id, medico, data, hora, nome, status, ... }
        const medicoId = String(a.medico_id ?? a.medico?.id ?? a.profissional?.id ?? "");
        if (medicoId && medicoId !== String(prof.klingo_professional_id)) continue;
        // status D = desmarcado nao ocupa (defensivo: so pulamos o que TEMOS
        // certeza que foi cancelado)
        if (String(a.status || "").toUpperCase() === "D") continue;
        const hora = hhmm(a.hora ?? a.horario ?? a.datahora?.slice?.(11, 16));
        if (!hora) continue; // sem hora nao da pra bloquear slot
        const dataEv = String(a.data ?? dia).slice(0, 10);
        const inicio = `${dataEv}T${hora}:00`;
        const fimH = hhmm(a.hora_fim ?? a.toTime);
        const fim = fimH ? `${dataEv}T${fimH}:00` : `${dataEv}T${somaMin(hora, prof.duracao_min || 30)}:00`;
        if (inicio < ateISO && fim > deISO) {
          eventos.push({ inicio, fim, titulo: `[Klingo] ${a.nome || a.paciente?.nome || "ocupado"}` });
        }
      }
    }
    return eventos;
  } catch (e: any) {
    console.warn("[klingo] eventos falhou:", e.message);
    return [];
  }
}

function somaMin(horaHHMM: string, minutos: number): string {
  const [h, m] = horaHHMM.split(":").map(Number);
  const tot = (h || 0) * 60 + (m || 0) + minutos;
  return `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
}

// ---------- DISPONIBILIDADE real (/agenda/horarios) ----------
// Mesmo papel do list_available_times do Clinicorp: o que o Klingo aceita
// marcar de verdade. Filtra por CRM do profissional quando mapeado.
// Cache por clinica+prof (TTL 10min). null = nao aplicavel/falhou -> NAO filtra.
const CACHE_DISP_MIN = Number(process.env.KLINGO_CACHE_DISP_MIN || 10);
type CacheDisp = { validoAte: number; marcas: Set<string> | null };
const _cacheDisp = new Map<string, CacheDisp>();

export async function marcasDisponiveisKlingo(
  profissionalId: string,
  clinicaId?: string
): Promise<Set<string> | null> {
  try {
    const prof = await getProfissional(profissionalId);
    if (!prof?.klingo_professional_id) return null;
    if (clinicaId && prof.clinica_id !== clinicaId) return null;
    const clinica = await getClinica(prof.clinica_id);
    if (!klingoConectada(clinica)) return null;

    // CBOS do profissional (o /agenda/horarios exige a especialidade). A
    // resposta traz TODOS os profissionais daquela especialidade — cacheamos
    // por clinica+CBOS (28 psicologas = 1 chamada) e filtramos por prof na
    // leitura. Marcas guardadas como "profId|data|HH:MM".
    const cbos = await cbosDoProfissional(clinica, String(prof.klingo_professional_id));
    if (!cbos) return null;
    const chave = `${prof.clinica_id}|${cbos}`;
    const hit = _cacheDisp.get(chave);
    if (hit && hit.validoAte > Date.now()) return filtraProf(hit.marcas, prof.klingo_professional_id);

    const hoje = new Date().toISOString().slice(0, 10);
    const fim = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const r = await kg(clinica.klingo_app_token, "/agenda/horarios", {
      query: {
        inicio: hoje,
        fim,
        especialidade: cbos,
        cnes: clinica.klingo_cnes || undefined,
      },
    });
    if (!r.ok) {
      // fail-open: sem resposta nao filtramos, o espelho do create segue validando
      console.warn("[klingo] /agenda/horarios falhou:", r.erro);
      _cacheDisp.set(chave, { validoAte: Date.now() + CACHE_DISP_MIN * 60_000, marcas: null });
      return null;
    }
    // formato REAL (conta exito): objeto com .horarios = lista de entradas
    // { data, profissional{id}, horarios: {"<id-slot>": "HH:MM"} }
    const marcas = new Set<string>();
    const dias = conteudo(r.data)?.horarios ?? conteudo(r.data);
    if (!Array.isArray(dias)) return null;
    for (const dEntry of dias) {
      const profId = String(dEntry.profissional?.id ?? "");
      const dataDia = String(dEntry.data || "").slice(0, 10);
      if (!dataDia) continue;
      const hs = dEntry.horarios;
      const valores = Array.isArray(hs) ? hs : hs && typeof hs === "object" ? Object.values(hs) : [];
      for (const v of valores) {
        const hora = hhmm(typeof v === "object" ? (v as any)?.hora ?? (v as any)?.horario : v);
        if (hora) marcas.add(`${profId}|${dataDia}|${hora}`);
      }
    }
    _cacheDisp.set(chave, { validoAte: Date.now() + CACHE_DISP_MIN * 60_000, marcas });
    return filtraProf(marcas, prof.klingo_professional_id);
  } catch (e: any) {
    console.warn("[klingo] marcasDisponiveis falhou:", e.message);
    return null;
  }
}

// recorta do cache por especialidade so as marcas do profissional pedido,
// ja no formato "data|HH:MM" que o slotDisponivelKlingo consome
function filtraProf(marcas: Set<string> | null, klingoProfId: any): Set<string> | null {
  if (marcas === null) return null;
  const soDele = new Set<string>();
  const prefixo = `${klingoProfId}|`;
  for (const m of marcas) if (m.startsWith(prefixo)) soDele.add(m.slice(prefixo.length));
  return soDele;
}

// Slot [inicioISO] existe nos horarios marcaveis do Klingo? A granularidade dos
// slots do Klingo e a propria agenda deles, entao basta o INICIO existir.
// marcas=null -> true (nao filtra).
export function slotDisponivelKlingo(marcas: Set<string> | null, inicioISO: string): boolean {
  if (marcas === null) return true;
  return marcas.has(`${inicioISO.slice(0, 10)}|${inicioISO.slice(11, 16)}`);
}

// ---------- ESCREVER: espelhar consulta no Klingo (best-effort) ----------
// Fluxo do Klingo pra marcar: bearer do PACIENTE (identificar por telefone,
// registrando se nao existir) -> achar o id do horario em /agenda/horarios ->
// POST /agenda/horario. Qualquer degrau falhando = alerta LANCAR MANUALMENTE.

async function bearerDoPaciente(
  clinica: any,
  telefone: string,
  nome: string,
  extras?: { cpf?: string; nascimento?: string }
): Promise<string | null> {
  const token = clinica.klingo_app_token;
  const fone = String(telefone).replace(/\D/g, "").replace(/^55/, "");
  // 1) tenta identificar por telefone
  const ident = await kg(token, "/paciente/identificar", {
    method: "POST",
    body: {
      telefone: fone,
      cpf: extras?.cpf || undefined,
      dt_nascimento: extras?.nascimento || undefined,
      apenas_telefone: !extras?.cpf && !extras?.nascimento,
    },
  });
  if (ident.ok && ident.data?.access_token) return String(ident.data.access_token);

  // 2) nao achou: pre-cadastro + login
  const reg = await kg(token, "/externo/register", {
    method: "POST",
    body: { paciente: { nome, contatos: { celular: fone } } },
  });
  const novoId = reg.ok ? reg.data?.id : null;
  if (!novoId) {
    console.warn("[klingo] identificar+register falharam:", ident.erro, "/", reg.erro);
    return null;
  }
  const login = await kg(token, "/externo/login", { method: "POST", body: { id: String(novoId) } });
  if (login.ok && login.data?.access_token) return String(login.data.access_token);
  console.warn("[klingo] login pos-register falhou:", login.erro);
  return null;
}

// Cria o espelho no Klingo. Retorna o id do voucher, ou null (nao conectado /
// prof sem mapeamento / falha — falha REAL dispara alerta pro painel).
export async function criarAgendamentoKlingo(
  consulta: any,
  nomePaciente: string,
  telefone: string,
  extras?: { cpf?: string }
): Promise<string | null> {
  try {
    const clinica = await getClinica(consulta.clinica_id);
    if (!klingoConectada(clinica)) return null;
    const prof = await getProfissional(consulta.profissional_id);
    if (!prof?.klingo_professional_id) {
      console.log("[klingo] profissional sem mapeamento — pulando espelho");
      return null;
    }

    const alerta = async (motivo: string) => {
      await registrarLog(
        consulta.clinica_id,
        "klingo",
        `⚠️ Consulta ${consulta.inicio.slice(8, 10)}/${consulta.inicio.slice(5, 7)} ${consulta.inicio.slice(11, 16)} de ${nomePaciente} com ${prof.nome} NAO caiu no Klingo (${motivo}). LANCAR MANUALMENTE na agenda.`
      ).catch(() => {});
    };

    const bearer = await bearerDoPaciente(clinica, telefone, nomePaciente, { cpf: extras?.cpf });
    if (!bearer) {
      await alerta("nao consegui identificar/cadastrar o paciente");
      return null;
    }

    // acha o ID do horario correspondente na agenda do Klingo (dia + hora + prof)
    const dia = consulta.inicio.slice(0, 10);
    const hora = consulta.inicio.slice(11, 16);
    const cbos = await cbosDoProfissional(clinica, String(prof.klingo_professional_id));
    const busca = await kg(clinica.klingo_app_token, "/agenda/horarios", {
      query: {
        inicio: dia,
        fim: dia,
        especialidade: cbos || undefined,
        cnes: clinica.klingo_cnes || undefined,
      },
      bearer,
    });
    if (!busca.ok) {
      await alerta(`agenda/horarios: ${busca.erro}`);
      return null;
    }
    const dias = conteudo(busca.data)?.horarios ?? conteudo(busca.data);
    let idHorario: string | null = null;
    let procedimento: string | null = null;
    for (const dEntry of Array.isArray(dias) ? dias : []) {
      const profId = String(dEntry.profissional?.id ?? "");
      if (profId && profId !== String(prof.klingo_professional_id)) continue;
      if (String(dEntry.data || "").slice(0, 10) !== dia) continue;
      const hs = dEntry.horarios;
      const pares: [string, any][] = Array.isArray(hs)
        ? hs.map((v: any) => [String(v?.id ?? ""), v])
        : hs && typeof hs === "object" ? Object.entries(hs) : [];
      for (const [hid, v] of pares) {
        const h = hhmm(typeof v === "object" ? (v as any)?.hora ?? (v as any)?.horario : v);
        if (h === hora) {
          idHorario = String((typeof v === "object" && (v as any)?.id) || hid || dEntry.id || "");
          procedimento = String(dEntry.procedimento || "");
          break;
        }
      }
      if (idHorario) break;
    }
    if (!idHorario) {
      await alerta("horario nao existe na agenda do Klingo");
      return null;
    }

    const marca = await kg(clinica.klingo_app_token, "/agenda/horario", {
      method: "POST",
      body: {
        id: idHorario,
        procedimento: procedimento || undefined,
        plano: clinica.klingo_plano ? Number(clinica.klingo_plano) : undefined,
        email: false,
      },
      bearer,
    });
    if (!marca.ok) {
      await alerta(`agenda/horario: ${marca.erro}`);
      return null;
    }
    invalidarCacheKlingo(consulta.clinica_id);
    const voucher = marca.data?.id ?? marca.data?.voucher ?? null;
    console.log("[klingo] espelho criado, voucher:", voucher);
    return voucher ? String(voucher) : null;
  } catch (e: any) {
    console.warn("[klingo] criar espelho falhou:", e.message);
    return null;
  }
}

// Cancela o espelho (DELETE /voucher precisa do bearer do paciente).
export async function cancelarAgendamentoKlingo(
  clinicaId: string,
  voucherId: string,
  telefone?: string,
  nomePaciente?: string
): Promise<boolean> {
  try {
    const clinica = await getClinica(clinicaId);
    if (!klingoConectada(clinica) || !voucherId) return false;
    const bearer = telefone
      ? await bearerDoPaciente(clinica, telefone, nomePaciente || telefone)
      : null;
    if (!bearer) {
      await registrarLog(
        clinicaId,
        "klingo",
        `⚠️ Nao consegui CANCELAR o voucher ${voucherId} no Klingo (sem identificacao do paciente). Cancelar manualmente.`
      ).catch(() => {});
      return false;
    }
    const r = await kg(clinica.klingo_app_token, "/voucher", {
      method: "DELETE",
      body: { id: String(voucherId) },
      bearer,
    });
    if (!r.ok) {
      console.warn("[klingo] cancelar voucher falhou:", r.erro);
      await registrarLog(
        clinicaId,
        "klingo",
        `⚠️ Nao consegui CANCELAR o voucher ${voucherId} no Klingo (${r.erro}). Cancelar manualmente.`
      ).catch(() => {});
      return false;
    }
    invalidarCacheKlingo(clinicaId);
    return true;
  } catch (e: any) {
    console.warn("[klingo] cancelar espelho falhou:", e.message);
    return false;
  }
}
