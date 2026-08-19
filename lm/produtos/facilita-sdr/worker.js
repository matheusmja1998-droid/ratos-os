// Worker do Facilita SDR — roda dentro do server (setInterval).
// Responsabilidades: disparo com cadencia, follow-ups, lembretes de reuniao,
// watchdog da instancia e relatorio diario no Telegram.
import {
  db, agoraSP, getConfig, setConfig, campanhaAtiva, campanhasAtivas, campanhaDaPipeline,
  disparosHojeDaCampanha, reengajamentosHojeDaCampanha, templatesDaCampanha,
  disparosHoje, proximoLeadPraDisparo, marcarDisparado, leadsPraFollowup,
  marcarFollowup, salvarMensagem, registrarEvento, reunioesAtivas, getLead,
  metricas, atualizarLead, followupsVencidos, limparFollowup, removerDaFila,
  listarInstancias, instanciasConectadas, proximaInstanciaDisparo, addDisparoInstancia, zerarDisparosInstancias, atualizarInstancia,
  leadsPraReengajar, marcarReengajado, reengajamentosHoje, instanciaDoLead, fixarChipDoLead,
  threadsPraReengajar, marcarReengajadoThread, MAX_FOLLOWS_CONVERSA, MAX_FOLLOWS_DECISOR,
  addTarefa, getPipeline, sincronizarEtapa, getUsuario, listarUsuarios,
} from "./lib/db.js";
import { responderLead } from "./lib/agente.js";
import { enviarTexto, statusInstanciaLive, checarWhatsapp } from "./lib/uazapi.js";
import { alertar } from "./lib/telegram.js";

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// o texto se apresenta com o nome de ALGUEM que nao e o dono do chip?
// devolve o nome conflitante (ou null). Compara so o primeiro nome, sem acento.
function nomeDeOutroDono(texto, donoChip) {
  const limpa = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const t = limpa(texto);
  const dono = limpa(donoChip).split(" ")[0];
  for (const u of listarUsuarios()) {
    const nome = limpa(u.nome).split(" ")[0];
    if (!nome || nome === dono || nome.length < 3) continue;
    // "aqui e o joao", "joao aqui", "me chamo joao", "sou o joao"
    const re = new RegExp(`(^|[^a-z])${nome}([^a-z]|$)`);
    if (re.test(t)) return u.nome;
  }
  return null;
}

// TOKEN DO LEAD: toda mensagem de continuação sai pelo chip GRAVADO do lead.
// Se o chip dele caiu, NÃO envia por outro (trocar de número = queimar os dois).
function chipDoLead(lead) {
  const inst = lead?.instancia_id
    ? instanciasConectadas().find((i) => i.id === lead.instancia_id)
    : null;
  if (inst) return inst;
  if (lead?.instancia_id) {
    registrarEvento(lead.id, "erro", "chip do lead desconectado — envio segurado pra nao trocar de numero");
    return null;
  }
  return instanciaDoLead(lead) || null; // lead antigo sem chip gravado
}
function tokenDoLead(lead) { return chipDoLead(lead)?.uazapi_token || null; }
// COTA POR NUMERO: nenhum envio frio (followup, reengajamento) pode estourar o
// limite diario configurado do chip — estourar = risco de restricao do numero
const chipComFolga = (inst) => !!inst && (!inst.cota_dia || (inst.disparos_hoje || 0) < inst.cota_dia);

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
  // gate de cadencia GLOBAL (1 envio por vez somando todas as campanhas)
  if (Date.now() < Number(getConfig("proximo_disparo_em", "0"))) return;

  // MULTI-CAMPANHA: cada funil dispara pelo SEU chip. A campanha mais ATRASADA
  // em relacao ao teto vai primeiro (nenhuma monopoliza o gate global).
  const fila = campanhasAtivas()
    .map((c) => ({ c, uso: disparosHojeDaCampanha(c) / Math.max(1, c.teto_dia) }))
    .sort((a, b) => a.uso - b.uso)
    .map((x) => x.c);
  for (const camp of fila) {
    if (!dentroDaJanela(camp)) continue;
    const instAtiva = proximaInstanciaDisparo(camp.pipeline_id || null);
    if (!instAtiva) continue;
    const instanceToken = instAtiva.uazapi_token;
    if (disparosHojeDaCampanha(camp) >= camp.teto_dia) continue;

    // 1) FOLLOW-UP FRIO (desligado por padrao; religa com followup_frio=1)
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
      const instF = chipDoLead(followLead) || instAtiva;
      if (!chipComFolga(instF)) continue; // cota do chip batida: segura pro proximo dia
      const r = await enviarTexto(instF.uazapi_token, followLead.telefone, texto);
      if (r.ok) {
        salvarMensagem(followLead.id, "assistant", texto);
        marcarFollowup(camp.id, followLead.id, tipo === "followup1" ? "followup1_em" : "followup2_em");
        registrarEvento(followLead.id, "followup", tipo);
        addDisparoInstancia(instF.id);
      } else {
        registrarEvento(followLead.id, "erro", `followup falhou: ${r.erro}`);
      }
      setConfig("proximo_disparo_em", Date.now() + rand(camp.cadencia_min_seg, camp.cadencia_max_seg) * 1000);
      return;
    }

    // 2) abertura pra lead novo desta campanha
    const lead = proximoLeadPraDisparo(camp.id);
    if (!lead) continue;
    const tpls = templatesDaCampanha(camp.id, "abertura");
    if (!tpls.length) continue; // campanha sem template = nao dispara

    // checa WhatsApp antes de gastar disparo (numero morto = pula sem queimar teto)
    const chk = await checarWhatsapp(instanceToken, lead.telefone);
    if (chk.temWhatsapp === false) {
      removerDaFila(camp.id, lead.id);
      atualizarLead(lead.id, { status: "sem_whatsapp" });
      registrarEvento(lead.id, "sem_whatsapp", lead.telefone);
      return; // proximo tick segue a fila (barato, sem gate)
    }
    if (chk.numeroCorrigido && chk.numeroCorrigido !== lead.telefone)
      db.prepare("UPDATE leads SET telefone = ? WHERE id = ?").run(chk.numeroCorrigido, lead.id);
    const alvo = chk.numeroCorrigido || lead.telefone;

    const tpl = tpls[rand(0, tpls.length - 1)];
    const texto = preencher(tpl.texto, lead);

    // TRAVA DE PERSONA: template que se apresenta com o nome de OUTRA pessoa nao
    // sai pelo chip errado (campanha do Valentino apontada pro funil do Matheus
    // mandou "Valentino aqui" pelo numero do Matheus — 19/08). Pausa e avisa.
    const donoChip = instAtiva.usuario_id ? getUsuario(instAtiva.usuario_id)?.nome : null;
    const conflito = donoChip && nomeDeOutroDono(texto, donoChip);
    if (conflito) {
      db.prepare("UPDATE campanhas SET status = 'pausada' WHERE id = ?").run(camp.id);
      registrarEvento(lead.id, "erro", `disparo BLOQUEADO: template diz "${conflito}" mas o chip e do ${donoChip}`);
      await alertar(`🛑 CAMPANHA PAUSADA: "${camp.nome}"\nO texto de abertura se apresenta como *${conflito}*, mas ia sair pelo WhatsApp do *${donoChip}* (${instAtiva.nome}).\nCorrige o funil da campanha ou o texto e reativa. Nenhuma mensagem errada foi enviada.`);
      continue;
    }

    const r = await enviarTexto(instanceToken, alvo, texto);
    if (r.ok) {
      fixarChipDoLead(lead.id, instAtiva.id); // a conversa NASCE e MORRE neste chip
      salvarMensagem(lead.id, "assistant", texto);
      marcarDisparado(camp.id, lead.id, tpl.id);
      registrarEvento(lead.id, "disparo", `campanha ${camp.nome}`);
      addDisparoInstancia(instAtiva.id);
    } else {
      registrarEvento(lead.id, "erro", `disparo falhou: ${r.erro}`);
    }
    setConfig("proximo_disparo_em", Date.now() + rand(camp.cadencia_min_seg, camp.cadencia_max_seg) * 1000);
    return; // 1 envio por tick no total
  }
}

// ---------- lembretes de reuniao ----------
async function tickLembretes() {
  const { data, iso } = agoraSP();
  const amanha = new Date(new Date(`${data}T12:00:00`).getTime() + 86400_000).toISOString().slice(0, 10);

  for (const r of reunioesAtivas()) {
    const lead = getLead(r.lead_id);
    if (!lead || String(lead.telefone).startsWith("0000")) continue;
    const instanceToken = tokenDoLead(lead);
    if (!instanceToken) continue;

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
        await alertar(`⏰ Reunião em ~1h: ${lead.nome_clinica} às ${r.inicio.slice(11)} (${r.closer})`, { usuarioId: getPipeline(lead.pipeline_id)?.usuario_id || lead.usuario_id || null });
      }
    }
  }
}

// ---------- follow-ups agendados pela IA (intermediario, "me chama depois") ----------
async function tickFollowupsIA() {
  const { hora } = agoraSP();
  if (hora < "08:30" || hora > "18:30") return; // nunca cobrar fora de horario comercial
  // MESMO delay global; teto avaliado pela campanha DO FUNIL do lead
  if (Date.now() < Number(getConfig("proximo_disparo_em", "0"))) return;
  for (const lead of followupsVencidos()) {
    if (String(lead.telefone).startsWith("0000")) { limparFollowup(lead.id); continue; }
    // se o lead ja respondeu depois do agendamento, a conversa seguiu — nao cobra
    const ultima = db.prepare("SELECT role FROM mensagens WHERE lead_id = ? ORDER BY id DESC LIMIT 1").get(lead.id);
    if (ultima?.role === "user") { limparFollowup(lead.id); continue; }
    // teto/cota batidos ou chip fora: NAO limpa — o followup fica agendado e sai depois
    const camp = campanhaDaPipeline(lead.pipeline_id) || campanhasAtivas()[0] || null;
    if (camp && disparosHojeDaCampanha(camp) >= camp.teto_dia) continue;
    const inst = chipDoLead(lead);
    if (!inst) continue;
    if (!chipComFolga(inst)) continue; // cota do numero batida: cobra quando abrir folga
    limparFollowup(lead.id);
    const msg = lead.followup_msg ||
      "Oi! Conseguiu encaminhar pro responsável? Qualquer coisa eu explico direto pra ele, é rapidinho.";
    const r = await enviarTexto(inst.uazapi_token, lead.telefone, msg);
    if (r.ok) {
      salvarMensagem(lead.id, "assistant", msg);
      registrarEvento(lead.id, "followup", "follow-up agendado pela IA enviado");
      addDisparoInstancia(inst.id);
      if (camp) setConfig("proximo_disparo_em", Date.now() + rand(camp.cadencia_min_seg, camp.cadencia_max_seg) * 1000);
    }
    return; // 1 por tick + gate
  }
}

// ---------- REENGAJAMENTO: lead quente que esfriou no meio da conversa ----------
// A IA cobra sozinha 1x quem respondeu e sumiu (ultima msg foi nossa ha 20h+).
async function tickReengajar() {
  const { hora } = agoraSP();
  if (hora < "09:00" || hora > "18:00") return; // reengaja só em horário comercial
  // RESPEITA O MESMO DELAY DO DISPARO (gate de cadencia compartilhado): nunca sai
  // reengajamento em rajada, mesmo ritmo humano das aberturas (3-7 min).
  if (Date.now() < Number(getConfig("proximo_disparo_em", "0"))) return; // gate global
  const horas = Number(getConfig("reengajar_horas", "20"));

  // 1) EM CONVERSA (numero da empresa): ate MAX_FOLLOWS_CONVERSA follows
  for (const lead of leadsPraReengajar(horas)) {
    if (String(lead.telefone).startsWith("0000")) continue;
    const camp = campanhaDaPipeline(lead.pipeline_id) || campanhasAtivas()[0] || null;
    if (camp) {
      if (disparosHojeDaCampanha(camp) >= camp.teto_dia) continue;
      const cotaReeng = Math.round((camp.teto_dia * (camp.pct_reengajar ?? 30)) / 100);
      if (reengajamentosHojeDaCampanha(camp) >= cotaReeng) continue;
    }
    const inst = chipDoLead(lead);
    if (!inst) continue; // chip do lead fora: nao reengaja por outro numero
    if (!chipComFolga(inst)) continue; // cota do numero batida: fica pra depois
    const n = marcarReengajado(lead.id); // marca ANTES (nunca insiste, mesmo se falhar)
    salvarMensagem(lead.id, "sistema", `[follow-up ${n} de ${MAX_FOLLOWS_CONVERSA}: o lead parou de responder; retome com naturalidade UMA mensagem curta, sem soar cobranca]`);
    await responderLead(lead.id, inst.uazapi_token);
    addDisparoInstancia(inst.id);
    registrarEvento(lead.id, "reengajamento", `follow ${n}/${MAX_FOLLOWS_CONVERSA} · ${horas}h sem resposta`);
    tarefaDeFollow(lead, `IA fez o follow-up ${n} de ${MAX_FOLLOWS_CONVERSA} (empresa)`);
    if (camp) setConfig("proximo_disparo_em", Date.now() + rand(camp.cadencia_min_seg, camp.cadencia_max_seg) * 1000);
    return; // 1 por tick + gate de cadencia
  }

  // 2) CONTATO C/ DECISOR (thread dele): ate MAX_FOLLOWS_DECISOR follows
  for (const th of threadsPraReengajar(horas)) {
    if (String(th.telefone).startsWith("0000")) continue;
    const lead = getLead(th.lead_id);
    if (!lead) continue;
    const camp = campanhaDaPipeline(lead.pipeline_id) || campanhasAtivas()[0] || null;
    if (camp && disparosHojeDaCampanha(camp) >= camp.teto_dia) continue;
    const inst = instanciaDoLead(lead, th.instancia_id) || null;
    if (!inst || !chipComFolga(inst)) continue;
    const n = marcarReengajadoThread(th.id);
    const ins = salvarMensagem(lead.id, "sistema", `[follow-up ${n} de ${MAX_FOLLOWS_DECISOR} com o decisor: ele parou de responder; retome com UMA mensagem curta e natural, sem cobrar]`);
    db.prepare("UPDATE mensagens SET thread_id = ? WHERE id = ?").run(th.id, ins.lastInsertRowid);
    await responderLead(lead.id, inst.uazapi_token, { threadId: th.id });
    addDisparoInstancia(inst.id);
    registrarEvento(lead.id, "reengajamento", `decisor: follow ${n}/${MAX_FOLLOWS_DECISOR}`);
    tarefaDeFollow(lead, `IA fez o follow-up ${n} de ${MAX_FOLLOWS_DECISOR} com o decisor (${lead.nome_decisor || th.rotulo || "decisor"})`);
    if (camp) setConfig("proximo_disparo_em", Date.now() + rand(camp.cadencia_min_seg, camp.cadencia_max_seg) * 1000);
    return;
  }
}

// TAREFA VISIVEL do follow: aparece no card pra pessoa saber que a IA cobrou
function tarefaDeFollow(lead, texto) {
  try {
    const dono = getPipeline(lead.pipeline_id)?.usuario_id || lead.usuario_id || null;
    addTarefa(lead.id, texto, agoraSP().data, { tipo: "followup", usuario_id: dono });
  } catch (e) {
    registrarEvento(lead.id, "erro", "tarefa de follow falhou: " + e.message);
  }
}

// ESGOTOU A REGUA -> PERDIDO. Roda 1x por hora: quem ja levou todos os follows
// (2 na empresa / 3 no decisor) e continua mudo vira perdido com o motivo certo.
async function tickEsgotados() {
  const horas = Number(getConfig("reengajar_horas", "20"));
  const finais = ["optout", "descartado", "perdido", "fechado", "reuniao_marcada", "compareceu", "trial"];

  const conversas = db.prepare(`SELECT l.* FROM leads l
    WHERE l.eh_teste = 0 AND l.ia_pausada = 0
      AND l.status IN ('respondeu','em_conversa')
      AND (l.telefone_decisor IS NULL OR l.telefone_decisor = '')
      AND COALESCE(l.follows_feitos,0) >= ?
      AND (SELECT role FROM mensagens WHERE lead_id = l.id ORDER BY id DESC LIMIT 1) = 'assistant'
      AND (SELECT criado_em FROM mensagens WHERE lead_id = l.id ORDER BY id DESC LIMIT 1) <= datetime('now', '-' || ? || ' hours')
    LIMIT 20`).all(MAX_FOLLOWS_CONVERSA, horas);
  for (const l of conversas) {
    atualizarLead(l.id, { status: "perdido", motivo_perda: `sem resposta apos ${MAX_FOLLOWS_CONVERSA} follow-ups` });
    registrarEvento(l.id, "perdido", `regua esgotada (${MAX_FOLLOWS_CONVERSA} follows sem resposta)`);
  }

  const decisores = db.prepare(`SELECT t.*, l.id lead_id2 FROM threads t JOIN leads l ON l.id = t.lead_id
    WHERE l.eh_teste = 0 AND l.ia_pausada = 0 AND t.ia_pausada = 0
      AND l.status NOT IN (${finais.map(() => "?").join(",")})
      AND t.telefone <> l.telefone
      AND COALESCE(t.follows_feitos,0) >= ?
      AND (SELECT role FROM mensagens WHERE thread_id = t.id ORDER BY id DESC LIMIT 1) = 'assistant'
      AND (SELECT criado_em FROM mensagens WHERE thread_id = t.id ORDER BY id DESC LIMIT 1) <= datetime('now', '-' || ? || ' hours')
    LIMIT 20`).all(...finais, MAX_FOLLOWS_DECISOR, horas);
  for (const t of decisores) {
    atualizarLead(t.lead_id, { status: "perdido", motivo_perda: `decisor nao respondeu apos ${MAX_FOLLOWS_DECISOR} follow-ups` });
    registrarEvento(t.lead_id, "perdido", `regua do decisor esgotada (${MAX_FOLLOWS_DECISOR} follows)`);
  }
  if (conversas.length + decisores.length)
    console.log(`[regua] ${conversas.length + decisores.length} lead(s) movidos pra perdido (follow-ups esgotados)`);
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
    const conectado = conectadas.length > 0;
    try {
      if (conectado) await tickDisparo();
      if (conectado) await tickLembretes();
      if (conectado) await tickFollowupsIA();
      if (conectado) await tickReengajar();
      await tickRelatorio();
      tickReunioesVencidas();
    } catch (e) {
      console.error("[worker] erro no tick:", e.message);
    }
  };
  setInterval(tick, 25_000);
  setInterval(() => tickWatchdog().catch(() => {}), 5 * 60_000);
  // regua esgotada -> perdido: de hora em hora (nao precisa ser no tick rapido)
  setInterval(() => tickEsgotados().catch((e) => console.error("[regua]", e.message)), 60 * 60_000);
  tickWatchdog().catch(() => {});
  console.log("[worker] iniciado (tick 25s, watchdog 5min, regua 1h)");
}
