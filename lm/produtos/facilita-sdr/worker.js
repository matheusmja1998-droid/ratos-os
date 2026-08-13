// Worker do Facilita SDR — roda dentro do server (setInterval).
// Responsabilidades: disparo com cadencia, follow-ups, lembretes de reuniao,
// watchdog da instancia e relatorio diario no Telegram.
import {
  db, agoraSP, getConfig, setConfig, campanhaAtiva, templatesDaCampanha,
  disparosHoje, proximoLeadPraDisparo, marcarDisparado, leadsPraFollowup,
  marcarFollowup, salvarMensagem, registrarEvento, reunioesAtivas, getLead,
  metricas, atualizarLead, followupsVencidos, limparFollowup, removerDaFila,
  listarInstancias, instanciasConectadas, proximaInstanciaDisparo, addDisparoInstancia, zerarDisparosInstancias, atualizarInstancia,
  leadsPraReengajar, marcarReengajado, reengajamentosHoje,
} from "./lib/db.js";
import { responderLead } from "./lib/agente.js";
import { enviarTexto, statusInstanciaLive, checarWhatsapp } from "./lib/uazapi.js";
import { alertar } from "./lib/telegram.js";

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function dentroDaJanela(camp) {
  const { hora, diaSemana } = agoraSP();
  const dias = String(camp.dias_semana || "1,2,3,4,5").split(",").map(Number);
  if (!dias.includes(diaSemana)) return false;
  return hora >= (camp.janela_inicio || "08:30") && hora <= (camp.janela_fim || "18:00");
}

function preencher(template, lead) {
  return template
    .replaceAll("{nome_clinica}", lead.nome_clinica || "clínica")
    .replaceAll("{cidade}", lead.cidade || "");
}

// ---------- disparo ----------
async function tickDisparo() {
  if (getConfig("conta_pausada", "") === "1") return; // inadimplente: disparos pausados
  const camp = campanhaAtiva();
  if (!camp) return;
  // SPLIT/ROTACAO: escolhe a instancia respeitando a cota diaria de cada numero.
  // Se todas bateram a cota, para de disparar hoje (o split foi cumprido).
  const instAtiva = proximaInstanciaDisparo();
  if (!instAtiva) return;
  const instanceToken = instAtiva.uazapi_token;
  if (!dentroDaJanela(camp)) return;
  if (disparosHoje() >= camp.teto_dia) return;

  // gate de cadencia (compartilhado entre abertura e follow-up: 1 envio por vez)
  const proximoEm = Number(getConfig("proximo_disparo_em", "0"));
  if (Date.now() < proximoEm) return;

  // 1) FOLLOW-UP FRIO (cobrar quem NUNCA respondeu o disparo): DESLIGADO por padrão
  //    (decisão do Matheus: não compensa bater de novo em quem não engajou).
  //    Religa com config "followup_frio" = "1" se um dia quiser.
  const followFrioLigado = getConfig("followup_frio", "") === "1";
  const f1 = followFrioLigado ? leadsPraFollowup(camp.id, "followup1_em", 44, 120)[0] : null;
  const f2 = followFrioLigado && !f1 ? leadsPraFollowup(camp.id, "followup2_em", 115, 240)[0] : null;
  const followLead = f1 || f2;
  if (followLead) {
    const tipo = f1 ? "followup1" : "followup2";
    const tpls = templatesDaCampanha(camp.id, tipo);
    const texto = tpls.length
      ? preencher(tpls[rand(0, tpls.length - 1)].texto, followLead)
      : (tipo === "followup1"
        ? `Oi! Consegui falar com o responsável da ${followLead.nome_clinica}?`
        : `Última tentativa por aqui: se fizer sentido conversar sobre a agenda da ${followLead.nome_clinica}, é só responder essa mensagem. Senão, não incomodo mais!`);
    const r = await enviarTexto(instanceToken, followLead.telefone, texto);
    if (r.ok) {
      salvarMensagem(followLead.id, "assistant", texto);
      marcarFollowup(camp.id, followLead.id, tipo === "followup1" ? "followup1_em" : "followup2_em");
      registrarEvento(followLead.id, "followup", tipo);
      addDisparoInstancia(instAtiva.id);
    } else {
      registrarEvento(followLead.id, "erro", `followup falhou: ${r.erro}`);
    }
    setConfig("proximo_disparo_em", Date.now() + rand(camp.cadencia_min_seg, camp.cadencia_max_seg) * 1000);
    return;
  }

  // 2) abertura pra lead novo
  const lead = proximoLeadPraDisparo(camp.id);
  if (!lead) return;
  const tpls = templatesDaCampanha(camp.id, "abertura");
  if (!tpls.length) return; // campanha sem template = nao dispara

  // CHECA WhatsApp antes de gastar disparo (fixo/numero morto = pula, nao queima chip).
  // temWhatsapp null = uazapi incerta (rede) -> segue o disparo (nao trava a maquina).
  const chk = await checarWhatsapp(instanceToken, lead.telefone);
  if (chk.temWhatsapp === false) {
    removerDaFila(camp.id, lead.id); // tira da fila SEM contar disparo nem gastar teto
    atualizarLead(lead.id, { status: "sem_whatsapp" });
    registrarEvento(lead.id, "sem_whatsapp", lead.telefone);
    return; // sem gate de cadencia: pular numero morto e barato, pode ir pro proximo ja
  }
  // numero corrigido pela uazapi (com/sem 9o digito) vira a verdade
  if (chk.numeroCorrigido && chk.numeroCorrigido !== lead.telefone)
    db.prepare("UPDATE leads SET telefone = ? WHERE id = ?").run(chk.numeroCorrigido, lead.id);
  const alvo = chk.numeroCorrigido || lead.telefone;

  const tpl = tpls[rand(0, tpls.length - 1)];
  const texto = preencher(tpl.texto, lead);
  const r = await enviarTexto(instanceToken, alvo, texto);
  if (r.ok) {
    salvarMensagem(lead.id, "assistant", texto);
    marcarDisparado(camp.id, lead.id, tpl.id);
    registrarEvento(lead.id, "disparo", `campanha ${camp.nome}`);
    addDisparoInstancia(instAtiva.id);
  } else {
    registrarEvento(lead.id, "erro", `disparo falhou: ${r.erro}`);
  }
  setConfig("proximo_disparo_em", Date.now() + rand(camp.cadencia_min_seg, camp.cadencia_max_seg) * 1000);
}

// ---------- lembretes de reuniao ----------
async function tickLembretes(instanceToken) {
  if (!instanceToken) return;
  const { data, iso } = agoraSP();
  const amanha = new Date(new Date(`${data}T12:00:00`).getTime() + 86400_000).toISOString().slice(0, 10);

  for (const r of reunioesAtivas()) {
    const lead = getLead(r.lead_id);
    if (!lead || String(lead.telefone).startsWith("0000")) continue;

    // D-1: reuniao amanha, lembrete apos as 17h de hoje
    if (!r.lembrete_d1 && r.inicio.startsWith(amanha) && iso.slice(11) >= "17:00") {
      const hora = r.inicio.slice(11);
      const msg = `Oi! Passando pra confirmar nossa conversa de amanhã às ${hora} sobre a ${lead.nome_clinica}. Tá confirmado?`;
      const ok = (await enviarTexto(instanceToken, lead.telefone, msg)).ok;
      if (ok) {
        db.prepare("UPDATE reunioes SET lembrete_d1 = 1 WHERE id = ?").run(r.id);
        salvarMensagem(lead.id, "assistant", msg);
        registrarEvento(lead.id, "lembrete", "D-1");
      }
    }

    // 1h antes (janela 45-75 min pra nao depender de tick exato)
    const diffMin = (new Date(r.inicio) - new Date(iso)) / 60000;
    if (!r.lembrete_1h && diffMin > 40 && diffMin < 80) {
      const msg = `Nossa call é daqui a pouco, às ${r.inicio.slice(11)}. ${r.meet_url ? `Link: ${r.meet_url}` : "Te mando o link aqui."} Até já!`;
      const ok = (await enviarTexto(instanceToken, lead.telefone, msg)).ok;
      if (ok) {
        db.prepare("UPDATE reunioes SET lembrete_1h = 1 WHERE id = ?").run(r.id);
        salvarMensagem(lead.id, "assistant", msg);
        registrarEvento(lead.id, "lembrete", "1h");
        await alertar(`⏰ Reunião em ~1h: ${lead.nome_clinica} às ${r.inicio.slice(11)} (${r.closer})`);
      }
    }
  }
}

// ---------- follow-ups agendados pela IA (intermediario, "me chama depois") ----------
async function tickFollowupsIA(instanceToken) {
  if (!instanceToken) return;
  const { hora } = agoraSP();
  if (hora < "08:30" || hora > "18:30") return; // nunca cobrar fora de horario comercial
  // MESMO delay + MESMO teto do disparo: follow-up conta no volume diario da campanha
  const camp = campanhaAtiva();
  if (camp && Date.now() < Number(getConfig("proximo_disparo_em", "0"))) return;
  if (camp && disparosHoje() >= camp.teto_dia) return; // teto total do dia batido
  for (const lead of followupsVencidos()) {
    limparFollowup(lead.id);
    if (String(lead.telefone).startsWith("0000")) continue;
    // se o lead ja respondeu depois do agendamento, a conversa seguiu — nao cobra
    const ultima = db.prepare("SELECT role FROM mensagens WHERE lead_id = ? ORDER BY id DESC LIMIT 1").get(lead.id);
    if (ultima?.role === "user") continue;
    const msg = lead.followup_msg ||
      "Oi! Conseguiu encaminhar pro responsável? Qualquer coisa eu explico direto pra ele, é rapidinho.";
    const r = await enviarTexto(instanceToken, lead.telefone, msg);
    if (r.ok) {
      salvarMensagem(lead.id, "assistant", msg);
      registrarEvento(lead.id, "followup", "follow-up agendado pela IA enviado");
      if (camp) setConfig("proximo_disparo_em", Date.now() + rand(camp.cadencia_min_seg, camp.cadencia_max_seg) * 1000);
    }
    return; // 1 por tick + gate
  }
}

// ---------- REENGAJAMENTO: lead quente que esfriou no meio da conversa ----------
// A IA cobra sozinha 1x quem respondeu e sumiu (ultima msg foi nossa ha 20h+).
async function tickReengajar(instanceToken) {
  if (!instanceToken) return;
  const { hora } = agoraSP();
  if (hora < "09:00" || hora > "18:00") return; // reengaja só em horário comercial
  // RESPEITA O MESMO DELAY DO DISPARO (gate de cadencia compartilhado): nunca sai
  // reengajamento em rajada, mesmo ritmo humano das aberturas (3-7 min).
  const camp = campanhaAtiva();
  if (camp && Date.now() < Number(getConfig("proximo_disparo_em", "0"))) return;
  if (camp && disparosHoje() >= camp.teto_dia) return; // teto total do dia batido
  // COTA de reengajamento = pct do teto. Reengajamento so sai ate bater essa cota;
  // o resto do teto e pros contatos novos (e a sobra desta cota tambem vira novos).
  if (camp) {
    const cotaReeng = Math.round((camp.teto_dia * (camp.pct_reengajar ?? 30)) / 100);
    if (reengajamentosHoje() >= cotaReeng) return; // cota de reengajamento cumprida
  }
  const horas = Number(getConfig("reengajar_horas", "20"));
  for (const lead of leadsPraReengajar(horas)) {
    if (String(lead.telefone).startsWith("0000")) continue;
    marcarReengajado(lead.id); // marca ANTES (nunca insiste, mesmo se falhar)
    salvarMensagem(lead.id, "sistema", "[o lead parou de responder; retome com naturalidade uma mensagem curta pra reengajar, sem soar cobrança]");
    await responderLead(lead.id, instanceToken);
    registrarEvento(lead.id, "reengajamento", `${horas}h sem resposta`);
    if (camp) setConfig("proximo_disparo_em", Date.now() + rand(camp.cadencia_min_seg, camp.cadencia_max_seg) * 1000);
    return; // 1 por tick + gate de cadencia
  }
}

// ---------- watchdog da instancia ----------
const watchdogAvisados = new Set();
async function tickWatchdog() {
  let algumaConectada = false;
  for (const inst of listarInstancias()) {
    if (!inst.uazapi_token) continue;
    const st = await statusInstanciaLive(inst.uazapi_token);
    const novoStatus = st.conectado ? "conectado" : "desconectado";
    if (novoStatus !== inst.status) atualizarInstancia(inst.id, { status: novoStatus });
    if (st.conectado) { algumaConectada = true; watchdogAvisados.delete(inst.id); }
    else if (!watchdogAvisados.has(inst.id) && inst.status === "conectado") {
      watchdogAvisados.add(inst.id);
      await alertar(`🔴 SDR: WhatsApp "${inst.nome}" CAIU (${st.status}). Reconecta pelo painel (QR).`);
    }
  }
  // compat: paineis antigos leem instancia_status da config
  setConfig("instancia_status", algumaConectada ? "conectado" : "desconectado");
}

// ---------- relatorio diario 18h ----------
function tickResetRotacao() {
  const { data } = agoraSP();
  if (getConfig("rotacao_data", "") !== data) { setConfig("rotacao_data", data); zerarDisparosInstancias(); }
}

async function tickRelatorio() {
  const { data, hora } = agoraSP();
  if (hora < "18:00" || getConfig("ultimo_relatorio", "") === data) return;
  setConfig("ultimo_relatorio", data);
  const m = metricas();
  const respHoje = db.prepare(`SELECT COUNT(*) c FROM eventos WHERE tipo='resposta' AND datetime(criado_em,'-3 hours') >= datetime(? || ' 00:00')`).get(data).c;
  const reunHoje = db.prepare(`SELECT COUNT(*) c FROM eventos WHERE tipo='reuniao' AND datetime(criado_em,'-3 hours') >= datetime(? || ' 00:00')`).get(data).c;
  const quentes = db.prepare("SELECT COUNT(*) c FROM leads WHERE ia_pausada = 1 AND status IN ('respondeu','em_conversa')").get().c;
  await alertar(
    `📊 Facilita SDR — ${data}\n` +
    `Disparos hoje: ${m.disparosHoje}\nRespostas hoje: ${respHoje}\nReuniões hoje: ${reunHoje}\n` +
    `Total: ${m.disparos} disparos · ${m.respostas} respostas · ${m.reunioes} reuniões\n` +
    (quentes ? `🔥 ${quentes} conversa(s) esperando humano no painel` : "Nenhuma conversa pendente de humano")
  );
}

// ---------- no-show / marcar realizada (auto) ----------
function tickReunioesVencidas() {
  const { iso } = agoraSP();
  // reuniao que passou ha mais de 2h e ninguem marcou resultado -> alerta 1x pro closer decidir no painel
  const vencidas = db.prepare(`SELECT r.*, l.nome_clinica FROM reunioes r JOIN leads l ON l.id = r.lead_id
    WHERE r.status IN ('marcada','remarcada') AND r.inicio < ?`).all(
    new Date(new Date(iso).getTime() - 2 * 3600_000).toISOString().slice(0, 16));
  for (const r of vencidas) {
    db.prepare("UPDATE reunioes SET status = 'realizada' WHERE id = ?").run(r.id);
    atualizarLead(r.lead_id, { status: "compareceu" });
    registrarEvento(r.lead_id, "reuniao", "auto-marcada como realizada (ajustar no painel se foi no-show)");
  }
}

// ---------- boot ----------
export function iniciarWorker() {
  const tick = async () => {
    tickResetRotacao();
    const conectadas = instanciasConectadas();
    const token = conectadas[0]?.uazapi_token || "";
    const conectado = conectadas.length > 0;
    try {
      if (conectado) await tickDisparo();
      if (conectado) await tickLembretes(token);
      if (conectado) await tickFollowupsIA(token);
      if (conectado) await tickReengajar(token);
      await tickRelatorio();
      tickReunioesVencidas();
    } catch (e) {
      console.error("[worker] erro no tick:", e.message);
    }
  };
  setInterval(tick, 25_000);
  setInterval(() => tickWatchdog().catch(() => {}), 5 * 60_000);
  tickWatchdog().catch(() => {});
  console.log("[worker] iniciado (tick 25s, watchdog 5min)");
}
