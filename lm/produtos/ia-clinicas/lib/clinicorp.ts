// Conector Clinicorp — agenda PRINCIPAL de clinicas odontologicas (ex: Instituto
// Odonto Compass). Espelha a agenda pra nao ter divergencia/overbooking:
//  - LER: agendamentos do Clinicorp aparecem no painel e bloqueiam slots da IA
//  - ESCREVER: consulta marcada pela IA e espelhada no Clinicorp (best-effort)
//
// Docs (Swagger oficial): https://sistema.clinicorp.com/api-docs
// Base: https://api.clinicorp.com/rest/v1
// AUTH: HTTP Basic — Username = usuario API (ID de acesso ao Sistema),
//       Password = Token API. Onde achar: Sistema > Gerenciar Assinatura >
//       Acesso Externo e Integracoes > Usuario API (login) | Token API (senha).
// A maioria dos endpoints exige tambem subscriber_id (a assinatura/clinica no
// grupo Clinicorp); alguns aceitam businessId (unidade).
// Datas: YYYY-MM-DD. Horarios: HH:MM (campo fromTime/toTime).
//
// TUDO best-effort: falha no Clinicorp NUNCA derruba o fluxo local — loga,
// alerta quando importa, e segue. A fonte local continua sozinha.
//
// NOTA: como a doc publica traz poucos exemplos de resposta, os mapeamentos sao
// defensivos (aceitam aliases). Validar no primeiro teste com o token real —
// so falta o cliente liberar o Token API do Clinicorp pra plugar.

import { getClinica, getProfissional, registrarLog } from "./db";

const BASE = process.env.CLINICORP_API_URL || "https://api.clinicorp.com/rest/v1";

// pronta pra usar quando a clinica tem usuario API + token + subscriber_id
export function clinicorpConectada(clinica: any): boolean {
  return Boolean(
    clinica?.clinicorp_api_user && clinica?.clinicorp_token && clinica?.clinicorp_subscriber_id
  );
}

// header Basic a partir de usuario+token da clinica
function basicAuth(apiUser: string, token: string): string {
  return "Basic " + Buffer.from(`${apiUser}:${token}`).toString("base64");
}

// request generica com timeout e parse defensivo
async function cc(
  auth: { apiUser: string; token: string },
  path: string,
  opts?: { method?: string; body?: any; query?: Record<string, any> }
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
    const res = await fetch(url, {
      method: opts?.method || "GET",
      headers: {
        Authorization: basicAuth(auth.apiUser, auth.token),
        "Content-Type": "application/json",
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(12_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        erro: data?.message || data?.error || `HTTP ${res.status}`,
        data,
      };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// a Clinicorp costuma devolver array direto, ou embrulhar em { data }/{ results }
function conteudo(data: any): any {
  if (Array.isArray(data)) return data;
  return data?.data ?? data?.results ?? data?.appointments ?? data?.list ?? data;
}

// credenciais da clinica no formato do `cc`
function auth(clinica: any): { apiUser: string; token: string } {
  return { apiUser: clinica.clinicorp_api_user, token: clinica.clinicorp_token };
}

// ---------- CACHE da agenda (o Clinicorp limita a API em 25 req/HORA!) ----------
// Uma unica chamada cobre a janela -14d..+35d e alimenta TUDO (pagina de
// agenda, oferta de horarios da IA, validacao do agendar) por CACHE_MIN
// minutos. Sem isso, 6 aberturas da pagina (4 dentistas) ja estouravam o
// limite. TTL ajustavel por env (se a clinica comprar o pacote de 100 req/h,
// da pra baixar). Single-flight: chamadas simultaneas dividem a MESMA request.
const CACHE_MIN = Number(process.env.CLINICORP_CACHE_MIN || 8);
const JANELA_PASSADO_D = 14;
const JANELA_FUTURO_D = 35;
type CacheAgenda = { validoAte: number; de: string; ate: string; lista: any[] };
const _cacheAgenda = new Map<string, CacheAgenda>();
const _emVoo = new Map<string, Promise<any[] | null>>();

async function listaAgendaCacheada(clinica: any): Promise<any[] | null> {
  const chave = String(clinica.id);
  const hit = _cacheAgenda.get(chave);
  if (hit && hit.validoAte > Date.now()) return hit.lista;
  const voando = _emVoo.get(chave);
  if (voando) return voando;
  const p = (async () => {
    const agora = new Date();
    const de = new Date(agora.getTime() - JANELA_PASSADO_D * 86400000).toISOString().slice(0, 10);
    const ate = new Date(agora.getTime() + JANELA_FUTURO_D * 86400000).toISOString().slice(0, 10);
    const r = await cc(auth(clinica), "/appointment/list", {
      query: {
        subscriber_id: clinica.clinicorp_subscriber_id,
        from: de,
        to: ate,
        businessId: clinica.clinicorp_business_id || undefined,
      },
    });
    if (!r.ok) {
      console.warn("[clinicorp] appointment/list falhou:", r.erro);
      return hit?.lista ?? null; // cache velho e melhor que nada
    }
    const lista = conteudo(r.data);
    const arr = Array.isArray(lista) ? lista : [];
    _cacheAgenda.set(chave, { validoAte: Date.now() + CACHE_MIN * 60_000, de, ate, lista: arr });
    return arr;
  })().finally(() => _emVoo.delete(chave));
  _emVoo.set(chave, p);
  return p;
}

// invalida apos criar/cancelar espelho — o proximo leitor rebusca e ve o novo
export function invalidarCacheAgendaClinicorp(clinicaId: string) {
  _cacheAgenda.delete(String(clinicaId));
}

// "HH:MM[:SS]" -> "HH:MM" ; soma minutos pra derivar o fim quando so vem inicio
function hhmm(s: any): string {
  return String(s || "").slice(0, 5);
}
function somaMin(diaISO: string, horaHHMM: string, minutos: number): string {
  const [h, m] = horaHHMM.split(":").map(Number);
  const tot = (h || 0) * 60 + (m || 0) + minutos;
  const H = String(Math.floor(tot / 60)).padStart(2, "0");
  const M = String(tot % 60).padStart(2, "0");
  return `${diaISO}T${H}:${M}:00`;
}

// ---------- validacao / listas (pro setup da integracao) ----------

// Valida as credenciais fazendo uma chamada leve. Recebe as 3 infos que a tela
// vai coletar. Retorna ok + (quando da) o nome dos profissionais achados.
export async function validarClinicorp(cred: {
  apiUser: string;
  token: string;
  subscriberId: string;
}): Promise<{ ok: boolean; erro?: string; profissionais?: number }> {
  const r = await cc({ apiUser: cred.apiUser, token: cred.token }, "/professional/list_all_professionals");
  if (!r.ok) return { ok: false, erro: r.erro || "credenciais recusadas pelo Clinicorp" };
  const lista = conteudo(r.data);
  return { ok: true, profissionais: Array.isArray(lista) ? lista.length : 0 };
}

export async function listarProfissionaisClinicorp(
  clinica: any
): Promise<{ id: string; nome: string; especialidade: string }[]> {
  if (!clinicorpConectada(clinica)) return [];
  const r = await cc(auth(clinica), "/professional/list_all_professionals", {
    query: { subscriber_id: clinica.clinicorp_subscriber_id },
  });
  if (!r.ok) return [];
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return [];
  return lista
    .map((p: any) => ({
      // ids/nomes variam de conta — aceita os aliases mais provaveis da doc
      id: String(p.PersonId ?? p.Professional_PersonId ?? p.id ?? p.Id ?? ""),
      nome: String(p.Name ?? p.PersonName ?? p.nome ?? p.name ?? "(sem nome)"),
      especialidade: String(p.Specialty ?? p.Expertise ?? p.especialidade ?? ""),
    }))
    .filter((p) => p.id);
}

// ---------- LER: agenda do Clinicorp (aparece no painel + bloqueia slots) ----------

// Agendamentos do profissional (mapeado) numa janela de datas ISO (YYYY-MM-DD).
// Retorna no formato interno wall-clock SP: { inicio, fim, titulo, origem } —
// MESMA forma de eventosFeegow/eventosDoMedico, pra a pagina de agenda mesclar
// tudo igual. Devolve null quando nao aplicavel (sem mapeamento/sem conexao) pra
// a pagina cair no fallback da agenda interna (nao esvazia a tela).
export async function eventosClinicorp(
  profissionalId: string,
  deISO: string,
  ateISO: string,
  clinicaId?: string
): Promise<{ inicio: string; fim: string; titulo: string; origem: string }[] | null> {
  try {
    const prof = await getProfissional(profissionalId);
    if (!prof?.clinicorp_professional_id) return null;
    if (clinicaId && prof.clinica_id !== clinicaId) return null; // isolamento
    const clinica = await getClinica(prof.clinica_id);
    if (!clinicorpConectada(clinica)) return null;

    // CACHE compartilhado (limite 25 req/h da API) — filtra a janela pedida aqui
    const lista = await listaAgendaCacheada(clinica);
    if (lista === null) return null; // falha != vazio — deixa a agenda interna assumir

    const alvo = String(prof.clinicorp_professional_id);
    const duracaoPadrao = prof.duracao_min || 30;

    // status cancelado nao ocupa slot. A doc nao fixa os codigos, entao filtramos
    // por marcadores comuns de cancelamento (defensivo — validar com token real).
    const cancelado = (a: any) => {
      const s = String(a.Status ?? a.status ?? a.StatusName ?? "").toLowerCase();
      return Boolean(a.Canceled ?? a.canceled) || s.includes("cancel") || s.includes("falt");
    };

    return lista
      .filter((a: any) => {
        // so os desse dentista (aceita varios aliases do id do profissional)
        const pid = String(
          a.Dentist_PersonId ?? a.Professional_PersonId ?? a.DentistId ?? a.ProfessionalId ?? ""
        );
        if (pid !== alvo || cancelado(a)) return false;
        // janela pedida (o cache cobre -14d..+35d; recorta aqui)
        const dia = String(a.date ?? a.Date ?? a.AtomicDate ?? "").slice(0, 10);
        return dia >= deISO.slice(0, 10) && dia <= ateISO.slice(0, 10);
      })
      .map((a: any) => {
        // data: aceita 'date' (YYYY-MM-DD) ou 'AtomicDate' (ISO)
        const rawData = String(a.date ?? a.Date ?? a.AtomicDate ?? "");
        const dia = rawData.slice(0, 10);
        const hora = hhmm(a.fromTime ?? a.FromTime ?? a.from ?? rawData.slice(11, 16));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) return null;
        const inicio = `${dia}T${hora}:00`;
        // fim: usa toTime se veio, senao inicio + duracao do profissional
        const toH = hhmm(a.toTime ?? a.ToTime ?? a.to);
        const fim = /^\d{2}:\d{2}$/.test(toH)
          ? `${dia}T${toH}:00`
          : somaMin(dia, hora, duracaoPadrao);
        return {
          inicio,
          fim,
          titulo: String(a.PatientName ?? a.Patient_Name ?? "Agendado no Clinicorp"),
          origem: "clinicorp",
          agendamento_id: String(a.id ?? a.Id ?? a.AppointmentId ?? ""),
        };
      })
      .filter(Boolean) as any[];
  } catch (e: any) {
    console.warn("[clinicorp] eventosClinicorp falhou:", e.message);
    return null;
  }
}


// ---------- HORARIOS DISPONIVEIS reais (enxerga BLOQUEIOS de agenda) ----------
// O /appointment/list NAO devolve bloqueios (almoco, reuniao, trava de agenda),
// mas o validador do create enxerga — caso real 10/08: IA ofereceu 16:30 pra
// Jaqueline, o create respondeu "horario ocupado" (tarde toda bloqueada) e a
// marcacao nao caiu na agenda deles. /business/list_available_times devolve os
// slots REALMENTE marcaveis (15min cada). Cache proprio por profissional
// (TTL 10min, janela hoje..+14d) pra caber no limite de 25 req/h.
const CACHE_DISP_MIN = Number(process.env.CLINICORP_CACHE_DISP_MIN || 10);
type CacheDisp = { validoAte: number; marcas: Set<string> };
const _cacheDisp = new Map<string, CacheDisp>();
const _emVooDisp = new Map<string, Promise<Set<string> | null>>();

// Set de marcas "YYYY-MM-DD|HH:MM" (fatias de 15min) que o Clinicorp aceita
// marcar pro profissional. null = nao aplicavel/falhou (quem chama NAO bloqueia).
export async function marcasDisponiveisClinicorp(
  profissionalId: string,
  clinicaId?: string
): Promise<Set<string> | null> {
  try {
    const prof = await getProfissional(profissionalId);
    if (!prof?.clinicorp_professional_id) return null;
    if (clinicaId && prof.clinica_id !== clinicaId) return null;
    const clinica = await getClinica(prof.clinica_id);
    if (!clinicorpConectada(clinica) || !clinica.clinicorp_business_id) return null;

    const chave = `${prof.clinica_id}|${prof.clinicorp_professional_id}`;
    const hit = _cacheDisp.get(chave);
    if (hit && hit.validoAte > Date.now()) return hit.marcas;
    const voando = _emVooDisp.get(chave);
    if (voando) return voando;

    const p = (async () => {
      const hoje = new Date();
      const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
      const r = await cc(auth(clinica), "/business/list_available_times", {
        query: {
          subscriber_id: clinica.clinicorp_subscriber_id,
          professionalId: prof.clinicorp_professional_id,
          clinicId: clinica.clinicorp_business_id,
          fromDate: fmt(hoje),
          toDate: fmt(new Date(hoje.getTime() + 14 * 86400000)),
        },
      });
      if (!r.ok) {
        console.warn("[clinicorp] list_available_times falhou:", r.erro);
        return hit?.marcas ?? null;
      }
      const dias = conteudo(r.data);
      if (!Array.isArray(dias)) return null;
      const marcas = new Set<string>();
      for (const d of dias) {
        const raw = String(d.date ?? "");
        const dia = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw.slice(0, 10);
        for (const sl of d.slots || []) {
          // ATENCAO: a Clinicorp manda horario SEM zero a esquerda ("9:45") —
          // comparar como string trava em loop infinito. Tudo em MINUTOS.
          const min = (t: any) => {
            const [h, m] = String(t || "").split(":").map(Number);
            return (h || 0) * 60 + (m || 0);
          };
          const de = min(sl.fromTime);
          const ate = min(sl.toTime);
          if (!(ate > de) || ate - de > 24 * 60) continue; // faixa invalida
          // expande a faixa em fatias de 15min (ex: 10:45-11:15 -> 10:45, 11:00)
          for (let t = de; t < ate; t += 15) {
            marcas.add(`${dia}|${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
          }
        }
      }
      _cacheDisp.set(chave, { validoAte: Date.now() + CACHE_DISP_MIN * 60_000, marcas });
      return marcas;
    })().finally(() => _emVooDisp.delete(chave));
    _emVooDisp.set(chave, p);
    return p;
  } catch (e: any) {
    console.warn("[clinicorp] marcasDisponiveis falhou:", e.message);
    return null;
  }
}

// Um intervalo [inicioISO, fimISO) cabe nos horarios marcaveis do Clinicorp?
// marcas=null (nao aplicavel/falha) -> true (nao bloqueia; fallback no create).
export function intervaloDisponivelClinicorp(
  marcas: Set<string> | null,
  inicioISO: string,
  fimISO: string
): boolean {
  if (marcas === null) return true;
  const dia = inicioISO.slice(0, 10);
  const de = Number(inicioISO.slice(11, 13)) * 60 + Number(inicioISO.slice(14, 16));
  const ate = Number(fimISO.slice(11, 13)) * 60 + Number(fimISO.slice(14, 16));
  if (!(ate > de)) return false;
  for (let t = de; t < ate; t += 15) {
    if (!marcas.has(`${dia}|${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`)) return false;
  }
  return true;
}

// ---------- ESCREVER: espelhar consulta no Clinicorp (best-effort) ----------

// Cria o agendamento no Clinicorp espelhando a consulta local. Retorna o id do
// agendamento no Clinicorp, ou null (com log — a recepcao lanca manual).
// Odontologia: sem exame, agendamento simples de consulta.
export async function criarAgendamentoClinicorp(
  consulta: any,
  nomePaciente: string,
  telefone: string
): Promise<string | null> {
  try {
    const clinica = await getClinica(consulta.clinica_id);
    if (!clinicorpConectada(clinica)) return null;
    const prof = await getProfissional(consulta.profissional_id);
    if (!prof?.clinicorp_professional_id) {
      console.log("[clinicorp] profissional sem mapeamento — pulando espelho");
      return null;
    }

    const dia = consulta.inicio.slice(0, 10);
    const fromTime = hhmm(consulta.inicio.slice(11, 16));
    const toTime = hhmm((consulta.fim || "").slice(11, 16)) || fromTime;

    // TESTADO NA CONTA REAL DA COMPASS (05/08): a API EXIGE os ids como NUMBER
    // ("Dentist_PersonId nao pode ser string") e NAO aceita ScheduleToId junto
    // de Dentist_PersonId ("Agendamento por Cadeira e Profissional ao mesmo
    // tempo"). Ids como string eram o motivo do espelho nunca chegar la.
    const r = await cc(auth(clinica), "/appointment/create_appointment_by_api", {
      method: "POST",
      body: {
        subscriber_id: clinica.clinicorp_subscriber_id,
        PatientName: nomePaciente,
        MobilePhone: telefone,
        date: dia,
        fromTime,
        toTime,
        Dentist_PersonId: Number(prof.clinicorp_professional_id),
        Clinic_BusinessId: clinica.clinicorp_business_id
          ? Number(clinica.clinicorp_business_id)
          : undefined,
        Notes: consulta.observacao || "Agendado pela IA",
      },
    });
    if (!r.ok) {
      // ALERTA no log de atividades — antes era so console.warn e a clinica
      // NUNCA ficava sabendo que a consulta nao caiu na agenda deles (caso
      // real 10/08: teste 16:30 marcou local e sumiu do Clinicorp em silencio).
      console.warn("[clinicorp] criar agendamento falhou:", r.erro);
      await registrarLog(
        consulta.clinica_id,
        "clinicorp",
        `⚠️ Consulta ${consulta.inicio.slice(8, 10)}/${consulta.inicio.slice(5, 7)} ${consulta.inicio.slice(11, 16)} de ${nomePaciente} com ${prof.nome} NAO caiu no Clinicorp (${r.erro}). LANCAR MANUALMENTE na agenda.`
      ).catch(() => {});
      return null;
    }
    const c = conteudo(r.data);
    const id = c?.id ?? c?.Id ?? c?.AppointmentId ?? (Array.isArray(c) ? c[0]?.id : null);
    if (id) invalidarCacheAgendaClinicorp(consulta.clinica_id); // proximo leitor ve o novo
    return id ? String(id) : null;
  } catch (e: any) {
    console.warn("[clinicorp] criarAgendamentoClinicorp falhou:", e.message);
    return null;
  }
}

// Cancela o agendamento espelhado no Clinicorp (paciente desmarcou pela IA ou
// painel). Best-effort: retorna false em falha (quem chama alerta se importar).
// Shape validado na conta real (05/08): POST cancel_appointment {subscriber_id, id:Number}.
export async function cancelarAgendamentoClinicorp(
  clinicaId: string,
  agendamentoId: string
): Promise<boolean> {
  try {
    const clinica = await getClinica(clinicaId);
    if (!clinicorpConectada(clinica) || !agendamentoId) return false;
    const r = await cc(auth(clinica), "/appointment/cancel_appointment", {
      method: "POST",
      body: { subscriber_id: clinica.clinicorp_subscriber_id, id: Number(agendamentoId) },
    });
    if (!r.ok) console.warn("[clinicorp] cancelar falhou:", r.erro);
    if (r.ok) invalidarCacheAgendaClinicorp(clinicaId);
    return r.ok;
  } catch (e: any) {
    console.warn("[clinicorp] cancelarAgendamentoClinicorp falhou:", e.message);
    return false;
  }
}
