// Reguas automaticas: confirmacao D-1, fechar consultas passadas e pos-consulta (review Google).
// Roda via cron (rota /api/cron ou script scripts/cron-reguas.ts).

import {
  consultasParaConfirmar,
  consultasParaReview,
  consultasParaFecharComoRealizada,
  marcarConfirmacaoEnviada,
  marcarReviewEnviado,
  atualizarStatusConsulta,
  getClinica,
  listClinicas,
  instanciaDaClinica,
  consultaCompleta,
  tentarAdquirirLockReguas,
  liberarLockReguas,
  marcarTrialAvisoEnviado,
  tentarMarcarRelatorio,
  consultasParaRecall,
  marcarRecallEnviado,
  pacienteTemConsultaFutura,
  metricasClinica,
  registrarLog,
  listLogsPeriodo,
  moverEtapaPorPacienteId,
  isTrue,
} from "./db";
import { enviarTexto } from "./uazapi";
import { enviarAlerta } from "./alertas";
import { agoraSP, hojeSP } from "./agenda";

export const TRIAL_DIAS = 14;

// formata "YYYY-MM-DDThh:mm:00" (wall-clock SP) sem depender do fuso do servidor.
function formataDataBR(iso: string): string {
  const dias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const [datap, horap] = iso.split("T");
  const [y, mo, d] = datap.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const hh = (horap || "00:00").slice(0, 5);
  return `${dias[dow]}, ${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")} as ${hh}`;
}

// envia com ate 2 tentativas (retry simples pra falha transitoria da uazapi)
async function enviarComRetry(token: string, telefone: string, texto: string) {
  let ultimo: any = { ok: false };
  for (let i = 0; i < 2; i++) {
    ultimo = await enviarTexto(token, telefone, texto);
    if (ultimo.ok) return ultimo;
  }
  return ultimo;
}

// Telefone "fantasma": consultas do simulador e da marcacao manual sem telefone
// usam prefixo 0000 (numero impossivel no E.164). As reguas NUNCA devem mandar
// WhatsApp pra eles — e sem marcar como enviada, a consulta voltava pra fila
// TODA execucao, pra sempre.
function telefoneFantasma(tel?: string): boolean {
  const t = String(tel || "").replace(/\D/g, "");
  return !t || t.startsWith("0000");
}

// clinica apta a receber reguas (existe e esta ativa)
function clinicaApta(clinica: any): boolean {
  return Boolean(clinica) && (clinica.ativo === true || clinica.ativo === 1);
}

// --- Regua 1: confirmacao D-1 ---
export async function rodarConfirmacoes(): Promise<{ enviadas: number }> {
  // janela: consultas que comecam amanha (em SP), 00h-23h59
  const hoje = hojeSP();
  const [y, mo, d] = hoje.split("-").map(Number);
  const amanha = new Date(Date.UTC(y, mo - 1, d + 1));
  const dia = `${amanha.getUTCFullYear()}-${String(amanha.getUTCMonth() + 1).padStart(2, "0")}-${String(amanha.getUTCDate()).padStart(2, "0")}`;
  const de = dia + "T00:00:00";
  const ate = dia + "T23:59:59";

  const consultas = await consultasParaConfirmar(de, ate);
  let enviadas = 0;

  for (const c of consultas) {
    const dados = await consultaCompleta(c.id);
    const clinica = await getClinica(c.clinica_id);
    const inst = await instanciaDaClinica(c.clinica_id);
    if (!dados) continue;

    // telefone fantasma (simulador/manual sem numero): marca como enviada pra
    // SAIR DA FILA de vez — nunca tem pra quem mandar, e sem marcar voltava
    // toda execucao pra sempre.
    if (telefoneFantasma(dados.telefone)) {
      await marcarConfirmacaoEnviada(c.id);
      continue;
    }
    // clinica desativada nao recebe regua (nem gasta envio)
    if (!clinicaApta(clinica) || !inst) continue;

    const msg = `Oi${dados.paciente_nome ? ` ${dados.paciente_nome.split(" ")[0]}` : ""}! Aqui e da ${clinica.nome}. Passando pra confirmar sua consulta com ${dados.profissional_nome} ${formataDataBR(c.inicio)}. Ta confirmado? Responde SIM pra confirmar ou me avisa se precisar remarcar.`;

    const r = await enviarComRetry(inst.uazapi_token, dados.telefone, msg);
    if (r.ok) {
      await marcarConfirmacaoEnviada(c.id);
      await registrarLog(c.clinica_id, "regua", `📨 Lembrete de confirmacao enviado: ${dados.paciente_nome || dados.telefone} (${formataDataBR(c.inicio)})`);
      enviadas++;
    }
  }
  return { enviadas };
}

// --- Regua 2: fechar consultas confirmadas que ja passaram como "realizada" ---
// Isso e o que DESTRAVA o review: a regua de pos-consulta so busca realizada/confirmada.
export async function fecharConsultasPassadas(): Promise<{ fechadas: number }> {
  const agora = agoraSP();
  const passadas = await consultasParaFecharComoRealizada(agora);
  let fechadas = 0;
  for (const c of passadas) {
    await atualizarStatusConsulta(c.id, "realizada");
    // CRM: consulta que aconteceu = a pessoa virou CLIENTE no quadro. E esse
    // marcador que permite, la na frente, disparar so pra quem ja e cliente.
    await moverEtapaPorPacienteId(c.paciente_id, "cliente");
    fechadas++;
  }
  return { fechadas };
}

// --- Regua 3: pos-consulta (pedir review no Google) ---
export async function rodarPosConsulta(): Promise<{ enviadas: number }> {
  // consultas ja terminadas ha pelo menos 2h e ainda sem review pedido.
  const agora = new Date();
  const limite = new Date(agora.getTime() - 2 * 60 * 60 * 1000);
  // limite como wall-clock SP
  const limiteSP = (function () {
    const sp = new Date(limite.getTime() - 3 * 60 * 60 * 1000);
    return `${sp.getUTCFullYear()}-${String(sp.getUTCMonth() + 1).padStart(2, "0")}-${String(sp.getUTCDate()).padStart(2, "0")}T${String(sp.getUTCHours()).padStart(2, "0")}:${String(sp.getUTCMinutes()).padStart(2, "0")}:00`;
  })();

  const consultas = await consultasParaReview(limiteSP);
  let enviadas = 0;

  for (const c of consultas) {
    const dados = await consultaCompleta(c.id);
    const clinica = await getClinica(c.clinica_id);
    const inst = await instanciaDaClinica(c.clinica_id);
    if (!dados) continue;

    // telefone fantasma: marca e tira da fila (mesma logica da confirmacao D-1)
    if (telefoneFantasma(dados.telefone)) {
      await marcarReviewEnviado(c.id);
      continue;
    }
    if (!clinicaApta(clinica) || !inst) continue;

    let msg = `Oi${dados.paciente_nome ? ` ${dados.paciente_nome.split(" ")[0]}` : ""}! Que bom que voce veio na ${clinica.nome}. Se puder, deixa uma avaliacao pra gente, ajuda demais!`;
    if (clinica.link_review) msg += ` ${clinica.link_review}`;

    const r = await enviarComRetry(inst.uazapi_token, dados.telefone, msg);
    if (r.ok) {
      await marcarReviewEnviado(c.id);
      await registrarLog(c.clinica_id, "regua", `⭐ Pedido de avaliacao enviado: ${dados.paciente_nome || dados.telefone}`);
      enviadas++;
    }
  }
  return { enviadas };
}

// dias corridos desde um timestamp do banco
function diasDesde(criadoEm?: string): number {
  if (!criadoEm) return 0;
  const t = new Date(criadoEm).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

// subtrai N meses de uma data "YYYY-MM-DD" (aritmetica UTC, sem tz do servidor)
function subtraiMeses(dataISO: string, meses: number): string {
  const [y, mo, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1 - meses, d));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

// dia da semana (0=domingo) de "YYYY-MM-DD"
function diaSemanaDe(dataISO: string): number {
  const [y, mo, d] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

// --- Regua 4: fim de trial (alerta pro DONO DO APP, nao pro paciente) ---
// Clinica em trial chegando no fim (2 dias ou menos, ou ja vencido): manda
// alerta no Telegram UMA vez pra correr atras da conversao.
export async function rodarAvisosTrial(): Promise<{ avisos: number }> {
  const clinicas = await listClinicas();
  let avisos = 0;
  for (const c of clinicas) {
    if ((c.assinatura_status || "trial") !== "trial") continue;
    if (isTrue(c.trial_aviso_enviado)) continue;
    const restantes = TRIAL_DIAS - diasDesde(c.criado_em);
    if (restantes > 2) continue;
    const situacao = restantes <= 0 ? "VENCEU" : `vence em ${restantes} dia${restantes === 1 ? "" : "s"}`;
    await enviarAlerta(
      `⏳ Trial da clinica ${c.nome} ${situacao}! Hora de fechar a assinatura — use o botao de cobranca no painel admin, ou liga pro dono.`
    );
    await marcarTrialAvisoEnviado(c.id);
    avisos++;
  }
  return { avisos };
}

// --- Regua 5: relatorio automatico pro DONO DA CLINICA (WhatsApp) ---
// O ROI na cara do dono: semanal (toda segunda, clinica ativa) e no D+7 do
// trial (metade do teste — arma de conversao). Precisa do telefone_dono
// preenchido nas Configuracoes. Dedup por chave (nao repete se o cron rodar 2x).
export async function rodarRelatorios(): Promise<{ enviados: number }> {
  const clinicas = await listClinicas();
  const hoje = hojeSP();
  const ehSegunda = diaSemanaDe(hoje) === 1;
  let enviados = 0;

  for (const c of clinicas) {
    const status = c.assinatura_status || "trial";
    const dono = String(c.telefone_dono || "").replace(/\D/g, "");
    if (!dono || !clinicaApta(c)) continue;
    const inst = await instanciaDaClinica(c.id);
    if (!inst) continue;

    // qual relatorio cabe hoje?
    let chave: string | null = null;
    let titulo = "";
    if (status === "trial" && diasDesde(c.criado_em) >= 7) {
      chave = "trial-d7";
      titulo = `Voce ja esta na metade do teste gratis do Facilita AI! Olha o que a IA ja fez pela ${c.nome}:`;
    } else if (ehSegunda && status === "ativa") {
      chave = `semanal-${hoje}`;
      titulo = `📊 Relatorio da semana — ${c.nome}`;
    }
    if (!chave) continue;
    if (!(await tentarMarcarRelatorio(c.id, chave))) continue; // ja enviado

    const desde7d = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19);
    const m = await metricasClinica(c.id, desde7d);

    // motivos de cancelamento mais comuns na semana (do log de atividades)
    const de7dSP = new Date(Date.now() - 3 * 3600e3 - 7 * 86400000).toISOString().slice(0, 10);
    const logs = await listLogsPeriodo(c.id, de7dSP, hoje);
    const contagem = new Map<string, number>();
    for (const l of logs) {
      const mMotivo = String(l.descricao || "").match(/^❌.*\(motivo: (.+)\)/);
      if (mMotivo) contagem.set(mMotivo[1], (contagem.get(mMotivo[1]) || 0) + 1);
    }
    const topMotivos = Array.from(contagem.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([motivo, n]) => `  • ${motivo} (${n}x)`)
      .join("\n");

    const msg =
      `${titulo}\n\n` +
      `Nos ultimos 7 dias:\n` +
      `✅ ${m.total} consulta${m.total === 1 ? "" : "s"} marcada${m.total === 1 ? "" : "s"}\n` +
      `🤝 ${m.confirmadas} presenca${m.confirmadas === 1 ? "" : "s"} confirmada${m.confirmadas === 1 ? "" : "s"}\n` +
      `🛡 ${m.noShowsEvitados} falta${m.noShowsEvitados === 1 ? "" : "s"} evitada${m.noShowsEvitados === 1 ? "" : "s"}\n` +
      `⭐ ${m.reviewsPedidos} pedido${m.reviewsPedidos === 1 ? "" : "s"} de avaliacao no Google\n` +
      (topMotivos ? `\nMotivos de cancelamento mais comuns:\n${topMotivos}\n` : "") +
      `\n` +
      (chave === "trial-d7"
        ? `Seu teste gratis termina em ${Math.max(0, TRIAL_DIAS - diasDesde(c.criado_em))} dias. Qualquer duvida e so responder aqui!`
        : `Bora pra mais uma semana! Qualquer duvida e so responder aqui.`);

    const r = await enviarComRetry(inst.uazapi_token, dono, msg);
    if (r.ok) enviados++;
  }
  return { enviados };
}

// --- Regua 6: recall de retorno ---
// Paciente que fez consulta ha exatamente N meses (config da clinica) e nao
// tem nada futuro marcado recebe o convite de retorno. A IA assume a conversa
// quando ele responde (fluxo normal de agendamento).
export async function rodarRecalls(): Promise<{ enviados: number }> {
  const clinicas = await listClinicas();
  let enviados = 0;
  for (const c of clinicas) {
    const meses = Number(c.recall_meses || 0);
    if (!meses || !clinicaApta(c)) continue;
    const inst = await instanciaDaClinica(c.id);
    if (!inst) continue;

    const alvo = subtraiMeses(hojeSP(), meses);
    const cands = (await consultasParaRecall(alvo + "T00:00:00", alvo + "T23:59:59")).filter(
      (k: any) => k.clinica_id === c.id
    );
    for (const k of cands) {
      const dados = await consultaCompleta(k.id);
      if (!dados) continue;
      // fantasma ou paciente ja com consulta futura: marca e sai da fila
      if (telefoneFantasma(dados.telefone) || (await pacienteTemConsultaFutura(k.paciente_id, agoraSP()))) {
        await marcarRecallEnviado(k.id);
        continue;
      }
      const nome = dados.paciente_nome ? ` ${String(dados.paciente_nome).split(" ")[0]}` : "";
      const msg =
        `Oi${nome}! Aqui e da ${c.nome} 😊 Ja faz ${meses} ${meses === 1 ? "mes" : "meses"} da sua ultima consulta` +
        `${dados.profissional_nome ? ` com ${dados.profissional_nome}` : ""}. ` +
        `Que tal agendar seu retorno? Me responde por aqui que eu ja te mostro os horarios!`;
      const r = await enviarComRetry(inst.uazapi_token, dados.telefone, msg);
      if (r.ok) {
        await marcarRecallEnviado(k.id);
        await registrarLog(c.id, "regua", `🔔 Convite de retorno enviado: ${dados.paciente_nome || dados.telefone} (${meses} meses)`);
        enviados++;
      }
    }
  }
  return { enviados };
}

export async function rodarTodasReguas() {
  // LOCK: 2 execucoes sobrepostas (cron + chamada manual, ou retry) liam a
  // mesma fila antes de qualquer marcacao e o paciente recebia confirmacao e
  // review DUPLICADOS. Se ja tem uma rodando, esta sai sem fazer nada.
  if (!(await tentarAdquirirLockReguas())) {
    return { confirmacoes: 0, consultas_fechadas: 0, pos_consulta: 0, pulado: "ja rodando" };
  }
  try {
    const conf = await rodarConfirmacoes();
    const fechadas = await fecharConsultasPassadas();
    const pos = await rodarPosConsulta();
    // reguas novas: cada uma protegida (uma falhar nao derruba as outras)
    const seguro = async <T,>(fn: () => Promise<T>, zero: T): Promise<T> => {
      try {
        return await fn();
      } catch (e: any) {
        console.error("[reguas] regua falhou:", e.message);
        return zero;
      }
    };
    const trial = await seguro(() => rodarAvisosTrial(), { avisos: 0 });
    const rel = await seguro(() => rodarRelatorios(), { enviados: 0 });
    const rec = await seguro(() => rodarRecalls(), { enviados: 0 });
    return {
      confirmacoes: conf.enviadas,
      consultas_fechadas: fechadas.fechadas,
      pos_consulta: pos.enviadas,
      avisos_trial: trial.avisos,
      relatorios: rel.enviados,
      recalls: rec.enviados,
    };
  } finally {
    await liberarLockReguas();
  }
}
