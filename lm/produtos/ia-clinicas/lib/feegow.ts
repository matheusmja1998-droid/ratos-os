// Conector Feegow — a agenda PRINCIPAL do cliente. Espelhamento bidirecional:
//  - LER: agendamentos do Feegow bloqueiam os slots da IA e aparecem no painel
//  - ESCREVER: consulta marcada/remarcada/cancelada aqui e espelhada no Feegow
//
// Docs: https://docs.feegow.com — auth via header x-access-token (o usuario
// master da licenca libera o token na interface do Feegow Clinic).
// Datas da Feegow: DD-MM-YYYY; horarios: HH:MM:SS.
//
// TUDO best-effort: falha na Feegow NUNCA derruba o fluxo local — loga, alerta
// quando importa, e segue. A fonte local continua funcionando sozinha.
//
// NOTA: os campos de resposta seguem a doc publica (agendamento_id, data,
// horario, profissional_id...). Mapeamentos sao defensivos (aceitam aliases)
// porque contas Feegow variam de versao — validar no primeiro teste com token real.

import { getClinica, getProfissional, registrarLog } from "./db";
import { enviarAlerta } from "./alertas";

const BASE = process.env.FEEGOW_API_URL || "https://api.feegow.com/v1/api";

export function feegowConectada(clinica: any): boolean {
  return Boolean(clinica?.feegow_token);
}

// request generica com timeout e parse defensivo
async function fg(
  token: string,
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
        "x-access-token": token,
        "Content-Type": "application/json",
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(12_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: res.status, erro: data?.message || data?.error || `HTTP ${res.status}`, data };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// a Feegow costuma embrulhar em { content: [...] } ou { success, content }
function conteudo(data: any): any {
  return data?.content ?? data?.dados ?? data;
}

// "2026-07-20" -> "20-07-2026" (formato da Feegow)
function dataFeegow(isoData: string): string {
  const [y, m, d] = isoData.split("-");
  return `${d}-${m}-${y}`;
}
// "20-07-2026" -> "2026-07-20"
function dataISO(feegowData: string): string {
  const p = String(feegowData || "").split("-");
  if (p.length !== 3) return "";
  return p[0].length === 4 ? `${p[0]}-${p[1]}-${p[2]}` : `${p[2]}-${p[1]}-${p[0]}`;
}

// ---------- validacao / listas (pro setup da integracao) ----------

export async function validarTokenFeegow(token: string): Promise<{ ok: boolean; erro?: string }> {
  const r = await fg(token, "/professional/list");
  if (!r.ok) return { ok: false, erro: r.erro || "token recusado pela Feegow" };
  return { ok: true };
}

export async function listarProfissionaisFeegow(
  token: string
): Promise<{ id: string; nome: string; especialidade_id: string; especialidade_nome: string }[]> {
  const r = await fg(token, "/professional/list");
  if (!r.ok) return [];
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return [];
  return lista
    .map((p: any) => {
      // o professional/list ja traz as especialidades embutidas — pega a 1a
      const esp = Array.isArray(p.especialidades) && p.especialidades[0] ? p.especialidades[0] : null;
      return {
        id: String(p.profissional_id ?? p.id ?? ""),
        nome: String(p.nome ?? p.nome_completo ?? p.name ?? "(sem nome)"),
        especialidade_id: esp ? String(esp.especialidade_id ?? "") : "",
        especialidade_nome: esp ? String(esp.nome_especialidade ?? esp.nome ?? "") : "",
      };
    })
    .filter((p) => p.id);
}

export async function listarEspecialidadesFeegow(token: string): Promise<{ id: string; nome: string }[]> {
  const r = await fg(token, "/specialties/list");
  if (!r.ok) return [];
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return [];
  return lista
    .map((e: any) => ({
      id: String(e.especialidade_id ?? e.id ?? ""),
      nome: String(e.nome ?? e.especialidade ?? "(sem nome)"),
    }))
    .filter((e) => e.id);
}

export async function listarProcedimentosFeegow(
  token: string
): Promise<{ id: string; nome: string; ehExame: boolean; tempo: number }[]> {
  const r = await fg(token, "/procedures/list");
  if (!r.ok) return [];
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return [];
  return lista
    .map((p: any) => ({
      id: String(p.procedimento_id ?? p.id ?? ""),
      nome: String(p.nome ?? p.procedimento ?? "(sem nome)"),
      // tipo_procedimento 3 = exame/procedimento (na conta da Pulmonar);
      // 2 = consulta, 9 = retorno. Marca exames pra IA saber o catalogo real.
      ehExame: Number(p.tipo_procedimento) === 3,
      tempo: Number(p.tempo) || 0,
    }))
    .filter((p) => p.id)
    .slice(0, 300);
}

// Catalogo de EXAMES da clinica (procedimentos tipo 3) — a IA usa pra validar
// a guia (o exame pedido existe aqui?) e pra saber o procedimento_id de marcar.
export async function listarExamesFeegow(token: string): Promise<{ id: string; nome: string; tempo: number }[]> {
  const todos = await listarProcedimentosFeegow(token);
  const exames = todos.filter((p) => p.ehExame).map(({ id, nome, tempo }) => ({ id, nome, tempo }));
  // POLI INFANTIL nao existe como procedimento separado na Feegow (e o proc 16
  // marcado nos quartos K). Entrada sintetica no catalogo pra IA poder escolher
  // a variante certa pela guia — na Feegow vira proc 16 via procFeegowReal().
  const poli = exames.find((e) => e.id === "16");
  if (poli && !exames.some((e) => e.id === "16K")) {
    exames.push({ id: "16K", nome: "Polissonografia INFANTIL (crianca de 5 anos ou mais)", tempo: poli.tempo });
  }
  return exames;
}

// AGENDA DE EXAMES da clinica (todos os exames marcados no periodo). Exame no
// Feegow = profissional_id 0 + procedimento tipo 3. Traz cada exame com hora,
// tipo (nome do procedimento), paciente e o exame_id — pro painel mostrar a
// agenda de exames separada da agenda de medico. Ao vivo, direto do Feegow.
export async function agendaExamesFeegow(
  token: string,
  deISO: string,
  ateISO: string,
  localId?: string | null // UNIDADE (BH/Betim): filtra so os exames desse local
): Promise<
  {
    agendamentoId: string;
    inicio: string;
    fim: string;
    procedimentoId: string;
    procedimentoNome: string;
    pacienteId: string;
    status: number;
  }[]
> {
  const r = await fg(token, "/appoints/search", {
    query: { data_start: dataFeegow(deISO.slice(0, 10)), data_end: dataFeegow(ateISO.slice(0, 10)) },
  });
  if (!r.ok) return [];
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return [];

  // mapa procedimento_id -> nome (1 chamada so, rapida) e set dos que sao exame
  const procs = await listarProcedimentosFeegow(token);
  const nomeProc = new Map(procs.map((p) => [String(p.id), p.nome]));
  const ehExameProc = new Set(procs.filter((p) => p.ehExame).map((p) => String(p.id)));

  const STATUS_ATIVOS = new Set([1, 2, 3, 4, 5, 7]); // exclui cancelado/faltou
  // UNIDADE: os quartos de exame de BH ficam em VARIOS local_id (cada quarto de
  // Poli e um local). Entao filtramos por EXCLUSAO: mostra tudo, menos os locais
  // de outra unidade (ex: Betim = local 2). localId aqui e a lista a EXCLUIR.
  const locaisExcluir = new Set(
    String(localId || "").split(",").map((s) => s.trim()).filter(Boolean)
  );

  // NAO resolve nome de paciente aqui (seria 1 chamada por exame = lento). So o
  // pacienteId; os nomes vem depois, sob demanda, via nomesPacientesFeegow.
  return lista
    .filter((a: any) => {
      const ehExame = Number(a.profissional_id) === 0 || ehExameProc.has(String(a.procedimento_id));
      const st = Number(a.status_id);
      const naUnidade = !locaisExcluir.has(String(a.local_id)); // fora da unidade excluida
      return ehExame && naUnidade && (!Number.isFinite(st) || STATUS_ATIVOS.has(st));
    })
    .map((a: any) => {
      const dia = dataISO(String(a.data ?? ""));
      const hora = String(a.horario ?? a.hora ?? "").slice(0, 5);
      if (!dia || !hora) return null;
      const dur = Number(a.duracao) > 0 ? Number(a.duracao) : 30;
      const [h, m] = hora.split(":").map(Number);
      const tot = h * 60 + m + dur;
      const pid = String(a.procedimento_id ?? "");
      return {
        agendamentoId: String(a.agendamento_id ?? a.id ?? ""),
        inicio: `${dia}T${hora}:00`,
        fim: `${dia}T${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}:00`,
        procedimentoId: pid,
        procedimentoNome: nomeProc.get(pid) || `Exame ${pid}`,
        pacienteId: String(a.paciente_id ?? ""),
        status: Number(a.status_id) || 0,
      };
    })
    .filter(Boolean) as any[];
}

// resolve nomes de varios pacientes pelo id, EM PARALELO (a busca de agenda so
// devolve o id). Usado sob demanda depois que a lista ja apareceu na tela.
export async function nomesPacientesFeegow(token: string, ids: string[]): Promise<Record<string, string>> {
  const unicos = Array.from(new Set(ids.filter(Boolean))).slice(0, 80);
  const resultados = await Promise.all(
    unicos.map(async (id) => {
      try {
        const r = await fg(token, "/patient/search", { query: { paciente_id: id } });
        if (r.ok) {
          const c = conteudo(r.data);
          const p = Array.isArray(c) ? c[0] : c;
          const nome = p?.nome_completo || p?.nome || p?.nome_paciente;
          if (nome) return [id, String(nome)] as [string, string];
        }
      } catch {
        /* ignora */
      }
      return [id, ""] as [string, string];
    })
  );
  const mapa: Record<string, string> = {};
  for (const [id, nome] of resultados) if (nome) mapa[id] = nome;
  return mapa;
}

// Horarios livres de um PROCEDIMENTO (exame) no Feegow — fonte da verdade que
// ja respeita a agenda propria do exame, bloco de tempo e pacotes casados
// (ex: proc 14 = Prova+Pletis+DLCO juntos). Retorna [{ data 'YYYY-MM-DD',
// horarios ['HH:MM',...] }] agregando por dia (todos os profissionais/locais).
export async function horariosExameFeegow(
  token: string,
  procedimentoId: string,
  deISO: string,
  ateISO: string,
  localId?: string | null
): Promise<{ data: string; horarios: string[] }[]> {
  const detalhado = await horariosExameFeegowDetalhado(token, procedimentoId, deISO, ateISO, localId);
  const porDia = new Map<string, Set<string>>();
  for (const slot of detalhado) {
    const set = porDia.get(slot.data) || new Set<string>();
    set.add(slot.hora);
    porDia.set(slot.data, set);
  }
  return Array.from(porDia.entries())
    .map(([data, hs]) => ({ data, horarios: Array.from(hs).sort() }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

// versao detalhada: cada horario com a AGENDA (profissional_id do Feegow, que
// pra exame e a sala/tecnico) e o local. Usado pra saber em qual agenda de
// exame marcar (exame nao tem medico — vai pra agenda do proprio exame).
// ---------- POLISSONOGRAFIA: quartos e unidade (mapeamento definitivo) ----------
// Fonte: /company/list-local (cadeado liberado 20/07) + analise de 90 dias
// cruzando quarto x recepcionista. A filial Betim NAO existe como unidade no
// Feegow (list-unity: unidades=[]) — a separacao real e por QUARTO:
//  - Betim dorme nos quartos 27(Q-01), 4(Q-02), 5(Q-03), 6(Q-04), 7(Q-05).
//    (compartilhados com BH em parte — quem separa e a agenda da UI deles)
//  - BH-EXCLUSIVOS (recepcao de Betim = zero usos em 90d): 8-17 (Q-06..Q-16),
//    25 (Q-18), 26 (Q-17). E onde a IA pode marcar com unidade garantida.
// Cada quarto = 1 paciente por noite. Entrada padrao 20:30 (minutos 20:3x sao
// so a ordem de chegada das camas).
// A IA marca TODAS as variantes de poli (ordem do Matheus 21/07):
//  - COMUM (proc 16): quartos adultos BH, varias por noite, entrada 20:30.
//  - INFANTIL (sentinela "16K" -> proc real 16): quartos K (Q-01K/Q-02K/Q-12K),
//    entrada 20:45 (convencao real: 29 de 43 no historico). So criancas 5+.
//  - CPAP/Split-Night (proc 17): quarto proprio (Q-03 CPAP, local 18), UMA por
//    noite, sempre 20:46 (65 de 67 no historico).
const POLI_PROC = "16";
const POLI_INFANTIL_PROC = "16K"; // id sintetico do catalogo — vira proc 16 na Feegow
const CPAP_PROC = "17";
const POLI_QUARTOS_BH = ["8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "25", "26"];
const POLI_QUARTOS_K = ["22", "23", "24"]; // Q-01K, Q-02K, Q-12K (infantil)
const CPAP_QUARTO = "18"; // Q-03 CPAP
const POLI_HORA_PADRAO = "20:30";
const POLI_INFANTIL_HORA = "20:45";
const CPAP_HORA = "20:46";
// minutos que a poli comum NAO pode tomar (sao a senha de outros quartos)
const MINUTOS_RESERVADOS_COMUM = new Set([POLI_INFANTIL_HORA, CPAP_HORA]);
const MINUTOS_RESERVADOS_INFANTIL = new Set([CPAP_HORA]);

// id sintetico -> procedimento real da Feegow
export function procFeegowReal(id: string): string {
  return String(id) === POLI_INFANTIL_PROC ? POLI_PROC : String(id);
}

type PoliVariante = "comum" | "infantil" | "cpap";
function poliVariante(procedimentoId: string): PoliVariante | null {
  const p = String(procedimentoId);
  if (p === POLI_PROC) return "comum";
  if (p === POLI_INFANTIL_PROC) return "infantil";
  if (p === CPAP_PROC) return "cpap";
  return null;
}

// CAPACIDADE DA NOITE (poli comum): 18 quartos so de poli (confirmado pelo
// Matheus/clinica 21/07). ATENCAO — a recepcao lanca a poli quase sempre no
// LOCAL 1 (balde BH), NAO no local do quarto (21/07 tinha 22 marcacoes na
// noite e todos os quartos "livres"; ate "Consulta" noturna ocupa cama). Por
// isso ocupacao por quarto ENGANA: a ocupacao real da noite e a CONTAGEM DE
// CAMAS — marcacoes ativas 20:15+ que nao estao nos quartos especiais.
// Capacidade OFICIAL (gestora, 22/07 por WhatsApp): "temos 17 quartos.
// 1 infantil e 1 cpap" -> 15 QUARTOS COMUNS + 1 infantil + 1 CPAP.
// BETIM NAO ENTRA NA CONTA (dorme nos quartos proprios): sem essa exclusao o
// contador somava as polis de Betim e fechava noite com vaga (bug real 21/07:
// IA so oferecia 09/08 com a semana aberta).
const POLI_CAPACIDADE_NOITE = 15;
// quartos FORA das camas comuns de BH: CPAP(18), BIPAP(19), SLEEPUP(20),
// DOMICILIAR(21) e os infantis K (22,23,24)
const LOCAIS_FORA_DAS_18 = new Set(["18", "19", "20", "21", "22", "23", "24"]);
// Betim: unidade (2) + quartos que a recepcao de Betim usa (Q-01..Q-05)
const LOCAIS_BETIM = new Set(["2", "27", "4", "5", "6", "7"]);

function capacidadePoliNoite(_diaISO: string): number {
  return POLI_CAPACIDADE_NOITE;
}

// noites da janela com vaga pra variante pedida; devolve o quarto livre de
// cada noite (1 chamada so pra janela inteira).
//  - comum: vaga = camas ocupadas < 18 (contagem, nao quarto) + um quarto BH
//    livre pro espelho.
//  - infantil: vaga = quarto K livre.
//  - cpap: vaga = noite SEM outra CPAP (1 unica por noite) + quarto CPAP livre.
async function noitesPoliLivres(
  token: string,
  deISO: string,
  ateISO: string,
  variante: PoliVariante
): Promise<{ data: string; localId: string }[]> {
  const r = await fg(token, "/appoints/search", {
    query: { data_start: dataFeegow(deISO.slice(0, 10)), data_end: dataFeegow(ateISO.slice(0, 10)) },
  });
  if (!r.ok) return [];
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return [];
  const ATIVOS = new Set([1, 2, 3, 4, 5, 7]);
  // quartos ocupados por noite (qualquer agendamento noturno ativo no quarto)
  const ocupados = new Map<string, Set<string>>();
  const noitesComCpap = new Set<string>();
  const camasNaNoite = new Map<string, number>(); // dia -> camas comuns tomadas
  for (const a of lista) {
    if (!ATIVOS.has(Number(a.status_id))) continue;
    const dia = dataISO(String(a.data ?? ""));
    const hhmm = String(a.horario ?? "").slice(0, 5);
    if (!dia || hhmm < "19:00") continue; // noite = 19h+
    const local = String(a.local_id);
    const s = ocupados.get(dia) || new Set<string>();
    s.add(local);
    ocupados.set(dia, s);
    if (String(a.procedimento_id) === CPAP_PROC) noitesComCpap.add(dia);
    // cama comum de BH tomada: entrada da escadinha (20:15+), fora dos
    // quartos especiais, fora de BETIM e sem ser a CPAP (mesmo quando
    // lancada no balde local 1)
    if (
      hhmm >= "20:15" &&
      !LOCAIS_FORA_DAS_18.has(local) &&
      !LOCAIS_BETIM.has(local) &&
      String(a.procedimento_id) !== CPAP_PROC
    ) {
      camasNaNoite.set(dia, (camasNaNoite.get(dia) || 0) + 1);
    }
  }
  const out: { data: string; localId: string }[] = [];
  const [y0, m0, d0] = deISO.slice(0, 10).split("-").map(Number);
  const [y1, m1, d1] = ateISO.slice(0, 10).split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  for (let t = Date.UTC(y0, m0 - 1, d0); t <= Date.UTC(y1, m1 - 1, d1); t += 86400000) {
    const dt = new Date(t);
    const dia = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    const occ = ocupados.get(dia) || new Set();
    if (variante === "cpap") {
      // 1 CPAP/noite + quarto CPAP livre
      if (noitesComCpap.has(dia) || occ.has(CPAP_QUARTO)) continue;
      out.push({ data: dia, localId: CPAP_QUARTO });
    } else if (variante === "infantil") {
      // 1 infantil/noite (gestora 22/07: "1 quarto infantil") — qualquer
      // quarto K ocupado fecha a noite. Marca no Q-12K (o que a recepcao usa).
      if (POLI_QUARTOS_K.some((q) => occ.has(q))) continue;
      out.push({ data: dia, localId: "24" });
    } else {
      // comum: vaga = contagem de camas < capacidade. Marca no LOCAL 1 (balde
      // BH) — e ASSIM que a recepcao lanca e e de onde a Agenda de
      // Equipamentos ("POLISSONOGRAFIA BH") puxa. Marcar no local do quarto
      // deixava o agendamento INVISIVEL na agenda real deles (bug 21/07,
      // reclamacao do cliente: "tem que cair na agenda real").
      if ((camasNaNoite.get(dia) || 0) >= capacidadePoliNoite(dia)) continue;
      out.push({ data: dia, localId: "1" });
    }
  }
  return out;
}

// primeiro MINUTO livre da noite pra poli (20:30..21:15). A Feegow recusa dois
// agendamentos no mesmo prof(0)+minuto MESMO em quartos diferentes — por isso
// as polis reais entram 20:30, 20:31, 20:32... (uma cama por minuto). Achamos
// o proximo minuto vago olhando os agendamentos ativos da noite.
// opts.inicio = minuto de partida da varredura (comum 20:30, infantil 20:45);
// opts.reservados = minutos-senha de OUTROS quartos que essa variante nao pode
// tomar (ex: 20:46 e a senha do quarto CPAP).
async function minutoLivrePoliNoite(
  token: string,
  dataISOAlvo: string,
  opts?: { inicio?: string; reservados?: Set<string> }
): Promise<string | null> {
  const r = await fg(token, "/appoints/search", {
    query: { data_start: dataFeegow(dataISOAlvo), data_end: dataFeegow(dataISOAlvo) },
  });
  if (!r.ok) return null;
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return null;
  const ATIVOS = new Set([1, 2, 3, 4, 5, 7]);
  const tomados = new Set<string>();
  for (const a of lista) {
    if (Number(a.profissional_id) !== 0) continue;
    if (!ATIVOS.has(Number(a.status_id))) continue;
    const h = String(a.horario ?? "").slice(0, 5);
    if (h >= "19:00") tomados.add(h);
  }
  const partida = hhmmParaMin(opts?.inicio || POLI_HORA_PADRAO);
  const reservados = opts?.reservados || MINUTOS_RESERVADOS_COMUM;
  for (let min = partida; min <= 21 * 60 + 15; min++) {
    const h = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    if (reservados.has(h)) continue; // minuto-senha de outro quarto
    if (!tomados.has(h)) return h;
  }
  return null; // noite lotada de verdade
}

// agora em Sao Paulo (nao importa agenda.ts — daria import circular)
function agoraSPFg(): { dia: string; hhmm: string } {
  const s = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return { dia: s.slice(0, 10), hhmm: s.slice(11, 16) };
}

// corta horario que ja passou (slot de HOJE anterior a agora + 30min de folga).
// Sem isso a IA oferecia "hoje as 8h" a uma da tarde (aconteceu em teste real).
function semHorarioPassado<T extends { data: string; hora: string }>(slots: T[], margemMin = 30): T[] {
  const { dia, hhmm } = agoraSPFg();
  const [h, m] = hhmm.split(":").map(Number);
  const lim = h * 60 + m + margemMin;
  const limStr = `${String(Math.floor(lim / 60)).padStart(2, "0")}:${String(lim % 60).padStart(2, "0")}`;
  return slots.filter((s) => s.data > dia || (s.data === dia && s.hora >= limStr));
}

export async function horariosExameFeegowDetalhado(
  token: string,
  procedimentoId: string,
  deISO: string,
  ateISO: string,
  localId?: string | null // UNIDADE: so oferece horario desse local (BH)
): Promise<{ data: string; hora: string; feegowProfId: string; localId: string }[]> {
  // POLISSONOGRAFIA (todas as variantes): fluxo proprio — oferta = noites com
  // quarto da variante livre, na hora-padrao de entrada dela. Nao usa grade por
  // minuto (minuto e so ordem de cama) nem mistura as camas de Betim.
  const variantePoli = poliVariante(procedimentoId);
  if (variantePoli) {
    const noites = await noitesPoliLivres(token, deISO, ateISO, variantePoli);
    const horaPadrao =
      variantePoli === "cpap" ? CPAP_HORA : variantePoli === "infantil" ? POLI_INFANTIL_HORA : POLI_HORA_PADRAO;
    // MINUTO REAL DA CAMA (pedido do Matheus, 21/08): o minuto e a senha do
    // quarto (20:30, 20:31, 20:37...). Antes a oferta dizia sempre "20:30" e o
    // minuto verdadeiro so nascia na hora de marcar — o paciente ouvia um
    // horario e ficava outro na agenda. Agora a oferta ja calcula o primeiro
    // minuto livre de cada noite, o mesmo que a marcacao vai usar.
    // CPAP tem minuto fixo (20:46, uma por noite), entao nao varre.
    const noitesComMinuto = await Promise.all(
      noites.slice(0, 8).map(async (n) => {
        if (variantePoli === "cpap") return { ...n, hora: horaPadrao };
        const livre = await minutoLivrePoliNoite(
          token,
          n.data,
          variantePoli === "infantil"
            ? { inicio: POLI_INFANTIL_HORA, reservados: MINUTOS_RESERVADOS_INFANTIL }
            : { inicio: POLI_HORA_PADRAO, reservados: MINUTOS_RESERVADOS_COMUM }
        ).catch(() => null);
        return { ...n, hora: livre || horaPadrao };
      })
    );
    return semHorarioPassado(
      noitesComMinuto.map((n: any) => ({ data: n.data, hora: n.hora, feegowProfId: "0", localId: n.localId }))
    );
  }

  const r = await fg(token, "/appoints/available-schedule", {
    query: {
      tipo: "P",
      procedimento_id: procedimentoId,
      data_start: dataFeegow(deISO.slice(0, 10)),
      data_end: dataFeegow(ateISO.slice(0, 10)),
    },
  });
  if (!r.ok) return [];
  const c = conteudo(r.data);
  const out: { data: string; hora: string; feegowProfId: string; localId: string }[] = [];
  // exclui os locais de outra unidade (ex: Betim). localId = lista a EXCLUIR.
  const locaisExcluir = new Set(
    String(localId || "").split(",").map((s) => s.trim()).filter(Boolean)
  );
  const profs = c?.profissional_id || {};
  for (const pid of Object.keys(profs)) {
    const locais = profs[pid]?.local_id || {};
    for (const lid of Object.keys(locais)) {
      if (locaisExcluir.has(String(lid))) continue; // pula unidade excluida (Betim)
      const dias = locais[lid] || {};
      for (const dia of Object.keys(dias)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
        for (const h of dias[dia] || []) {
          out.push({ data: dia, hora: String(h).slice(0, 5), feegowProfId: pid, localId: lid });
        }
      }
    }
  }

  // O available-schedule do Feegow devolve a agenda ERRADA pra exame (a do
  // medico, com horarios quebrados que nao batem com a grade real do exame).
  // Fonte da verdade correta = GRADE do proprio exame (derivada do historico:
  // ex Pletismografia so roda de hora em hora 8h-16h) MENOS os ja ocupados.
  // Assim a IA so oferece "horario azul" = slot da agenda daquele exame livre.
  const grade = await gradeDoExame(token, procedimentoId);
  if (!grade || grade.slotsMin.length === 0) {
    // sem historico pra derivar a grade: cai no available-schedule (melhor que nada)
    return semHorarioPassado(out.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)));
  }
  // OCUPACAO DA AGENDA DE EQUIPAMENTO (confirmado no print real do dia 22):
  // O pletismografo faz 1 Pletismografia OU 2 DLCO por hora. Entao um horario
  // esta OCUPADO pra uma NOVA Pletis quando ja tem >=1 Pletis (12) marcada, ou
  // >=2 DLCO (13). Regra generica por exame via `exameOcupado()`.
  const ocup = await ocupacaoPorHorario(token, deISO, ateISO);
  // AGENDA CERTA DO EXAME: prof 0 + local 1 (balde BH) — TODO exame real da
  // clinica vive la (5.013/5.013 no historico de 90d). O available-schedule
  // devolve agenda de MEDICO (ate de Betim!) e o espelho ia parar no lugar
  // errado (bug real 21/07: pletis de teste entrou como prof 2 / local 2 e a
  // trava de capacidade, que conta so prof 0, ficava cega).
  const feegowProf = "0";
  const feegowLocal = "1";
  const geradas: { data: string; hora: string; feegowProfId: string; localId: string }[] = [];
  const [y0, m0, d0] = deISO.slice(0, 10).split("-").map(Number);
  const [y1, m1, d1] = ateISO.slice(0, 10).split("-").map(Number);
  const ini = Date.UTC(y0, m0 - 1, d0);
  const fim = Date.UTC(y1, m1 - 1, d1);
  const pad = (n: number) => String(n).padStart(2, "0");
  for (let t = ini; t <= fim; t += 86400000) {
    const dt = new Date(t);
    const dia = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    const dow = dt.getUTCDay(); // 0=dom..6=sab
    if (!grade.diasSemana.has(dow)) continue; // exame nao roda nesse dia da semana
    const contDia = ocup.get(dia) || new Map<string, string>();
    // grade oficial tem horarios DIFERENTES por dia da semana (ex: Ergo tem
    // segunda 9h-10h e terca-sexta 10:45/11:00/14:50/15:00/15:15)
    const oficialDia = gradeOficial(procedimentoId);
    const slotsDoDia = oficialDia ? oficialDia.porDia[dow] || [] : grade.slotsMin;
    for (const min of slotsDoDia) {
      const porProc = contDia.get(String(min)) || "";
      if (exameOcupado(procedimentoId, porProc)) continue; // recurso lotado
      geradas.push({ data: dia, hora: `${pad(Math.floor(min / 60))}:${pad(min % 60)}`, feegowProfId: feegowProf, localId: feegowLocal });
    }
  }
  return semHorarioPassado(geradas.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)));
}

// GRADE de um exame: os minutos-do-dia em que ele roda e os dias da semana,
// derivados do HISTORICO real (3 meses). Ex: Pletismografia -> [480,540,...] (8h,9h..)
// so seg-sex. Auto-adapta por exame sem hardcode. Cache simples em memoria.
// Janela de funcionamento dos EXAMES de funcao (min do dia). A clinica nao
// atende exame antes das 8h — os 07:00 no historico sao encaixes excepcionais.
const EXAME_HORA_MIN = 8 * 60; // 08:00
const EXAME_HORA_MAX = 17 * 60; // 17:00
const _gradeCache = new Map<string, { slotsMin: number[]; diasSemana: Set<number> } | null>();
// GRADES OFICIAIS ditadas pela clinica (vencem o historico). O historico traz
// ENCAIXE como se fosse grade — a Ergoespirometria, por exemplo, aparecia com
// 08:45/09:15/11:15/15:10 (encaixes) e a IA oferecia horario que nao existe
// (caso real 20/08). Aqui a regra da clinica manda.
// Formato: { [procedimentoId]: { [diaSemana 0=dom..6=sab]: ["HH:MM", ...] } }
// Helper: gera ["08:00","08:15",...] de `ini` ate `fim` de `passo` em `passo` min.
function blocoHorarios(ini: string, fim: string, passo: number): string[] {
  const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const pad = (n: number) => String(n).padStart(2, "0");
  const out: string[] = [];
  for (let m = min(ini); m <= min(fim); m += passo) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}
const GRADES_OFICIAIS: Record<string, Record<number, string[]>> = {
  // Ergoespirometria (Cibele, 20/08): segunda 09:00-10:00 de 15 em 15;
  // terca a sexta manha 10:45 e 11:00, tarde 14:50, 15:00 e 15:15.
  "8": {
    1: ["09:00", "09:15", "09:30", "09:45", "10:00"],
    2: ["10:45", "11:00", "14:50", "15:00", "15:15"],
    3: ["10:45", "11:00", "14:50", "15:00", "15:15"],
    4: ["10:45", "11:00", "14:50", "15:00", "15:15"],
    5: ["10:45", "11:00", "14:50", "15:00", "15:15"],
  },
  // Prova ventilatoria completa (Cibele, 21/08): 08:00-08:45, 10:00-12:30 e
  // 14:00-18:00, de 15 em 15 minutos. Seg-sex.
  "10": (() => {
    const dia = [
      ...blocoHorarios("08:00", "08:45", 15),
      ...blocoHorarios("10:00", "12:30", 15),
      ...blocoHorarios("14:00", "18:00", 15),
    ];
    return { 1: dia, 2: dia, 3: dia, 4: dia, 5: dia };
  })(),
  // Teste de broncoprovocacao (Cibele, 21/08): 09:00 e 09:30 (intervalo 30min).
  "11": { 1: ["09:00", "09:30"], 2: ["09:00", "09:30"], 3: ["09:00", "09:30"], 4: ["09:00", "09:30"], 5: ["09:00", "09:30"] },
  // Teste de caminhada 6 minutos (Cibele, 21/08): 09:00 e 12:30.
  "15": { 1: ["09:00", "12:30"], 2: ["09:00", "12:30"], 3: ["09:00", "12:30"], 4: ["09:00", "12:30"], 5: ["09:00", "12:30"] },
  // Teste de Latencias Multiplas do Sono (Cibele, 21/08): 07:00, sempre no dia
  // SEGUINTE a polissonografia (o paciente dorme aqui e o MSLT comeca as 07:00).
  // Ver material "Exames especiais e regras": nunca e marcado sozinho.
  "18": { 1: ["07:00"], 2: ["07:00"], 3: ["07:00"], 4: ["07:00"], 5: ["07:00"] },
  // FeNO (210), grade da clinica (Matheus, 21/08): SEGUNDA e TERCA, 07:30 as
  // 08:00, de 15 em 15 minutos. Sem essa grade o exame herdava a de OUTRO
  // exame (caiu na da caminhada, 12:30 seg/qui/sex) e a IA oferecia dias e
  // horarios errados.
  "210": { 1: ["07:30", "07:45", "08:00"], 2: ["07:30", "07:45", "08:00"] },
  // PEMAX e PIMAX (9), grade da clinica (Matheus, 21/08): seg-sex, meio-dia.
  "9": { 1: ["12:00"], 2: ["12:00"], 3: ["12:00"], 4: ["12:00"], 5: ["12:00"] },
};

function gradeOficial(procedimentoId: string): { slotsMin: number[]; diasSemana: Set<number>; porDia: Record<number, number[]> } | null {
  const g = GRADES_OFICIAIS[String(procedimentoId)];
  if (!g) return null;
  const paraMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const porDia: Record<number, number[]> = {};
  const todos = new Set<number>();
  for (const [dia, horas] of Object.entries(g)) {
    porDia[Number(dia)] = horas.map(paraMin).sort((a, b) => a - b);
    porDia[Number(dia)].forEach((m) => todos.add(m));
  }
  return { slotsMin: [...todos].sort((a, b) => a - b), diasSemana: new Set(Object.keys(g).map(Number)), porDia };
}

async function gradeDoExame(token: string, procedimentoId: string): Promise<{ slotsMin: number[]; diasSemana: Set<number> } | null> {
  // grade ditada pela clinica vence o historico (que mistura encaixe)
  const oficial = gradeOficial(procedimentoId);
  if (oficial) return { slotsMin: oficial.slotsMin, diasSemana: oficial.diasSemana };
  const cacheKey = String(procedimentoId);
  if (_gradeCache.has(cacheKey)) return _gradeCache.get(cacheKey)!;
  // janela de historico: ultimos ~90 dias a partir de "hoje" — mas sem Date.now
  // no contexto de workflow; aqui e runtime normal, entao Date e permitido.
  const hoje = new Date();
  const de = new Date(hoje.getTime() - 90 * 86400000);
  const at = new Date(hoje.getTime() + 30 * 86400000);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  const r = await fg(token, "/appoints/search", { query: { data_start: fmt(de), data_end: fmt(at) } });
  if (!r.ok) { _gradeCache.set(cacheKey, null); return null; }
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) { _gradeCache.set(cacheKey, null); return null; }
  const ATIVOS = new Set([1, 2, 3, 4, 5, 7]);
  const freqMin = new Map<number, number>();
  const dias = new Set<number>();
  for (const a of lista) {
    if (String(a.procedimento_id) !== String(procedimentoId)) continue;
    if (Number(a.profissional_id) !== 0) continue; // so agenda de exame
    if (!ATIVOS.has(Number(a.status_id))) continue;
    const hora = String(a.horario ?? "").slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(hora)) continue;
    const min = hhmmParaMin(hora);
    freqMin.set(min, (freqMin.get(min) || 0) + 1);
    const diaISO = dataISO(String(a.data ?? ""));
    if (diaISO) {
      const [yy, mm, dd] = diaISO.split("-").map(Number);
      dias.add(new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay());
    }
  }
  // slots da grade = horarios que aparecem com alguma recorrencia (>=2 vezes),
  // pra filtrar encaixes atipicos e ficar so com a grade real do exame.
  // PISO 8h: a clinica nao atende exame antes das 8h (os 07:00 no historico sao
  // encaixes excepcionais, nao a grade — nao devem ser oferecidos pela IA).
  const slotsMin = Array.from(freqMin.entries())
    .filter(([m, f]) => f >= 2 && m >= EXAME_HORA_MIN && m <= EXAME_HORA_MAX)
    .map(([m]) => m)
    .sort((a, b) => a - b);
  if (slotsMin.length) {
    const grade = { slotsMin, diasSemana: dias };
    _gradeCache.set(cacheKey, grade);
    return grade;
  }
  // exame SEM historico proprio (ex: Pacote, exame novo): deriva uma grade de
  // referencia dos exames de HORA CHEIA da clinica (Pletis/DLCO etc rodam 8-16h,
  // 1 por hora) — assim o Pacote de Pletismografia herda a grade certa em vez de
  // cair no available-schedule bugado.
  const ref = deriveGradeHoraCheia(lista, ATIVOS);
  _gradeCache.set(cacheKey, ref);
  return ref;
}

// grade de referencia (hora cheia) a partir de TODOS os exames que rodam de hora
// em hora na agenda de exame (prof 0). Usado como fallback pra exames sem
// historico proprio. Retorna as horas cheias mais comuns + os dias da semana.
function deriveGradeHoraCheia(lista: any[], ATIVOS: Set<number>): { slotsMin: number[]; diasSemana: Set<number> } | null {
  const freq = new Map<number, number>();
  const dias = new Set<number>();
  for (const a of lista) {
    if (Number(a.profissional_id) !== 0) continue;
    if (!ATIVOS.has(Number(a.status_id))) continue;
    const hora = String(a.horario ?? "").slice(0, 5);
    if (!/^\d{2}:00$/.test(hora)) continue; // so hora cheia
    const min = hhmmParaMin(hora);
    // janela de exame diurno 8h-17h (evita 07:00 encaixe e Poli noturna 20h+)
    if (min < EXAME_HORA_MIN || min > EXAME_HORA_MAX) continue;
    freq.set(min, (freq.get(min) || 0) + 1);
    const diaISO = dataISO(String(a.data ?? ""));
    if (diaISO) {
      const [yy, mm, dd] = diaISO.split("-").map(Number);
      const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
      if (dow >= 1 && dow <= 5) dias.add(dow); // seg-sex
    }
  }
  const slotsMin = Array.from(freq.entries())
    .filter(([, f]) => f >= 5) // horas cheias recorrentes = a grade padrao
    .map(([m]) => m)
    .sort((a, b) => a - b);
  return slotsMin.length ? { slotsMin, diasSemana: dias } : null;
}

// GRUPO DE EQUIPAMENTO: exames que dividem o mesmo recurso fisico e por isso
// disputam a mesma vaga por horario. Confirmado nos dados da Pulmonar:
// Pletismografia (12) + DLCO (13) usam o mesmo pletismografo, capacidade 2/hora
// SOMADOS. Os demais exames contam so a propria capacidade (default 1).
// Um horario esta OCUPADO pra um novo agendamento do exame? Recebe a contagem
// de agendamentos ativos por procedimento naquele horario (formato "12:1,13:2").
// Regras confirmadas no print real da Pulmonar (agenda de equipamento):
//  - Pletismografia (12): o pletismografo faz 1 Pletis OU 2 DLCO por hora.
//    Ocupado se ja tem >=1 Pletis, ou >=2 DLCO (equipamento cheio).
//  - DLCO (13): mesma logica invertida — ocupado se >=1 Pletis, ou >=2 DLCO.
//  - Outros exames: ocupado se ja tem >=1 do proprio exame.
function exameOcupado(procedimentoId: string, contProcs: string): boolean {
  const cont = new Map<string, number>();
  for (const par of contProcs.split(",")) {
    const [p, n] = par.split(":");
    if (p) cont.set(p, Number(n) || 0);
  }
  const p = String(procedimentoId);
  if (p === "12" || p === "13") {
    // PLETISMOGRAFO: 1 paciente por horario, seja Pletis ou DLCO. A regra
    // antiga ("2 DLCO por hora") ofereceu horario ja ocupado pro paciente
    // (caso real 20/08: 14h/15h/16h tinham 1 DLCO cada e a IA ofereceu os
    // tres). O historico de 90d confirma 1 por horario: 307 horarios com 1
    // DLCO contra 2 casos isolados de 2+ (encaixe manual da recepcao).
    const pletis = cont.get("12") || 0;
    const dlco = cont.get("13") || 0;
    return pletis >= 1 || dlco >= 1; // equipamento ocupado
  }
  return (cont.get(p) || 0) >= 1; // exame independente: 1 por horario
}

// ocupacao por dia -> (minuto-como-string -> "proc:qtd,proc:qtd") na agenda de
// exame (prof 0). Conta agendamentos ativos por procedimento pra `exameOcupado`.
async function ocupacaoPorHorario(
  token: string,
  deISO: string,
  ateISO: string
): Promise<Map<string, Map<string, string>>> {
  // dia -> minuto -> (proc -> qtd)
  const bruto = new Map<string, Map<number, Map<string, number>>>();
  const r = await fg(token, "/appoints/search", {
    query: { data_start: dataFeegow(deISO.slice(0, 10)), data_end: dataFeegow(ateISO.slice(0, 10)) },
  });
  if (!r.ok) return new Map();
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return new Map();
  const ATIVOS = new Set([1, 2, 3, 4, 5, 7]);
  for (const a of lista) {
    if (Number(a.profissional_id) !== 0) continue; // so agenda de exame
    if (!ATIVOS.has(Number(a.status_id))) continue;
    const dia = dataISO(String(a.data ?? ""));
    const hora = String(a.horario ?? "").slice(0, 5);
    if (!dia || !/^\d{2}:\d{2}$/.test(hora)) continue;
    const min = hhmmParaMin(hora);
    const proc = String(a.procedimento_id ?? "");
    const porMin = bruto.get(dia) || new Map<number, Map<string, number>>();
    const porProc = porMin.get(min) || new Map<string, number>();
    porProc.set(proc, (porProc.get(proc) || 0) + 1);
    porMin.set(min, porProc);
    bruto.set(dia, porMin);
  }
  // serializa pro formato string que exameOcupado consome
  const out = new Map<string, Map<string, string>>();
  for (const [dia, porMin] of bruto) {
    const m = new Map<string, string>();
    for (const [min, porProc] of porMin) {
      m.set(String(min), Array.from(porProc.entries()).map(([p, n]) => `${p}:${n}`).join(","));
    }
    out.set(dia, m);
  }
  return out;
}

function hhmmParaMin(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// acha a agenda (feegowProfId + localId) de um horario especifico de exame —
// pra criar o agendamento na sala/tecnico certo do Feegow
export async function agendaDoHorarioExame(
  token: string,
  procedimentoId: string,
  dataISO: string,
  horaHHMM: string,
  localId?: string | null
): Promise<{ feegowProfId: string; localId: string } | null> {
  const dia = dataISO.slice(0, 10);
  const det = await horariosExameFeegowDetalhado(token, procedimentoId, dia, dia, localId);
  const alvo = det.find((s) => s.data === dia && s.hora === horaHHMM.slice(0, 5));
  return alvo ? { feegowProfId: alvo.feegowProfId, localId: alvo.localId } : null;
}

export async function listarMotivosFeegow(token: string): Promise<{ id: string; nome: string }[]> {
  const r = await fg(token, "/appoints/motives");
  if (!r.ok) return [];
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return [];
  return lista
    .map((m: any) => ({ id: String(m.id ?? m.motivo_id ?? ""), nome: String(m.motivo ?? m.nome ?? "") }))
    .filter((m) => m.id);
}

// ---------- LER: agendamentos do Feegow (bloqueiam slots + aparecem no painel) ----------

// Agendamentos do profissional (mapeado) numa janela de datas ISO (YYYY-MM-DD).
// Retorna no formato interno wall-clock SP: { inicio, fim, titulo, origem }.
export async function eventosFeegow(
  profissionalId: string,
  deISO: string,
  ateISO: string,
  clinicaId?: string
): Promise<{ inicio: string; fim: string; titulo: string; origem: string }[] | null> {
  try {
    const prof = await getProfissional(profissionalId);
    if (!prof?.feegow_professional_id) return null;
    if (clinicaId && prof.clinica_id !== clinicaId) return null; // isolamento
    const clinica = await getClinica(prof.clinica_id);
    if (!feegowConectada(clinica)) return null;

    const r = await fg(clinica.feegow_token, "/appoints/search", {
      query: {
        profissional_id: prof.feegow_professional_id,
        data_start: dataFeegow(deISO.slice(0, 10)),
        data_end: dataFeegow(ateISO.slice(0, 10)),
      },
    });
    if (!r.ok) {
      console.warn("[feegow] appoints/search falhou:", r.erro);
      return null;
    }
    const lista = conteudo(r.data);
    if (!Array.isArray(lista)) return [];

    // status_id de agendamento CANCELADO/faltou nao ocupa slot. Pela API da
    // Feegow os ativos observados sao 1 (agendado) e 3 (confirmado); cancelados
    // ficam em outros ids. Filtramos por uma allowlist de ATIVOS conhecidos.
    const STATUS_ATIVOS = new Set([1, 2, 3, 4, 5, 7]); // exclui cancelado/faltou (ver doc da conta)
    const duracaoPadrao = prof.duracao_min || 30;
    // UNIDADE: nao mostra agendamentos de outra unidade (ex: Betim = local 2).
    // Mesma regra por EXCLUSAO da agenda de exames — consistente entre as abas.
    const locaisExcluir = new Set(
      String(clinica.feegow_local_id || "").split(",").map((s) => s.trim()).filter(Boolean)
    );
    return lista
      .filter((a: any) => {
        const st = Number(a.status_id);
        const naUnidade = !locaisExcluir.has(String(a.local_id));
        return naUnidade && (!Number.isFinite(st) || STATUS_ATIVOS.has(st));
      })
      .map((a: any) => {
        const dia = dataISO(String(a.data ?? a.data_agendamento ?? ""));
        const hora = String(a.horario ?? a.hora ?? "").slice(0, 5);
        if (!dia || !hora) return null;
        const inicio = `${dia}T${hora}:00`;
        // usa a DURACAO REAL do agendamento (a Feegow devolve no search); so cai
        // pro padrao do prof se vier 0/ausente (ex: exame sem duracao definida)
        const dur = Number(a.duracao) > 0 ? Number(a.duracao) : duracaoPadrao;
        const [h, m] = hora.split(":").map(Number);
        const totalMin = h * 60 + m + dur;
        const fim = `${dia}T${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}:00`;
        return {
          inicio,
          fim,
          titulo: "Agendado no Feegow",
          origem: "feegow",
          agendamento_id: String(a.agendamento_id ?? a.id ?? ""),
        };
      })
      .filter(Boolean) as any[];
  } catch (e: any) {
    console.warn("[feegow] eventosFeegow falhou:", e.message);
    return null;
  }
}

// ---------- ESCREVER: espelhar consultas no Feegow ----------

// Resolve (ou cria) o paciente na Feegow. Retorna o paciente_id, ou null se
// nao deu (quem chama alerta a recepcao).
// TESTADO NA CONTA REAL DA PULMONAR (18/07): o /patient/search SO aceita
// paciente_id ou paciente_cpf — mandar "cpf"/"nome" da 422 SEMPRE (era por isso
// que o espelho nunca achava paciente e o agendamento nao chegava na Feegow).
// Busca por nome NAO existe nesse endpoint. Sem CPF = sem espelho.
async function resolverPacienteFeegow(
  token: string,
  dados: { nome: string; telefone: string; cpf?: string }
): Promise<string | null> {
  const soDigitos = (s: any) => String(s || "").replace(/\D/g, "");
  const cpf = soDigitos(dados.cpf).slice(0, 11);
  if (cpf.length !== 11) {
    console.warn("[feegow] sem CPF — nao da pra buscar nem criar paciente no Feegow");
    return null;
  }

  // 1) busca por CPF (param correto: paciente_cpf)
  const porCpf = await fg(token, "/patient/search", { query: { paciente_cpf: cpf } });
  if (porCpf.ok) {
    const lista = conteudo(porCpf.data);
    const arr = Array.isArray(lista) ? lista : lista ? [lista] : [];
    const id = arr[0]?.paciente_id ?? arr[0]?.id;
    if (id) return String(id);
  }

  // 2) nao achou: cria (testado — {nome_completo, celular, cpf} funciona)
  const criar = await fg(token, "/patient/create", {
    method: "POST",
    body: { nome_completo: dados.nome, celular: dados.telefone, cpf },
  });
  if (criar.ok) {
    const c = conteudo(criar.data);
    const id = c?.paciente_id ?? c?.id;
    if (id) return String(id);
  }
  console.warn("[feegow] nao consegui criar paciente:", criar.erro || "sem id");
  return null;
}

// CAPACIDADE POR TIPO DE EXAME — levantada do historico REAL de 90 dias da
// conta da Pulmonar (5.013 agendamentos de exame, analise 18/07/2026):
//  - Pletis(12)/DLCO(13): UM pletismografo — 1 pletis OU 2 DLCO por HORA.
//    0% de encaixe fora da grade no historico. HORARIO FECHADO.
//  - PEMAX(9), Pacotes(14/19), Caminhada(15), Latencias(18), FENO(210):
//    nunca teve 2 na mesma hora em 90 dias. HORARIO FECHADO (1/hora).
//  - Prova(10), Bronco(11), Ergo(8): VARIAS salas — ate 4-9 na mesma hora;
//    encaixe :01 e rotina da recepcao. Conflito real e so no minuto exato.
//  - Polissonografia noite(16/17): 20h30+, cada MINUTO e uma cama (ate 22/noite,
//    85% dos agendamentos em minuto quebrado). Sem trava por hora.
// Retorna o motivo se o horario JA NAO comporta esse exame, ou null se cabe.
async function capacidadeExameOcupada(
  token: string,
  procedimentoId: string,
  dataISOAlvo: string,
  horaHHMM: string
): Promise<string | null> {
  const p = String(procedimentoId);
  // multi-sala/multi-cama: colisao de minuto exato se resolve com o encaixe
  // +1min (convencao da propria recepcao) — nao ha trava de capacidade por hora
  if (p === "8" || p === "10" || p === "11" || p === "16K") return null;

  const r = await fg(token, "/appoints/search", {
    query: { data_start: dataFeegow(dataISOAlvo), data_end: dataFeegow(dataISOAlvo) },
  });
  if (!r.ok) return null; // sem dado nao bloqueia (o new-appoint ainda barra minuto exato)
  const lista = conteudo(r.data);
  if (!Array.isArray(lista)) return null;

  const ATIVOS = new Set([1, 2, 3, 4, 5, 7]);

  // CPAP/Split-Night: regra da clinica e 1 UNICA por noite (um quarto so). A
  // trava aqui e por NOITE, nao por hora — sem ela, a variacao de segundos do
  // retry poderia furar a regra numa corrida de agendamento.
  if (p === CPAP_PROC) {
    const cpapNaNoite = lista.filter(
      (a: any) =>
        String(a.procedimento_id) === CPAP_PROC &&
        ATIVOS.has(Number(a.status_id)) &&
        String(a.horario ?? "").slice(0, 2) >= "19"
    ).length;
    if (cpapNaNoite >= 1) return `ja existe poli CPAP/Split nessa noite (limite: 1 por noite)`;
    return null;
  }

  // POLI COMUM: trava por CAMAS da noite (18 quartos). Contagem, nao quarto —
  // a recepcao lanca quase tudo no local 1 (ver noitesPoliLivres).
  if (p === POLI_PROC) {
    const camas = lista.filter(
      (a: any) =>
        ATIVOS.has(Number(a.status_id)) &&
        String(a.horario ?? "").slice(0, 5) >= "20:15" &&
        !LOCAIS_FORA_DAS_18.has(String(a.local_id)) &&
        !LOCAIS_BETIM.has(String(a.local_id)) &&
        String(a.procedimento_id) !== CPAP_PROC
    ).length;
    const cap = capacidadePoliNoite(dataISOAlvo);
    if (camas >= cap)
      return `noite ja esta com ${camas} camas de poli ocupadas (capacidade: ${cap})`;
    return null;
  }

  const horaAlvo = Number(horaHHMM.slice(0, 2));
  const naHora = new Map<string, number>();
  for (const a of lista) {
    if (Number(a.profissional_id) !== 0) continue; // so agenda de exame
    if (!ATIVOS.has(Number(a.status_id))) continue;
    if (Number(String(a.horario ?? "").slice(0, 2)) !== horaAlvo) continue;
    const proc = String(a.procedimento_id ?? "");
    naHora.set(proc, (naHora.get(proc) || 0) + 1);
  }

  if (p === "12" || p === "13") {
    const pletis = naHora.get("12") || 0;
    const dlco = naHora.get("13") || 0;
    if (pletis >= 1 || dlco >= 2)
      return `pletismografo ja ocupado nas ${horaAlvo}h (pletis: ${pletis}, DLCO: ${dlco})`;
    return null;
  }
  const mesmos = naHora.get(p) || 0;
  if (mesmos >= 1) return `ja existe ${mesmos} agendamento desse exame nas ${horaAlvo}h (horario fechado)`;
  return null;
}

// Cria o agendamento no Feegow espelhando a consulta local. Retorna o
// agendamento_id do Feegow ou null (com alerta — a recepcao lanca manual).
// extras: cpf (obrigatorio p/ paciente novo) e procedimentoId (do exame, quando
// for exame; senao usa o procedimento padrao do profissional ou "Consulta").
// ESPELHO DE EXAME VIA API: DESLIGADO em 22/07. Descoberta com a gestora:
// agendamento criado via API fica INVISIVEL na interface da clinica — a
// recepcao opera pela Agenda de EQUIPAMENTOS, e o vinculo com equipamento so
// nasce quando a marcacao e feita pela tela deles (a API publica nao tem
// endpoint/parametro pra isso — doc inteira conferida + testes reais).
// Pior: o minuto aparece LIVRE pra recepcao, que pode marcar por cima.
// Fluxo interino: a IA marca AQUI e avisa a equipe (Telegram + painel) com
// todos os dados pra lancar na Agenda de Equipamentos. Religar quando o
// suporte da Feegow indicar como alocar equipamento via API.
const EXAME_ESPELHO_API_DESLIGADO = true;

export async function criarAgendamentoFeegow(
  consulta: any,
  nomePaciente: string,
  telefone: string,
  extras?: { cpf?: string; procedimentoId?: string }
): Promise<string | null> {
  try {
    const clinica = await getClinica(consulta.clinica_id);
    if (!feegowConectada(clinica)) return null;

    if (extras?.procedimentoId && EXAME_ESPELHO_API_DESLIGADO) {
      const dd = consulta.inicio.slice(8, 10), mm = consulta.inicio.slice(5, 7);
      const msg =
        `📋 LANCAR NA AGENDA DE EQUIPAMENTOS (Feegow):\n` +
        `Exame: ${consulta.observacao || `procedimento ${extras.procedimentoId}`}\n` +
        `Paciente: ${nomePaciente} · CPF ${extras.cpf || "?"} · WhatsApp ${telefone}\n` +
        `Data: ${dd}/${mm} as ${consulta.inicio.slice(11, 16)} (poli: proximo minuto livre da noite)\n` +
        `Convenio: ${consulta.convenio_nome || (consulta.pagamento === "convenio" ? "convenio (ver c/ paciente)" : "Particular")}` +
        `${consulta.guia_url ? `\nGuia: ${consulta.guia_url}` : ""}`;
      await enviarAlerta(msg);
      await registrarLog(consulta.clinica_id, "feegow", msg);
      return null; // sem registro invisivel — a equipe lanca na agenda certa
    }

    // EXAME (procedimentoId de exame veio)? Exame nao tem medico — vai pra
    // agenda do proprio exame (sala/tecnico). Buscamos qual agenda do Feegow
    // tem esse horario. CONSULTA usa o medico mapeado.
    const ehExame = Boolean(extras?.procedimentoId);
    let feegowProfId = "";
    let localId = String(clinica.feegow_local_id || "1");
    let especialidadeId: string | undefined;

    if (ehExame) {
      const agenda = await agendaDoHorarioExame(
        clinica.feegow_token,
        String(extras!.procedimentoId),
        consulta.inicio.slice(0, 10),
        consulta.inicio.slice(11, 16),
        clinica.feegow_local_id // marca so na unidade certa (BH)
      );
      if (!agenda) {
        const msg = `⚠️ Feegow: exame de ${nomePaciente} (${consulta.inicio}) — nao achei a agenda de exame nesse horario. Lancar manual no Feegow.`;
        await enviarAlerta(msg);
        await registrarLog(consulta.clinica_id, "feegow", msg);
        return null;
      }
      // EXAME e SEMPRE prof 0 (agenda de exames) e o LOCAL segue o padrao da
      // recepcao: poli comum e exames diurnos no local 1 (balde BH — e de onde
      // a Agenda de Equipamentos puxa), CPAP no quarto 18, infantil no quarto
      // K. NUNCA a agenda/local que o available-schedule sugerir (e agenda de
      // medico, as vezes de Betim).
      feegowProfId = "0";
      const vpLocal = poliVariante(String(extras!.procedimentoId));
      localId = vpLocal && vpLocal !== "comum" ? agenda.localId : "1";

      // TRAVA DE CAPACIDADE (exames de horario fechado): se o equipamento ja
      // esta tomado naquela HORA (ex: 2a pletismografia na mesma hora), NAO
      // marca nem tenta encaixe — corrida de agendamento, a recepcao decide.
      const conflito = await capacidadeExameOcupada(
        clinica.feegow_token,
        String(extras!.procedimentoId),
        consulta.inicio.slice(0, 10),
        consulta.inicio.slice(11, 16)
      );
      if (conflito) {
        const msg = `⚠️ Feegow: exame de ${nomePaciente} (${consulta.inicio}) NAO espelhado — ${conflito}. Possivel corrida de agendamento: conferir a agenda e lancar/reagendar manual.`;
        await enviarAlerta(msg);
        await registrarLog(consulta.clinica_id, "feegow", msg);
        return null;
      }
    } else {
      const prof = await getProfissional(consulta.profissional_id);
      if (!prof?.feegow_professional_id) {
        // antes esse caminho era SILENCIOSO: consulta com prof sem mapeamento
        // sumia do espelho sem ninguem saber. Agora avisa e loga no painel.
        const msg = `⚠️ Feegow: consulta de ${nomePaciente} (${consulta.inicio}) NAO espelhada — profissional sem mapeamento Feegow (configurar feegow_professional_id). Lancar manual no Feegow.`;
        await enviarAlerta(msg);
        await registrarLog(consulta.clinica_id, "feegow", msg);
        return null;
      }
      feegowProfId = prof.feegow_professional_id;
      especialidadeId = prof.feegow_especialidade_id || undefined;
    }

    const pacienteId = await resolverPacienteFeegow(clinica.feegow_token, {
      nome: nomePaciente,
      telefone,
      cpf: extras?.cpf,
    });
    if (!pacienteId) {
      const msg = `⚠️ Feegow: ${ehExame ? "exame" : "consulta"} de ${nomePaciente} (${consulta.inicio}) marcado AQUI mas nao espelhado no Feegow (paciente novo sem CPF, ou nao encontrado). Lancar manual no Feegow.`;
      await enviarAlerta(msg);
      await registrarLog(consulta.clinica_id, "feegow", msg);
      return null;
    }

    // procedimento: o do EXAME (se veio) > o padrao do profissional > "Consulta" (1)
    // (id sintetico tipo "16K" vira o proc real da Feegow aqui)
    const procedimentoId = procFeegowReal(extras?.procedimentoId || "1");

    // PLANO/CONVENIO (testado na conta real 18/07): "plano" NAO e boolean, e o
    // ID do plano — mandar plano:1 sem convenio_id da 422 SEMPRE (matava todo
    // espelho de convenio). E convenio_id explicito falha quando a agenda de
    // exame (prof 0) nao esta configurada pro convenio ("profissional nao
    // atende o convenio"). Formato que FUNCIONA: plano:0 sempre, e o nome do
    // convenio vai nas notas — a recepcao lanca o convenio no check-in.
    const corpoBase = {
      local_id: Number(localId) || 1,
      paciente_id: Number(pacienteId) || pacienteId,
      profissional_id: Number.isFinite(Number(feegowProfId)) ? Number(feegowProfId) : feegowProfId,
      especialidade_id: especialidadeId ? Number(especialidadeId) : undefined,
      procedimento_id: Number(procedimentoId) || procedimentoId,
      data: dataFeegow(consulta.inicio.slice(0, 10)),
      valor: 0,
      plano: 0,
      notas: `Agendado pelo Facilita AI${consulta.convenio_nome ? ` · Convenio: ${consulta.convenio_nome}` : consulta.pagamento === "convenio" ? " · Convenio (ver com paciente)" : " · Particular"}${consulta.guia_url ? ` · Guia: ${consulta.guia_url}` : ""}`,
    };

    // CONFLITO DE HORARIO: a API recusa 2 agendamentos no MESMO horario
    // completo (HH:MM:SS) do prof 0, mesmo exames diferentes em equipamentos
    // independentes. Descoberta 20/07 (testado): o conflito compara ate os
    // SEGUNDOS — entao da pra manter o MINUTO exibido intacto variando so os
    // segundos (:00 -> :30 -> :45). A tela da Feegow mostra HH:MM, ou seja,
    // o exame de hora fechada aparece "11:00" EM PONTO (regra do Matheus:
    // exame de hora em hora NUNCA vira :01).
    // Excecao POLI: o MINUTO e a senha da cama (20:30, 20:31...) — ai o que
    // varia e o minuto (primeiro livre da noite), nunca os segundos.
    const procEx = ehExame ? String(extras!.procedimentoId) : "";
    const varPoli = ehExame ? poliVariante(procEx) : null;
    let horaBase = consulta.inicio.slice(11, 16); // "HH:MM"
    const tentativas: string[] = [];
    if (varPoli === "comum" || varPoli === "infantil") {
      const livre = await minutoLivrePoliNoite(
        clinica.feegow_token,
        consulta.inicio.slice(0, 10),
        varPoli === "infantil"
          ? { inicio: POLI_INFANTIL_HORA, reservados: MINUTOS_RESERVADOS_INFANTIL }
          : { inicio: POLI_HORA_PADRAO, reservados: MINUTOS_RESERVADOS_COMUM }
      );
      if (!livre) {
        const msg = `⚠️ Feegow: polissonografia de ${nomePaciente} (${consulta.inicio}) NAO espelhada — noite sem minuto livre (lotada). Conferir agenda e lancar manual.`;
        await enviarAlerta(msg);
        await registrarLog(consulta.clinica_id, "feegow", msg);
        return null;
      }
      horaBase = livre;
      // backup pra corrida: proximos minutos (cada minuto = uma cama)
      const [h, m] = livre.split(":").map(Number);
      for (const off of [0, 1, 2]) {
        const tot = h * 60 + m + off;
        tentativas.push(`${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}:00`);
      }
    } else {
      // minuto exibido fixo; so os segundos variam em conflito
      for (const seg of ["00", "30", "45"]) tentativas.push(`${horaBase}:${seg}`);
    }
    let ultimoErro = "";
    for (const horario of tentativas) {
      const r = await fg(clinica.feegow_token, "/appoints/new-appoint", {
        method: "POST",
        body: { ...corpoBase, horario },
      });
      if (r.ok) {
        const c = conteudo(r.data);
        const id = c?.agendamento_id ?? c?.id;
        if (id) {
          await registrarLog(
            consulta.clinica_id,
            "feegow",
            `🔁 Espelhado na Feegow: ${nomePaciente} — ${consulta.inicio.slice(8, 10)}/${consulta.inicio.slice(5, 7)} as ${horario.slice(0, 5)} (id ${id})`
          );
          return String(id);
        }
        ultimoErro = "resposta sem agendamento_id";
        break;
      }
      // o 409 da Feegow vem com o motivo em data.content ("Já existe um
      // agendamento..."), nao em message/error — pega de la primeiro
      ultimoErro = String(r.data?.content || r.erro || "erro desconhecido");
      // so re-tenta se o erro for conflito de horario; outros erros nao mudam
      // com +1min (regex sem "Já" por causa do acento)
      if (!/existe um agendamento/i.test(ultimoErro)) break;
    }

    // conflito mesmo variando segundos (raro): recepcao lanca manual na hora
    // cheia — o equipamento esta livre, o bloqueio e da API
    const conflitoHorario = /existe um agendamento/i.test(ultimoErro);
    const msg = conflitoHorario
      ? `⚠️ Feegow: ${ehExame ? "exame" : "consulta"} de ${nomePaciente} (${consulta.inicio.slice(8, 10)}/${consulta.inicio.slice(5, 7)} as ${horaBase}) marcado AQUI mas nao entrou na Feegow: conflito de horario na API mesmo variando segundos. Lancar manual na Feegow as ${horaBase} em ponto.`
      : `⚠️ Feegow: ${ehExame ? "exame" : "consulta"} de ${nomePaciente} (${consulta.inicio}) marcado AQUI mas o espelho no Feegow FALHOU (${ultimoErro}). Lancar manual no Feegow.`;
    await enviarAlerta(msg);
    await registrarLog(consulta.clinica_id, "feegow", msg);
    return null;
  } catch (e: any) {
    console.warn("[feegow] criarAgendamento falhou:", e.message);
    return null;
  }
}

export async function remarcarAgendamentoFeegow(
  clinicaId: string,
  feegowAgendamentoId: string,
  novoInicioISO: string,
  procedimentoId?: string // quando for exame: define minuto/segundos certos (poli!)
): Promise<boolean> {
  try {
    const clinica = await getClinica(clinicaId);
    if (!feegowConectada(clinica) || !feegowAgendamentoId) return false;
    const diaAlvo = novoInicioISO.slice(0, 10);
    const horaBase = novoInicioISO.slice(11, 16);
    // mesmos truques do criar: poli comum/infantil pega o primeiro MINUTO
    // livre da noite (minuto = senha da cama); CPAP e minuto fixo 20:46;
    // resto mantem o minuto exibido e varia so os SEGUNDOS em conflito.
    const varPoli = procedimentoId ? poliVariante(procedimentoId) : null;
    const tentativas: string[] = [];
    if (varPoli === "comum" || varPoli === "infantil") {
      const livre = await minutoLivrePoliNoite(
        clinica.feegow_token,
        diaAlvo,
        varPoli === "infantil"
          ? { inicio: POLI_INFANTIL_HORA, reservados: MINUTOS_RESERVADOS_INFANTIL }
          : { inicio: POLI_HORA_PADRAO, reservados: MINUTOS_RESERVADOS_COMUM }
      );
      if (livre) {
        const [h, m] = livre.split(":").map(Number);
        for (const off of [0, 1, 2]) {
          const tot = h * 60 + m + off;
          tentativas.push(`${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}:00`);
        }
      }
    } else if (varPoli === "cpap") {
      for (const seg of ["00", "30", "45"]) tentativas.push(`${CPAP_HORA}:${seg}`);
    } else {
      for (const seg of ["00", "30", "45"]) tentativas.push(`${horaBase}:${seg}`);
    }
    let ultimoErro = "sem minuto livre na noite";
    for (const horario of tentativas) {
      const r = await fg(clinica.feegow_token, "/appoints/reschedule", {
        method: "POST",
        body: {
          agendamento_id: Number(feegowAgendamentoId) || feegowAgendamentoId,
          motivo_id: Number(clinica.feegow_motivo_id) || clinica.feegow_motivo_id || 1,
          data: dataFeegow(diaAlvo),
          horario,
          obs: "Remarcado pelo Facilita AI",
        },
      });
      if (r.ok) {
        await registrarLog(
          clinicaId,
          "feegow",
          `🔁 Remarcado na Feegow: agendamento ${feegowAgendamentoId} → ${diaAlvo.slice(8, 10)}/${diaAlvo.slice(5, 7)} as ${horario.slice(0, 5)}`
        );
        return true;
      }
      ultimoErro = String(r.data?.content || r.erro || "erro desconhecido");
      if (!/existe um agendamento/i.test(ultimoErro)) break;
    }
    // falha de espelho NUNCA e silenciosa: local mudou e a Feegow ficou na
    // data antiga — a recepcao PRECISA saber (divergencia igual a do bug 21/07)
    const msg = `⚠️ Feegow: remarcacao NAO espelhada (agendamento ${feegowAgendamentoId} → ${diaAlvo.slice(8, 10)}/${diaAlvo.slice(5, 7)} ${horaBase}): ${ultimoErro}. A Feegow AINDA ESTA COM A DATA ANTIGA — remarcar manual.`;
    await enviarAlerta(msg);
    await registrarLog(clinicaId, "feegow", msg);
    return false;
  } catch (e: any) {
    console.warn("[feegow] remarcar falhou:", e.message);
    return false;
  }
}

export async function cancelarAgendamentoFeegow(
  clinicaId: string,
  feegowAgendamentoId: string,
  motivo?: string
): Promise<boolean> {
  try {
    const clinica = await getClinica(clinicaId);
    if (!feegowConectada(clinica) || !feegowAgendamentoId) return false;
    const r = await fg(clinica.feegow_token, "/appoints/cancel-appoint", {
      method: "POST",
      body: {
        agendamento_id: Number(feegowAgendamentoId) || feegowAgendamentoId,
        motivo_id: Number(clinica.feegow_motivo_id) || clinica.feegow_motivo_id || 1,
        obs: motivo ? `Facilita AI: ${motivo}`.slice(0, 200) : "Cancelado pelo Facilita AI",
      },
    });
    if (!r.ok) {
      // NUNCA silencioso: cancelou aqui mas a Feegow segue com a vaga OCUPADA
      // (paciente iria aparecer na agenda da recepcao como ativo)
      const msg = `⚠️ Feegow: cancelamento NAO espelhado (agendamento ${feegowAgendamentoId}): ${String(r.data?.content || r.erro || "erro desconhecido")}. A vaga AINDA ESTA ATIVA na Feegow — cancelar manual.`;
      await enviarAlerta(msg);
      await registrarLog(clinicaId, "feegow", msg);
    }
    return r.ok;
  } catch (e: any) {
    console.warn("[feegow] cancelar falhou:", e.message);
    return false;
  }
}

// O paciente JA TEM ficha no Feegow? (busca por CPF — o unico criterio que o
// /patient/search aceita). A recepcao usa isso pra saber se precisa CADASTRAR
// antes de lancar o exame. null = nao deu pra checar (nao afirma nada).
export async function pacienteExisteFeegow(token: string, cpf: string): Promise<boolean | null> {
  const so = String(cpf || "").replace(/\D/g, "").slice(0, 11);
  if (so.length !== 11) return null;
  const r = await fg(token, "/patient/search", { query: { paciente_cpf: so } });
  if (!r.ok) return null;
  const lista = conteudo(r.data);
  const arr = Array.isArray(lista) ? lista : lista ? [lista] : [];
  return arr.some((p: any) => p?.paciente_id ?? p?.id);
}
