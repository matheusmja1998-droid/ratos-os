// Motor de agenda: calcula disponibilidade e opera consultas.
// Fonte da verdade = nosso banco. (Sync com Google Calendar entra em lib/gcal.ts.)

import {
  getProfissional,
  listHorarios,
  listBloqueios,
  consultasDoProfissional,
  haSobreposicao,
  criarConsulta,
  getConsulta,
  reagendarConsulta,
  atualizarStatusConsulta,
  atualizarObservacaoConsulta,
  atualizarGcalEventId,
  getOuCriaPaciente,
  getClinica,
  instanciaDaClinica,
  proximoDaListaEspera,
  marcarAvisadoListaEspera,
  registrarLog,
  ConflitoAgendamento,
  salvarMensagem,
} from "./db";
import { criarEventoGCal, atualizarEventoGCal, cancelarEventoGCal, eventosDoMedico } from "./gcal";
import {
  eventosFeegow,
  criarAgendamentoFeegow,
  remarcarAgendamentoFeegow,
  cancelarAgendamentoFeegow,
} from "./feegow";
import { criarAgendamentoClinicorp, cancelarAgendamentoClinicorp, eventosClinicorp, marcasDisponiveisClinicorp, intervaloDisponivelClinicorp } from "./clinicorp";
import { criarAgendamentoKlingo, cancelarAgendamentoKlingo, eventosKlingo, marcasDisponiveisKlingo, slotDisponivelKlingo } from "./klingo";
import { atualizarFeegowAgendamentoId, atualizarClinicorpAgendamentoId,
  atualizarKlingoVoucherId, consultaCompleta, moverEtapaAutomatica } from "./db";
import { enviarTexto, enviarMidia } from "./uazapi";
import { enviarAlerta } from "./alertas";

// TIMEZONE: tudo e wall-clock de Sao Paulo (UTC-3 FIXO — o Brasil aboliu o
// horario de verao em 2019, entao -03:00 e constante o ano todo).
// CRITICO: NAO usamos metodos locais de Date (getHours/getFullYear/getTimezoneOffset)
// porque o servidor da Vercel roda em UTC e produziria horarios deslocados.
// Toda a aritmetica e feita via UTC puro, ancorando o wall-clock com o offset fixo.
const OFFSET = "-03:00";
const OFFSET_MS = 3 * 60 * 60 * 1000; // 3h em ms (SP esta 3h atras do UTC)

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Instante absoluto (Date) -> string wall-clock de SP "YYYY-MM-DDTHH:mm:00"
function toISO(date: Date): string {
  // desloca o instante pra "hora de parede" de SP e le em UTC (sem tz do servidor)
  const sp = new Date(date.getTime() - OFFSET_MS);
  return `${sp.getUTCFullYear()}-${pad(sp.getUTCMonth() + 1)}-${pad(
    sp.getUTCDate()
  )}T${pad(sp.getUTCHours())}:${pad(sp.getUTCMinutes())}:00`;
}

// string wall-clock de SP -> instante absoluto (Date)
function fromISO(iso: string): Date {
  return new Date(iso + OFFSET);
}

// "agora" como string wall-clock de SP
function agoraSP(): string {
  return toISO(new Date());
}

// data de hoje (YYYY-MM-DD) em SP
function hojeSP(): string {
  return agoraSP().slice(0, 10);
}

// dia da semana (0=domingo) de uma data YYYY-MM-DD em SP, sem tz do servidor
function diaSemanaSP(data: string): number {
  const [y, mo, d] = data.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function parseHora(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { h, m };
}

// adiciona minutos a um wall-clock ISO de SP, sem depender do fuso do servidor.
function addMin(iso: string, min: number): string {
  const d = fromISO(iso); // instante absoluto ancorado em -03:00
  return toISO(new Date(d.getTime() + min * 60000));
}

// "2026-07-14T08:00:00" -> "14/07 as 08:00" (pro log de atividades)
function rotuloDataHora(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} as ${iso.slice(11, 16)}`;
}

// Retorna slots livres de um profissional numa data (YYYY-MM-DD).
// ignorarConsultaId: exclui uma consulta do calculo — usado no REMARCAR, senao
// a propria consulta sendo movida bloqueava o horario dela mesma.
// ANTECEDENCIA MINIMA da IA (min): a IA nao oferece nem marca horario a menos
// de 1h de agora — "10:00 oferecido as 09:33" pega a clinica de surpresa
// (reclamacao real da Compass, 05/08). A recepcao (validarGrade=false) segue
// livre pra encaixe de ultima hora. Ajustavel por env sem deploy de codigo.
export const MARGEM_IA_MIN = Number(process.env.IA_ANTECEDENCIA_MIN || 60);

export async function slotsDisponiveis(
  profissionalId: string,
  data: string,
  ignorarConsultaId?: string,
  margemMin = 0
): Promise<string[]> {
  const prof = await getProfissional(profissionalId);
  if (!prof) return [];
  const duracao = prof.duracao_min || 30;

  const diaSemana = diaSemanaSP(data);

  const horarios = (await listHorarios(profissionalId)).filter(
    (h) => h.dia_semana === diaSemana
  );
  if (horarios.length === 0) return [];

  const inicioDia = data + "T00:00:00";
  const fimDia = data + "T23:59:59";
  const ocupadas = (await consultasDoProfissional(profissionalId, inicioDia, fimDia)).filter(
    (c: any) => c.id !== ignorarConsultaId
  );
  const bloqueios = (await listBloqueios(profissionalId)).filter(
    (b) => b.inicio < fimDia && b.fim > inicioDia
  );
  // Eventos que o medico marcou DIRETO no Google Calendar (fora do nosso banco)
  // tambem contam como ocupado — senao a IA marcava por cima de um compromisso
  // que o medico botou la e nao aqui (overbooking real). Best-effort: se o
  // Google nao responder (null), so nao adiciona nada — nao trava o agendamento.
  const eventosGoogle = (await eventosDoMedico(profissionalId, inicioDia, fimDia, prof.clinica_id).catch(() => null)) || [];
  // Agendamentos do FEEGOW (agenda principal do cliente): marcou la, bloqueia aqui
  const eventosFg = (await eventosFeegow(profissionalId, inicioDia, fimDia, prof.clinica_id).catch(() => null)) || [];
  // Agendamentos do CLINICORP (recepcao marcou la direto): tambem bloqueiam —
  // sem isso a IA oferecia horario ja ocupado na agenda deles (vem do CACHE,
  // nao gasta o limite de 25 req/h da API)
  const eventosCc = (await eventosClinicorp(profissionalId, inicioDia, fimDia, prof.clinica_id).catch(() => null)) || [];
  // BLOQUEIOS de agenda do Clinicorp (almoco, reuniao, trava): o /appointment/list
  // NAO devolve, mas o validador do create recusa — caso real 10/08: IA ofereceu
  // 16:30 pra Jaqueline (tarde toda bloqueada la), marcou local e o espelho voltou
  // "horario ocupado" — a consulta nunca caiu na agenda deles. A fonte da verdade
  // e /business/list_available_times (fatias de 15min realmente marcaveis).
  // null = clinica sem Clinicorp ou API falhou -> nao filtra (comportamento antigo).
  const marcasCc = await marcasDisponiveisClinicorp(profissionalId, prof.clinica_id).catch(() => null);
  // Agendamentos do KLINGO (marcou la, bloqueia aqui) + disponibilidade real
  // do /agenda/horarios deles (mesma logica do Clinicorp: so oferece o que o
  // sistema do cliente aceita marcar). null = sem Klingo/falha -> nao filtra.
  const eventosKg = (await eventosKlingo(profissionalId, inicioDia, fimDia, prof.clinica_id).catch(() => null)) || [];
  const marcasKg = await marcasDisponiveisKlingo(profissionalId, prof.clinica_id).catch(() => null);

  // corte de "em cima da hora": alem do passado, exclui slot que comeca em
  // menos de `margemMin` minutos (a IA passa 60; recepcao/validacoes passam 0)
  const agora = new Date(Date.now() + margemMin * 60_000);

  const livres: string[] = [];
  for (const bloco of horarios) {
    const ini = parseHora(bloco.hora_inicio);
    const fim = parseHora(bloco.hora_fim);
    let cursor = `${data}T${pad(ini.h)}:${pad(ini.m)}:00`;
    const limite = `${data}T${pad(fim.h)}:${pad(fim.m)}:00`;

    while (cursor < limite) {
      const slotFim = addMin(cursor, duracao);
      if (slotFim > limite) break;

      const colideConsulta = ocupadas.some(
        (c) => cursor < c.fim && slotFim > c.inicio
      );
      const colideBloqueio = bloqueios.some(
        (b) => cursor < b.fim && slotFim > b.inicio
      );
      const colideGoogle = eventosGoogle.some(
        (e) => cursor < e.fim && slotFim > e.inicio
      );
      const colideFeegow = eventosFg.some(
        (e) => cursor < e.fim && slotFim > e.inicio
      );
      const colideClinicorp = eventosCc.some(
        (e) => cursor < e.fim && slotFim > e.inicio
      );
      const noPassado = new Date(cursor + OFFSET) <= agora;
      const foraClinicorp = !intervaloDisponivelClinicorp(marcasCc, cursor, slotFim);
      const colideKlingo = eventosKg.some((e) => cursor < e.fim && slotFim > e.inicio);
      const foraKlingo = !slotDisponivelKlingo(marcasKg, cursor);

      if (!colideConsulta && !colideBloqueio && !colideGoogle && !colideFeegow && !colideClinicorp && !foraClinicorp && !colideKlingo && !foraKlingo && !noPassado) {
        livres.push(cursor);
      }
      cursor = slotFim;
    }
  }
  return livres;
}

// Formata slot ISO em "08:00" pra mostrar pro paciente
export function horaDoSlot(iso: string): string {
  return iso.slice(11, 16);
}

// "2026-07-20" -> "segunda, 2026-07-20". O dia da semana vem do CALENDARIO
// (Date.UTC de data pura, sem fuso), nunca do modelo — LLM erra dia da semana
// de cabeca (ja chamou segunda 20/07 de "domingo" com paciente real).
const NOMES_DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export function dataComDia(dataISO: string): string {
  const [y, m, d] = dataISO.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return dataISO;
  return `${NOMES_DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${dataISO.slice(0, 10)}`;
}

// Agenda de fato. Valida se o slot ainda esta livre (evita corrida).
export async function agendar(params: {
  clinicaId: string;
  profissionalId: string;
  telefone: string;
  nomePaciente?: string;
  inicioISO: string;
  observacao?: string;
  pagamento?: string;      // "particular" | "convenio"
  convenioNome?: string;   // nome do convenio quando pagamento="convenio"
  guiaUrl?: string;        // URL da guia do exame (anexo no card da agenda)
  cpf?: string;            // CPF do paciente (obrigatorio pra espelhar no Feegow)
  feegowProcedimentoId?: string; // procedimento do exame no Feegow (quando for exame)
  validarGrade?: boolean;  // false = painel (encaixe livre); true/omitido = IA (grade)
}): Promise<{ ok: boolean; consulta?: any; erro?: string }> {
  const prof = await getProfissional(params.profissionalId);
  if (!prof) return { ok: false, erro: "profissional nao encontrado" };

  const fim = addMin(params.inicioISO, prof.duracao_min || 30);

  // horario no passado nunca vale
  if (fromISO(params.inicioISO) <= new Date()) {
    return { ok: false, erro: "horario no passado" };
  }
  // EXAME (feegowProcedimentoId presente) NAO valida contra a agenda do MEDICO:
  // exame e feito por tecnico em agenda propria — o profissional aqui e so
  // ancora interna. O slot ja foi validado na fonte certa (ver_horarios_exame
  // na agenda de exames da Feegow + trava de capacidade por equipamento).
  // Sem esse desvio, exame noturno (poli 20:30) batia em "horario indisponivel"
  // porque 20:30 nao existe na grade do medico ancora (bug real, 20/07).
  // A SOBREPOSICAO tambem fica DENTRO do desvio: dois exames simultaneos (ex:
  // 2 polis na mesma noite, ambas 20:30 no mesmo prof-ancora) sao NORMAIS —
  // a capacidade real e por equipamento/cama, ja validada na Feegow.
  const ehExameAgendamento = Boolean(params.feegowProcedimentoId);
  const dia = params.inicioISO.slice(0, 10);
  if (!ehExameAgendamento) {
    // BLINDAGEM anti-overbooking (so consulta de medico): checa QUALQUER
    // consulta que se sobreponha a [inicio, fim) — pega colisao desalinhada.
    if (await haSobreposicao(params.profissionalId, params.inicioISO, fim)) {
      return { ok: false, erro: "horario ocupado" };
    }
    // evento REAL no Google do medico ocupa
    const evs = (await eventosDoMedico(params.profissionalId, dia + "T00:00:00", dia + "T23:59:59", params.clinicaId).catch(() => null)) || [];
    if (evs.some((e) => params.inicioISO < e.fim && fim > e.inicio)) {
      return { ok: false, erro: "horario ocupado" };
    }
    // agendamento no FEEGOW tambem ocupa (agenda principal do cliente)
    const evsFg = (await eventosFeegow(params.profissionalId, dia + "T00:00:00", dia + "T23:59:59", params.clinicaId).catch(() => null)) || [];
    if (evsFg.some((e) => params.inicioISO < e.fim && fim > e.inicio)) {
      return { ok: false, erro: "horario ocupado" };
    }
    // agendamento no CLINICORP tambem ocupa (recepcao marcou la direto)
    const evsCc = (await eventosClinicorp(params.profissionalId, dia + "T00:00:00", dia + "T23:59:59", params.clinicaId).catch(() => null)) || [];
    if (evsCc.some((e) => params.inicioISO < e.fim && fim > e.inicio)) {
      return { ok: false, erro: "horario ocupado" };
    }
    // agendamento no KLINGO tambem ocupa
    const evsKg = (await eventosKlingo(params.profissionalId, dia + "T00:00:00", dia + "T23:59:59", params.clinicaId).catch(() => null)) || [];
    if (evsKg.some((e) => params.inicioISO < e.fim && fim > e.inicio)) {
      return { ok: false, erro: "horario ocupado" };
    }
    // grade da IA: so quando exigido (o painel pode encaixar fora da grade)
    if (params.validarGrade !== false) {
      // ANTECEDENCIA MINIMA (so IA): nada de marcar "daqui a 20 minutos" — a
      // clinica precisa de pelo menos 1h pra se organizar. Erro com instrucao
      // clara pro modelo oferecer outro horario em vez de insistir.
      if (fromISO(params.inicioISO) < new Date(Date.now() + MARGEM_IA_MIN * 60_000)) {
        return {
          ok: false,
          erro: `horario muito em cima da hora (minimo ${MARGEM_IA_MIN} minutos de antecedencia) — ofereca um horario mais tarde`,
        };
      }
      const livres = await slotsDisponiveis(params.profissionalId, dia, undefined, MARGEM_IA_MIN);
      if (!livres.includes(params.inicioISO)) {
        return { ok: false, erro: "horario indisponivel" };
      }
    }
  }

  const paciente = await getOuCriaPaciente(
    params.clinicaId,
    params.telefone,
    params.nomePaciente
  );

  // O insert tem unique index (profissional_id, inicio) where status<>cancelada.
  // Se dois pacientes marcarem o mesmo slot ao mesmo tempo, um passa e o outro
  // bate na constraint — a gente trata como "horario indisponivel" (sem overbooking).
  // EXAME: dois exames no MESMO minuto e normal (2 polis 20:30, 2 provas 9h) —
  // o indice unico e furado variando so os SEGUNDOS do inicio local (o painel
  // e as mensagens mostram HH:MM, entao o paciente continua vendo o minuto
  // certo). Mesmo truque dos segundos usado no espelho Feegow.
  try {
    let consulta: any = null;
    const iniciosTentar = ehExameAgendamento
      ? Array.from({ length: 30 }, (_, i) => `${params.inicioISO.slice(0, 17)}${String(i).padStart(2, "0")}`)
      : [params.inicioISO];
    for (const ini of iniciosTentar) {
      try {
        consulta = await criarConsulta({
          clinica_id: params.clinicaId,
          profissional_id: params.profissionalId,
          paciente_id: paciente.id,
          inicio: ini,
          fim: addMin(ini, prof.duracao_min || 30),
          status: "agendada",
          origem: "ia",
          observacao: params.observacao,
          pagamento: params.pagamento ?? null,
          convenio_nome: params.convenioNome ?? null,
          guia_url: params.guiaUrl ?? null,
        });
        break;
      } catch (e: any) {
        if (e instanceof ConflitoAgendamento && ehExameAgendamento) continue; // proximo segundo
        throw e;
      }
    }
    if (!consulta) return { ok: false, erro: "horario indisponivel" };
    await registrarLog(
      params.clinicaId,
      "consulta",
      `📅 Consulta marcada: ${params.nomePaciente || params.telefone} — ${rotuloDataHora(params.inicioISO)} com ${prof.nome}`
    );
    // CRM: quem marcou consulta avanca pra coluna "Agendado" no quadro.
    // Best-effort — o card e visao gerencial, nao pode derrubar o agendamento.
    await moverEtapaAutomatica(params.clinicaId, params.telefone, "agendado");
    // best-effort: nunca lanca, so loga se falhar. Guarda o eventId pra
    // remarcar/cancelar conseguirem sincronizar esse mesmo evento depois.
    const eventId = await criarEventoGCal(consulta);
    if (eventId) {
      // best-effort tambem: a consulta JA esta criada — um erro aqui (ex:
      // coluna gcal_event_id ainda nao migrada) nao pode virar "nao consegui
      // agendar" pro paciente com a consulta de pe.
      try {
        await atualizarGcalEventId(consulta.id, eventId);
        consulta.gcal_event_id = eventId;
      } catch (e: any) {
        console.warn("[agenda] nao gravei gcal_event_id (segue sem sync):", e.message);
      }
    }
    // ESPELHO NO FEEGOW (agenda principal do cliente): marcou aqui, cai la.
    // Best-effort com alerta interno em falha — a consulta local ja esta de pe.
    const feegowId = await criarAgendamentoFeegow(
      consulta,
      params.nomePaciente || params.telefone,
      params.telefone,
      { cpf: params.cpf, procedimentoId: params.feegowProcedimentoId }
    );
    if (feegowId) {
      try {
        await atualizarFeegowAgendamentoId(consulta.id, feegowId);
        consulta.feegow_agendamento_id = feegowId;
      } catch (e: any) {
        console.warn("[agenda] nao gravei feegow_agendamento_id (segue sem sync):", e.message);
      }
    }
    // GUIA DE EXAME AUTOMATICA (ex: Uniodonto -> radiografia na CENDRO):
    // consulta marcada com o convenio configurado -> manda o PDF da guia no
    // WhatsApp do paciente na hora. Best-effort: falha nunca derruba a marcacao.
    try {
      const clinGuia = await getClinica(params.clinicaId);
      const convenioAlvo = String(clinGuia?.guia_exame_convenio || "").trim().toLowerCase();
      const convenioDaConsulta = String(params.convenioNome || "").trim().toLowerCase();
      if (
        clinGuia?.guia_exame_url &&
        convenioAlvo &&
        params.pagamento === "convenio" &&
        convenioDaConsulta.includes(convenioAlvo)
      ) {
        const instGuia = await instanciaDaClinica(params.clinicaId);
        if (instGuia?.uazapi_token) {
          const envio = await enviarMidia(instGuia.uazapi_token, params.telefone, {
            tipo: "document",
            arquivo: clinGuia.guia_exame_url,
            nomeArquivo: "Guia-Solicitacao-Exames.pdf",
          });
          if (envio.ok) {
            await salvarMensagem({
              clinica_id: params.clinicaId,
              instancia_id: instGuia.id,
              telefone: params.telefone,
              role: "assistant",
              conteudo: `[📎 guia de exames enviada automaticamente (${clinGuia.guia_exame_convenio})]`,
            }).catch(() => {});
            await registrarLog(
              params.clinicaId,
              "consulta",
              `📎 Guia de exames enviada automaticamente pro paciente (${clinGuia.guia_exame_convenio})`
            ).catch(() => {});
          } else {
            console.warn("[agenda] envio automatico da guia falhou:", envio.erro);
          }
        }
      }
    } catch (e: any) {
      console.warn("[agenda] guia automatica falhou (marcacao segue de pe):", e.message);
    }

    // ESPELHO NO CLINICORP (agenda principal de clinicas odontologicas): mesmo
    // padrao best-effort do Feegow. So faz algo quando a clinica tem Clinicorp
    // conectado E o profissional esta mapeado — senao e no-op silencioso.
    const clinicorpId = await criarAgendamentoClinicorp(
      consulta,
      params.nomePaciente || params.telefone,
      params.telefone
    );
    if (clinicorpId) {
      try {
        await atualizarClinicorpAgendamentoId(consulta.id, clinicorpId);
        consulta.clinicorp_agendamento_id = clinicorpId;
      } catch (e: any) {
        console.warn("[agenda] nao gravei clinicorp_agendamento_id (segue sem sync):", e.message);
      }
    }
    // ESPELHO NO KLINGO (mesmo padrao): so faz algo quando a clinica tem o
    // app token E o profissional esta mapeado — senao e no-op silencioso.
    const klingoId = await criarAgendamentoKlingo(
      consulta,
      params.nomePaciente || params.telefone,
      params.telefone,
      { cpf: params.cpf }
    );
    if (klingoId) {
      try {
        await atualizarKlingoVoucherId(consulta.id, klingoId);
        consulta.klingo_voucher_id = klingoId;
      } catch (e: any) {
        console.warn("[agenda] nao gravei klingo_voucher_id (segue sem sync):", e.message);
      }
    }
    return { ok: true, consulta };
  } catch (e: any) {
    if (e instanceof ConflitoAgendamento)
      return { ok: false, erro: "horario indisponivel" };
    throw e;
  }
}

export async function remarcar(
  consultaId: string,
  novoInicioISO: string,
  motivo?: string,
  // validarGrade false = painel (encaixe livre); true/omitido = IA (segue a grade)
  // feegowProcedimentoId = quando a consulta e um EXAME (pula validacao de
  // medico — mesma logica do agendar — e espelha na agenda de exame certa)
  opts?: { validarGrade?: boolean; feegowProcedimentoId?: string }
): Promise<{ ok: boolean; consulta?: any; erro?: string; feegowOk?: boolean }> {
  const c = await getConsulta(consultaId);
  if (!c) return { ok: false, erro: "consulta nao encontrada" };
  const prof = await getProfissional(c.profissional_id);
  const fim = addMin(novoInicioISO, prof.duracao_min || 30);
  // EXAME: prof e so ancora — nada de validar agenda/grade de medico (bug
  // irmao do agendar, corrigido 21/07). guia_url e o rastro de exame quando o
  // chamador nao passa o procedimento.
  const ehExameRemarcacao = Boolean(opts?.feegowProcedimentoId || c.guia_url);

  // 1) horario no passado nunca vale
  if (fromISO(novoInicioISO) <= new Date()) {
    return { ok: false, erro: "horario no passado" };
  }
  const dia = novoInicioISO.slice(0, 10);
  if (!ehExameRemarcacao) {
    // 2) SOBREPOSICAO com outra consulta (ignora a PROPRIA — antes ela bloqueava
    //    a si mesma e o painel acusava "ocupado" num horario livre)
    if (await haSobreposicao(c.profissional_id, novoInicioISO, fim, consultaId)) {
      return { ok: false, erro: "horario ocupado" };
    }
    // 3) evento REAL no Google do medico (espelhos nossos e eventos "livres" ja
    //    sao filtrados no eventosDoMedico)
    const evs = (await eventosDoMedico(c.profissional_id, dia + "T00:00:00", dia + "T23:59:59", c.clinica_id).catch(() => null)) || [];
    if (evs.some((e) => novoInicioISO < e.fim && fim > e.inicio)) {
      return { ok: false, erro: "horario ocupado" };
    }
    // 4) grade da IA: so quando exigido (a IA segue a grade; o painel pode
    //    encaixar em qualquer horario livre, ex: 10:15)
    if (opts?.validarGrade !== false) {
      const livres = await slotsDisponiveis(c.profissional_id, dia, consultaId);
      if (!livres.includes(novoInicioISO)) return { ok: false, erro: "horario indisponivel" };
    }
  }
  try {
    // indice unico (profissional_id, inicio): exame fura variando os SEGUNDOS
    // (2 polis 20:30 na mesma noite e normal) — paciente segue vendo HH:MM
    let consulta: any = null;
    const iniciosTentar = ehExameRemarcacao
      ? Array.from({ length: 30 }, (_, i) => `${novoInicioISO.slice(0, 17)}${String(i).padStart(2, "0")}`)
      : [novoInicioISO];
    for (const ini of iniciosTentar) {
      try {
        consulta = await reagendarConsulta(consultaId, ini, addMin(ini, prof.duracao_min || 30));
        break;
      } catch (e: any) {
        if (e instanceof ConflitoAgendamento && ehExameRemarcacao) continue;
        throw e;
      }
    }
    if (!consulta) return { ok: false, erro: "horario indisponivel" };
    // guarda o motivo da alteracao na observacao (auditoria pra recepcao)
    if (motivo) {
      const obs = [c.observacao, `Alterada (${motivo})`].filter(Boolean).join(" | ");
      try { await atualizarObservacaoConsulta(consultaId, obs); } catch {}
    }
    await registrarLog(
      c.clinica_id,
      "consulta",
      `🔁 Consulta alterada: ${rotuloDataHora(c.inicio)} → ${rotuloDataHora(novoInicioISO)}${motivo ? ` (${motivo})` : ""}`
    );
    // sincroniza o evento no Google do medico (best-effort): sem isso o evento
    // antigo ficava orfao no horario velho e o painel (que le o Google como
    // fonte da verdade) mostrava a consulta errada.
    if (c.gcal_event_id) {
      await atualizarEventoGCal(c.profissional_id, c.gcal_event_id, novoInicioISO, fim);
    }
    // sincroniza no Feegow — o resultado sobe pro chamador: exame que nao
    // espelhou NAO pode passar como "movido" (a agenda real e a Feegow)
    let feegowOk: boolean | undefined;
    if (c.feegow_agendamento_id) {
      feegowOk = await remarcarAgendamentoFeegow(
        c.clinica_id,
        c.feegow_agendamento_id,
        novoInicioISO,
        opts?.feegowProcedimentoId
      );
    }
    // sincroniza no CLINICORP (best-effort): a API deles nao tem "update", entao
    // remarcar = cancelar o espelho antigo + criar um novo no horario novo.
    if (c.clinicorp_agendamento_id) {
      try {
        await cancelarAgendamentoClinicorp(c.clinica_id, c.clinicorp_agendamento_id);
        const cheia = await consultaCompleta(consultaId);
        const novoId = await criarAgendamentoClinicorp(
          { ...c, inicio: novoInicioISO, fim },
          cheia?.paciente_nome || "Paciente",
          cheia?.telefone || ""
        );
        await atualizarClinicorpAgendamentoId(consultaId, novoId || "");
      } catch (e: any) {
        console.warn("[agenda] remarcar: sync clinicorp falhou (segue local):", e.message);
      }
    }
    // sincroniza no KLINGO (best-effort): cancelar voucher antigo + criar novo
    if (c.klingo_voucher_id) {
      try {
        const cheia = await consultaCompleta(consultaId);
        await cancelarAgendamentoKlingo(c.clinica_id, c.klingo_voucher_id, cheia?.telefone, cheia?.paciente_nome);
        const novoId = await criarAgendamentoKlingo(
          { ...c, inicio: novoInicioISO, fim },
          cheia?.paciente_nome || "Paciente",
          cheia?.telefone || ""
        );
        await atualizarKlingoVoucherId(consultaId, novoId || "");
      } catch (e: any) {
        console.warn("[agenda] remarcar: sync klingo falhou (segue local):", e.message);
      }
    }
    return { ok: true, consulta, feegowOk };
  } catch (e: any) {
    if (e instanceof ConflitoAgendamento)
      return { ok: false, erro: "horario indisponivel" };
    throw e;
  }
}

export async function cancelar(consultaId: string, motivo?: string): Promise<{ ok: boolean; consulta?: any; erro?: string }> {
  const c = await getConsulta(consultaId);
  if (!c) return { ok: false, erro: "consulta nao encontrada" };
  // guarda o motivo do cancelamento na observacao (pra recepcao entender depois)
  if (motivo) {
    const obs = [c.observacao, `Cancelou: ${motivo}`].filter(Boolean).join(" | ");
    try { await atualizarObservacaoConsulta(consultaId, obs); } catch {}
  }
  // apaga o evento no Google do medico (best-effort) — senao o evento cancelado
  // continua aparecendo la (e no painel, que le o Google como fonte da verdade).
  if (c.gcal_event_id) {
    await cancelarEventoGCal(c.profissional_id, c.gcal_event_id);
  }
  // cancela no Feegow tambem (best-effort)
  if (c.feegow_agendamento_id) {
    await cancelarAgendamentoFeegow(c.clinica_id, c.feegow_agendamento_id, motivo);
  }
  // cancela no CLINICORP tambem (best-effort) — sem isso o paciente que
  // desmarca pela IA vira agendamento fantasma na agenda da clinica
  if (c.clinicorp_agendamento_id) {
    await cancelarAgendamentoClinicorp(c.clinica_id, c.clinicorp_agendamento_id);
  }
  // cancela no KLINGO tambem (best-effort)
  if (c.klingo_voucher_id) {
    const cheiaKg = await consultaCompleta(consultaId).catch(() => null);
    await cancelarAgendamentoKlingo(c.clinica_id, c.klingo_voucher_id, cheiaKg?.telefone, cheiaKg?.paciente_nome);
  }
  if (!c.feegow_agendamento_id && c.guia_url) {
    // EXAME lancado manualmente pela equipe na Agenda de Equipamentos (espelho
    // API desligado 22/07): o cancelamento tambem precisa ser manual la.
    const aviso = `❌ Paciente cancelou EXAME: ${rotuloDataHora(c.inicio)}${motivo ? ` (${motivo})` : ""}. CONFERIR a Agenda de Equipamentos do Feegow e cancelar la tambem (foi lancado manualmente).`;
    await enviarAlerta(aviso).catch(() => {});
    await registrarLog(c.clinica_id, "feegow", aviso);
  }
  const consulta = await atualizarStatusConsulta(consultaId, "cancelada");
  await registrarLog(
    c.clinica_id,
    "consulta",
    `❌ Consulta cancelada: ${rotuloDataHora(c.inicio)}${motivo ? ` (motivo: ${motivo})` : ""}`
  );

  // LISTA DE ESPERA (best-effort): abriu vaga — avisa o primeiro da fila no
  // WhatsApp. Ele responde e a IA marca no fluxo normal. Nunca trava o cancelamento.
  try {
    const prox = await proximoDaListaEspera(c.clinica_id, c.profissional_id);
    if (prox) {
      const inst = await instanciaDaClinica(c.clinica_id);
      const clin = await getClinica(c.clinica_id);
      if (inst?.uazapi_token) {
        const nome = prox.nome ? ` ${String(prox.nome).split(" ")[0]}` : "";
        const dia = `${c.inicio.slice(8, 10)}/${c.inicio.slice(5, 7)}`;
        const hora = c.inicio.slice(11, 16);
        await enviarTexto(
          inst.uazapi_token,
          prox.telefone,
          `Oi${nome}! Boa noticia: abriu um horario aqui na ${clin?.nome || "clinica"} — dia ${dia} as ${hora}. Voce estava na lista de espera. Quer que eu marque pra voce? E so responder aqui 😊`
        );
        await marcarAvisadoListaEspera(prox.id);
      }
    }
  } catch (e: any) {
    console.warn("[agenda] aviso de lista de espera falhou (cancelamento segue):", e.message);
  }

  return { ok: true, consulta };
}

// Helper: proximos N dias com pelo menos 1 slot livre (pra IA sugerir)
export async function proximasDatasComVaga(profissionalId: string, aPartirDe: string, dias = 14, margemMin = 0): Promise<{ data: string; slots: string[] }[]> {
  const out: { data: string; slots: string[] }[] = [];
  // itera dias em UTC puro (sem tz do servidor) a partir da data base
  const [y, mo, d0] = aPartirDe.split("-").map(Number);
  const base = Date.UTC(y, mo - 1, d0);
  for (let i = 0; i < dias; i++) {
    const dia = new Date(base + i * 86400000);
    const data = `${dia.getUTCFullYear()}-${pad(dia.getUTCMonth() + 1)}-${pad(dia.getUTCDate())}`;
    const slots = await slotsDisponiveis(profissionalId, data, undefined, margemMin);
    if (slots.length > 0) out.push({ data, slots });
    if (out.length >= 5) break; // sugere ate 5 dias com vaga
  }
  return out;
}

export { toISO, hojeSP, agoraSP };
