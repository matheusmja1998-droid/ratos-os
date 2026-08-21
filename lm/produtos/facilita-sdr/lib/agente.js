// Agente SDR — cerebro da conversa.
// Roda o Claude Code headless (`claude -p`) da VPS usando a CONTA/PLANO logado
// (nao a API). O ANTHROPIC_API_KEY e removido do env do processo filho de
// proposito: com ele setado o CLI cobraria na API paga.
import { execFile } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  db, getLead, atualizarLead, salvarMensagem, historicoLead, marcarReuniao,
  reunioesAtivas, getConfig, registrarEvento, bloquear, agoraSP, agendarFollowupLead,
  audioDoLead, normalizarTelefone, addTelefone, abrirThread, getThread, getPipeline,
  getUsuario, addTarefa,
} from "./db.js";
import { enviarTexto, enviarMidia, mostrarDigitando } from "./uazapi.js";
import { alertar } from "./telegram.js";
import { criarEventoMeet, apagarEventoMeet } from "./gcal.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARQ_PROMPT = process.env.SDR_IA_MODO === "api" ? "sdr-generico.md" : "sdr.md";
const PROMPT_SDR = readFileSync(join(__dirname, "..", "prompts", ARQ_PROMPT), "utf8");
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || ""; // vazio = default do plano

// PERSONA: a IA se identifica como o DONO DO NUMERO que envia (chip do lead);
// sem dono no chip, cai pro dono do funil; ultimo recurso "Matheus".
// Mensagem saindo no numero do Valentino NUNCA pode se apresentar como Matheus.
export function personaDoLead(lead) {
  // 1) COERENCIA COM O QUE JA FOI DITO: se a abertura ja se apresentou com um
  // nome, a IA mantem esse nome nessa conversa (trocar no meio confunde o lead).
  // Cobre o caso do template errado ter saido pelo chip de outra pessoa.
  const abertura = lead?.id
    ? db.prepare("SELECT texto FROM mensagens WHERE lead_id = ? AND role = 'assistant' ORDER BY id LIMIT 1").get(lead.id)?.texto
    : null;
  if (abertura) {
    const limpa = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const t = limpa(abertura);
    for (const u of db.prepare("SELECT nome FROM usuarios WHERE ativo = 1").all()) {
      const nome = limpa(u.nome).split(" ")[0];
      if (nome.length >= 3 && new RegExp(`(^|[^a-z])${nome}([^a-z]|$)`).test(t)) return u.nome;
    }
  }
  // 2) padrao: dono do NUMERO que envia > dono do funil > fallback
  const donoChip = lead?.instancia_id
    ? db.prepare("SELECT usuario_id FROM instancias WHERE id = ?").get(lead.instancia_id)?.usuario_id
    : null;
  const donoFunil = lead?.pipeline_id ? getPipeline(lead.pipeline_id)?.usuario_id : null;
  const dono = donoChip || donoFunil || lead?.usuario_id || null;
  return (dono ? getUsuario(dono)?.nome : null) || "Matheus";
}

// DONO do lead (pra rotear o alerta do Telegram): dono do chip > dono do funil.
// Sem isso, aviso de lead do Matheus caia no Telegram do Valentino e vice-versa.
export function donoDoLeadId(lead) {
  const donoChip = lead?.instancia_id
    ? db.prepare("SELECT usuario_id FROM instancias WHERE id = ?").get(lead.instancia_id)?.usuario_id
    : null;
  const donoFunil = lead?.pipeline_id ? getPipeline(lead.pipeline_id)?.usuario_id : null;
  return donoChip || donoFunil || lead?.usuario_id || null;
}

// ---------- horarios de reuniao ----------
// Slots por closer na config: "slots_matheus" = "1,2,3,4,5|10:00,11:00,15:00,16:00"
// (dias da semana | horas). Disponivel = slots dos proximos 7 dias MENOS reunioes ativas.
function slotsDoCloser(closer) {
  const cfg = getConfig(`slots_${closer}`, "1,2,3,4,5|10:00,11:00,15:00,16:00");
  const [diasStr, horasStr] = cfg.split("|");
  const dias = (diasStr || "1,2,3,4,5").split(",").map(Number);
  const horas = (horasStr || "").split(",").map((h) => h.trim()).filter(Boolean);
  return { dias, horas };
}

export function horariosDisponiveis() {
  const closers = ["matheus", "valentino"].filter((c) => getConfig(`closer_${c}_ativo`, "1") === "1");
  const ocupados = new Set(reunioesAtivas().map((r) => `${r.closer}|${r.inicio}`));
  const { data, hora } = agoraSP();
  const hoje = new Date(`${data}T00:00:00`);
  const out = [];
  for (let d = 0; d < 8 && out.length < 12; d++) {
    const dia = new Date(hoje.getTime() + d * 86400_000);
    const diaISO = dia.toISOString().slice(0, 10);
    const dow = ((dia.getDay() + 6) % 7) + 1; // 1=seg..7=dom
    for (const closer of closers) {
      const { dias, horas } = slotsDoCloser(closer);
      if (!dias.includes(dow)) continue;
      for (const h of horas) {
        if (d === 0 && h <= hora) continue; // hoje: so horario futuro (folga implicita)
        const inicio = `${diaISO}T${h}`;
        if (!ocupados.has(`${closer}|${inicio}`)) out.push({ inicio, closer, dow });
      }
    }
  }
  // round-robin leve: ordena por data/hora; em empate de horario alterna closer
  out.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return out.slice(0, 10);
}

const DIAS_PT = { 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado", 7: "domingo" };

// ---------- treinamento do Matheus (aba Cérebro do painel) ----------
// Tudo que ele escrever entra no prompt com prioridade MAXIMA sobre o metodo base.
function blocoTreinamento() {
  const secoes = [
    ["Diretrizes gerais (como falar, o que nunca fazer)", getConfig("treino_geral", "")],
    ["Pitch, produto e preço (o que dizer sobre a Facilita)", getConfig("treino_pitch", "")],
    ["Objeções e como responder cada uma", getConfig("treino_objecoes", "")],
    ["Exemplo de conversa perfeita (imitar esse estilo)", getConfig("treino_exemplo", "")],
  ].filter(([, v]) => v.trim());
  if (!secoes.length) return "";
  return `\n## TREINAMENTO DO MATHEUS (PRIORIDADE MÁXIMA — quando conflitar com qualquer instrução acima, o que está aqui VENCE)\n` +
    secoes.map(([t, v]) => `\n### ${t}\n${v.trim()}`).join("\n");
}

// ---------- montagem do prompt ----------
function montarPrompt(lead, thread = null) {
  const hist = historicoLead(lead.id);
  // marca de qual CANAL e cada mensagem: sem isso a IA lia respostas dadas no
  // numero da empresa como se ja tivesse respondido o decisor (e ficava calada)
  const conversa = hist.map((m) => {
    const quem = m.role === "user" ? "LEAD" : m.role === "assistant" ? "VOCÊ" : "SISTEMA";
    const canal = thread
      ? (m.thread_id === thread.id ? "[com o decisor] " : "[com a recepção] ")
      : "";
    return `${canal}${quem}: ${m.texto}`;
  }).join("\n");
  // ultima mensagem do canal ATUAL (pra IA saber se esta devendo resposta)
  const ultimaDoCanal = thread
    ? db.prepare("SELECT role, texto FROM mensagens WHERE thread_id = ? ORDER BY id DESC LIMIT 1").get(thread.id)
    : db.prepare("SELECT role, texto FROM mensagens WHERE lead_id = ? AND thread_id IS NULL ORDER BY id DESC LIMIT 1").get(lead.id);

  const horarios = horariosDisponiveis()
    .map((h) => `- ${h.inicio} (${DIAS_PT[h.dow]}) com ${h.closer}`)
    .join("\n") || "- (nenhum horário disponível — colete o melhor horário do lead e use passar_pra_humano)";

  const { data, hora, diaSemana } = agoraSP();

  // NOTAS escritas pela equipe: contexto que so o humano sabe (o que ele
  // descobriu no telefone, combinados, nome de quem atendeu...). A IA le pra
  // nao repetir pergunta ja respondida fora do WhatsApp.
  const notas = db.prepare("SELECT texto, criado_em FROM notas WHERE lead_id = ? ORDER BY id DESC LIMIT 8").all(lead.id);
  const blocoNotas = notas.length
    ? `\n## NOTAS DA EQUIPE (contexto interno, NUNCA cite que existe uma anotacao)\n` +
      notas.reverse().map((n) => `- [${String(n.criado_em).slice(5, 16)}] ${String(n.texto).replace(/\s+/g, " ").slice(0, 300)}`).join("\n") + "\n"
    : "";
  // telefones cadastrados no card (empresa, decisor, outros)
  const tels = db.prepare("SELECT numero, tipo, rotulo FROM telefones WHERE lead_id = ? ORDER BY principal DESC, id").all(lead.id);
  const blocoTels = tels.length
    ? `- Telefones do card: ${tels.map((t) => `${t.numero} (${t.tipo}${t.rotulo ? ": " + t.rotulo : ""})`).join(" · ")}`
    : "";

  return `${PROMPT_SDR}
${blocoTreinamento()}

## PERSONA (OBRIGATÓRIO)
Nesta conversa VOCÊ É ${personaDoLead(lead)} — a mensagem sai no número dele. Apresente-se e assine SEMPRE como ${personaDoLead(lead)}, nunca como outro nome (mesmo que o treinamento cite outro diretor como exemplo).

## AGORA
Data/hora em São Paulo: ${data} ${hora} (${DIAS_PT[diaSemana]})

## LEAD
- Clínica: ${lead.nome_clinica}${lead.cidade ? ` (${lead.cidade})` : ""}
- Nicho: ${lead.nicho || "clínica"}
- Contato: ${lead.nome_contato || "ainda não sabemos o nome"}
- Atendente (quem responde): ${lead.nome_atendente || "NÃO REGISTRADO — pergunte o nome de quem te atende e registre em nome_atendente"}
- Decisor (responsável): ${lead.nome_decisor || "NÃO REGISTRADO — descubra o nome do responsável e registre em nome_decisor ANTES de pedir o contato"}
- É o responsável? ${lead.eh_responsavel ? "SIM (confirmado)" : "ainda não confirmado"}
- Áudio oficial já enviado? ${lead.audio_enviado ? "SIM (não envie de novo)" : (audioDoLead(lead) ? "não (disponível pra enviar)" : "INDISPONÍVEL: áudio não configurado — NUNCA mencione áudio, conduza tudo por texto")}
- Dor mapeada: ${lead.dor || "nenhuma ainda"}
- Status: ${lead.status}
${blocoTels}
- LINK_APRESENTACAO: ${getConfig("link_apresentacao", "") || "(não configurado — NUNCA mencione link de apresentação)"}
- LINK_SITE: ${getConfig("link_site", "https://facilitaai-lp.lovable.app") || "(não configurado — se pedirem site/Instagram, ofereça mandar o material por aqui)"}

${blocoNotas}## HORARIOS_DISPONIVEIS
${horarios}

${thread ? `## CANAL ATUAL: CONVERSA DIRETA COM O DECISOR
Você AGORA está falando com ${lead.nome_decisor || thread.rotulo || "o decisor"} no número dele (${thread.telefone}) — NÃO é mais a atendente.
- Você já se apresentou e disse quem passou o contato. NÃO se reapresente.
- Objetivo: 1 pergunta de dor no máximo e já conduzir pra reunião (2 opções de horário).
- Se ele pedir LIGAÇÃO ("me liga", "pode ligar"), responda UMA linha confirmando ("Te ligo em instantes!") E use a ação pedir_ligacao junto.
- As mensagens marcadas VOCÊ incluem a conversa anterior com a atendente — é contexto, a mesma voz sua.
- **ATENÇÃO AO CANAL**: cada linha do histórico diz se foi [com o decisor] ou [com a recepção]. Só conta como "já respondi" o que está marcado [com o decisor]. O que você falou com a recepção o decisor NUNCA leu.
- **Status deste canal**: ${ultimaDoCanal?.role === "user"
    ? `o DECISOR falou por último e está esperando sua resposta — responda AGORA, não retorne ações vazias.`
    : `você falou por último aqui; se não há nada novo a dizer, retorne ações vazias.`}
` : ""}## CONVERSA ATÉ AGORA
${conversa}

Responda com o JSON de ações.`;
}

// ---------- chamada headless ----------
function chamarClaude(prompt) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (process.env.SDR_IA_MODO === "api") {
      // container de CLIENTE (SaaS replicado): usa a ANTHROPIC_API_KEY do proprio
      // cliente (ele paga os tokens). A chave salva pelo painel (config) tem
      // prioridade sobre a do provisionamento (.env). Remove o token de plano.
      const chaveConfig = getConfig("anthropic_key", "");
      if (chaveConfig) env.ANTHROPIC_API_KEY = chaveConfig;
      delete env.CLAUDE_CODE_OAUTH_TOKEN;
    } else {
      // modo interno (Matheus/Valentino na VPS): conta/plano logado, nunca API paga
      delete env.ANTHROPIC_API_KEY;
    }
    const args = ["-p", "--output-format", "json"];
    if (CLAUDE_MODEL) args.push("--model", CLAUDE_MODEL);
    const child = execFile(CLAUDE_BIN, args, {
      env, timeout: 180_000, maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout) => {
      if (err && !stdout) return reject(err);
      try {
        const out = JSON.parse(stdout);
        resolve(String(out.result ?? out.content ?? stdout));
      } catch { resolve(String(stdout)); }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// extrai o objeto {"acoes": [...]} mesmo se vier com texto/cerca de codigo em volta
function parseAcoes(saida) {
  const s = String(saida || "");
  const inicio = s.indexOf("{");
  if (inicio === -1) return null;
  for (let fim = s.lastIndexOf("}"); fim > inicio; fim = s.lastIndexOf("}", fim - 1)) {
    try {
      const obj = JSON.parse(s.slice(inicio, fim + 1));
      if (Array.isArray(obj?.acoes)) return obj.acoes;
    } catch { /* tenta fechar antes */ }
  }
  return null;
}

// ---------- execucao das acoes ----------
async function executarAcoes(lead, acoes, instanceToken, thread = null) {
  // com THREAD (conversa direta com o decisor), tudo sai pro numero DELA
  const alvoTel = thread?.telefone || lead.telefone;
  const salvarMsg = (role, texto, tipo) => {
    const r = salvarMensagem(lead.id, role, texto, tipo);
    if (thread) db.prepare("UPDATE mensagens SET thread_id = ? WHERE id = ?").run(thread.id, r.lastInsertRowid);
    return r;
  };
  // telefone 0000... = lead de SIMULACAO (teste E2E sem WhatsApp real): nada sai pra rede
  const simulado = String(alvoTel).startsWith("0000");
  // se e o 2o bot_detectado, o lead vira perdido e NAO mandamos texto (nao adianta falar com bot)
  const segundoBot = acoes.some((a) => a.tipo === "bot_detectado") && (getLead(lead.id).pedidos_humano || 0) >= 1;
  // HUMANO ASSUMIU NO MEIO? A pausa pode chegar enquanto o Claude pensa (10-30s)
  // ou entre uma bolha e outra — re-checa ANTES de cada envio pra parada ser
  // imediata (sem isso, clicar "assumir" e a IA mandava mensagem mesmo assim).
  const humanoAssumiu = () =>
    Boolean(getLead(lead.id)?.ia_pausada) || (thread ? Boolean(getThread(thread.id)?.ia_pausada) : false);
  for (const acao of acoes) {
    if (segundoBot && acao.tipo === "texto") continue; // 2o bot: nao responde a maquina
    if (["texto", "audio"].includes(acao.tipo) && humanoAssumiu()) {
      registrarEvento(lead.id, "handoff", "IA segurou a resposta: humano assumiu durante o processamento");
      return;
    }
    if (acao.tipo === "texto" && acao.texto) {
      const r = simulado ? { ok: true } : await enviarTexto(instanceToken, alvoTel, acao.texto);
      if (r.ok) salvarMsg("assistant", acao.texto);
      else { registrarEvento(lead.id, "erro", `envio falhou: ${r.erro}`); await alertar(`⚠️ SDR: falha ao enviar msg pra ${lead.nome_clinica}: ${r.erro}`, { usuarioId: donoDoLeadId(lead) }); }
      if (lead.status === "respondeu") atualizarLead(lead.id, { status: "em_conversa" });
      await new Promise((r2) => setTimeout(r2, 2500 + Math.random() * 2500)); // pausa entre bolhas
    }

    if (acao.tipo === "audio") {
      // ÁUDIO DA PESSOA CERTA: usa o áudio do dono do lead (ou da pipeline dele).
      // Assim o lead do Valentino ouve a voz do Valentino, e o meu ouve a minha.
      const caminho = audioDoLead(lead);
      if (!caminho || !existsSync(caminho)) {
        registrarEvento(lead.id, "erro", "audio oficial nao configurado");
        continue; // o prompt ja mandou texto junto; sem audio configurado segue so no texto
      }
      const b64 = readFileSync(caminho).toString("base64");
      const ext = caminho.split(".").pop().toLowerCase();
      const mime = ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : "audio/ogg";
      const r = simulado ? { ok: true } : await enviarMidia(instanceToken, alvoTel, { tipo: "audio", arquivo: `data:${mime};base64,${b64}` });
      if (r.ok) {
        atualizarLead(lead.id, { audio_enviado: 1 });
        const atual = getLead(lead.id);
        // so vira "Contato c/ decisor" pelo audio se a pessoa REALMENTE confirmou ser responsavel
        if (atual.eh_responsavel && ["respondeu", "em_conversa"].includes(atual.status))
          atualizarLead(lead.id, { status: "decisor" });
        salvarMensagem(lead.id, "assistant", "[🎙️ áudio oficial enviado]", "audio");
        registrarEvento(lead.id, "audio", "audio oficial enviado");
      } else {
        registrarEvento(lead.id, "erro", `audio falhou: ${r.erro}`);
        await alertar(`⚠️ SDR: áudio oficial falhou pra ${lead.nome_clinica}: ${r.erro}`, { usuarioId: donoDoLeadId(lead) });
      }
    }

    if (acao.tipo === "pedir_ligacao") {
      // o decisor pediu LIGACAO: avisa no Telegram e cria tarefa pro dono do funil
      const dono = getPipeline(lead.pipeline_id)?.usuario_id || lead.usuario_id || null;
      const quem = dono ? (getUsuario(dono)?.nome || "") : "";
      const tel = thread?.telefone || lead.telefone_decisor || lead.telefone;
      addTarefa(lead.id, `ligar pro ${lead.nome_decisor || lead.nome_contato || "decisor"} (pediu ligação)`,
        agoraSP().data, { hora: null, tipo: "ligacao", usuario_id: dono });
      await alertar(`📞 PEDIU LIGAÇÃO!\n${lead.nome_clinica}\n${lead.nome_decisor || lead.nome_contato || "decisor"}: ${tel}\nTarefa criada${quem ? " pro " + quem : ""} — liga assim que puder.`, { usuarioId: donoDoLeadId(lead) });
      registrarEvento(lead.id, "pediu_ligacao", tel);
    }

    if (acao.tipo === "atualizar_lead" && acao.campos) {
      const { etapa, ...campos } = acao.campos;
      if (campos.telefone_decisor) campos.telefone_decisor = String(campos.telefone_decisor).replace(/\D/g, "");
      atualizarLead(lead.id, campos);
      if (campos.eh_responsavel) registrarEvento(lead.id, "responsavel", campos.nome_decisor || campos.nome_contato || "");
      // pegou o NUMERO do decisor -> sinaliza (Telegram + fica no card pra abordar)
      if (campos.telefone_decisor) {
        const nomeDec = campos.nome_decisor || campos.nome_contato || null;
        registrarEvento(lead.id, "decisor_contato", campos.telefone_decisor);
        await alertar(`📞 CONTATO DO DECISOR!\n${lead.nome_clinica} (${lead.cidade || "?"})\nResponsável: ${nomeDec || "?"}\nWhatsApp: ${campos.telefone_decisor}\n➡️ a IA já vai chamar ele na segunda conversa do card`, { usuarioId: donoDoLeadId(lead) });
        // ABORDAGEM AUTOMATICA: abre a thread e a propria IA chama o decisor
        abordarDecisor(lead.id, campos.telefone_decisor, nomeDec, instanceToken)
          .catch((e) => registrarEvento(lead.id, "erro", "abordagem do decisor falhou: " + e.message));
      }
      // pipeline automatica. "Contato c/ decisor" quando:
      //  - a pessoa CONFIRMOU ser a responsavel (eh_responsavel=1), OU
      //  - conseguimos o NUMERO do decisor (contato conquistado, mesmo via secretaria).
      // etapa "decisor" sozinha NAO basta (IA pode errar com bot/secretaria).
      const atual = getLead(lead.id);
      const podeMover = !["reuniao_marcada", "compareceu", "trial", "fechado", "perdido", "optout", "descartado"].includes(atual.status);
      if (podeMover) {
        if (etapa === "negociando") atualizarLead(lead.id, { status: "negociando" });
        else if (atual.eh_responsavel || atual.telefone_decisor) atualizarLead(lead.id, { status: "decisor" });
      }
    }

    if (acao.tipo === "marcar_reuniao" && acao.inicio) {
      const closer = acao.closer === "valentino" ? "valentino" : "matheus";
      // Google Calendar do closer: evento com Meet AUTOMATICO (best-effort).
      // Fallback: link fixo da config, se existir. Simulado nunca cria evento real.
      let meet = getConfig(`meet_${closer}`, "");
      let gcalId = null;
      if (!simulado) {
        // convidados: o outro socio SEMPRE recebe o convite (os dois na agenda);
        // e-mails em config `convidados_reuniao` (separados por virgula) entram junto
        const convidados = [
          getConfig(`gcal_email_${closer === "matheus" ? "valentino" : "matheus"}`, ""),
          ...String(getConfig("convidados_reuniao", "") || "").split(",").map((x) => x.trim()),
        ].filter((e) => e && e.includes("@"));
        const ev = await criarEventoMeet(closer, acao.inicio, {
          resumo: `Facilita × ${lead.nome_clinica}`,
          descricao: `Reunião marcada pelo SDR.\nClínica: ${lead.nome_clinica} (${lead.cidade || "?"})\nContato: ${lead.nome_contato || "?"} · ${lead.telefone}\nDor: ${lead.dor || "ver conversa no painel"}`,
          convidados,
        });
        if (ev) { gcalId = ev.eventId; if (ev.meet) meet = ev.meet; }
      }
      const r = marcarReuniao(lead.id, closer, acao.inicio, meet, gcalId);
      if (!r.ok && gcalId) await apagarEventoMeet(closer, gcalId); // corrida: desfaz o evento
      if (r.ok) {
        registrarEvento(lead.id, "reuniao", `${acao.inicio} com ${closer}`);
        await alertar(`📅 REUNIÃO MARCADA!\n${lead.nome_clinica} (${lead.cidade || "?"})\n${acao.inicio} com ${closer}\nDor: ${lead.dor || "ver conversa"}\nTel: ${lead.telefone}`, { usuarioId: donoDoLeadId(lead) });
        if (meet) {
          const msg = `Link da nossa call: ${meet}\nQualquer coisa antes, é só chamar aqui.`;
          const rr = simulado ? { ok: true } : await enviarTexto(instanceToken, lead.telefone, msg);
          if (rr.ok) salvarMensagem(lead.id, "assistant", msg);
        }
      } else {
        // horario ocupado (corrida): registra e avisa o modelo via mensagem de sistema
        salvarMensagem(lead.id, "sistema", `marcar_reuniao falhou (${r.erro}) — ofereça outro horário da lista`);
        registrarEvento(lead.id, "erro", `reuniao falhou: ${r.erro}`);
        return { reprocessar: true };
      }
    }

    if (acao.tipo === "passar_pra_humano") {
      atualizarLead(lead.id, { ia_pausada: 1 });
      registrarEvento(lead.id, "handoff", acao.motivo || "");
      await alertar(`🙋 SDR passou pra humano: ${lead.nome_clinica}\nMotivo: ${acao.motivo || "?"}\nTel: ${lead.telefone}\n(responda pelo painel ou pelo WhatsApp; IA pausada)`, { usuarioId: donoDoLeadId(lead) });
    }

    // BOT do outro lado: a IA pede humano. 2 pedidos sem humano aparecer = so ha
    // maquina do outro lado -> PERDIDO automatico (nao da pra dar tratamento).
    if (acao.tipo === "bot_detectado") {
      const atual = getLead(lead.id);
      const n = (atual.pedidos_humano || 0) + 1;
      atualizarLead(lead.id, { pedidos_humano: n });
      if (n >= 2) {
        atualizarLead(lead.id, { status: "perdido", ia_pausada: 1, motivo_perda: "só atendimento automático (bot) do outro lado" });
        registrarEvento(lead.id, "perdido", "2 pedidos de humano sem sucesso (bot)");
        // NAO manda mais mensagem (nao adianta falar com bot)
      } else {
        // 1o pedido: manda a mensagem pedindo humano (o texto veio nas outras acoes)
        registrarEvento(lead.id, "bot", `pedido de humano ${n}/2`);
      }
    }

    if (acao.tipo === "descartar") {
      atualizarLead(lead.id, { status: "descartado", motivo_perda: acao.motivo || "descartado pela IA" });
      registrarEvento(lead.id, "descarte", acao.motivo || "");
    }

    if (acao.tipo === "perder") {
      // recusa explicita -> Perdidos + IA cala (nao responde pesquisa/menu que vier depois)
      atualizarLead(lead.id, { status: "perdido", ia_pausada: 1, motivo_perda: acao.motivo || "sem interesse" });
      registrarEvento(lead.id, "perdido", acao.motivo || "sem interesse");
    }

    if (acao.tipo === "agendar_followup") {
      agendarFollowupLead(lead.id, acao.horas, acao.mensagem);
      registrarEvento(lead.id, "followup", `agendado +${acao.horas || 5}h pela IA`);
    }

    if (acao.tipo === "optout") {
      bloquear(lead.telefone, "pediu pra parar");
      atualizarLead(lead.id, { status: "optout", ia_pausada: 1 });
      registrarEvento(lead.id, "optout", "");
    }
  }
  return { reprocessar: false };
}

// ---------- ENTREVISTA: monta o cerebro conversando ----------
const PROMPT_ENTREVISTA = `Você é um consultor que ajuda um empresário a configurar a IA de prospecção dele (um SDR que conversa com leads no WhatsApp). Conduza uma ENTREVISTA curta e amigável, UMA pergunta por vez, pra descobrir: o que a empresa vende e o que resolve; como a IA deve se apresentar (nome/cargo); objetivo da conversa com o lead; preço (o que responder); prova social/caso; objeções comuns e como responder; tom de voz; link de material se houver.

Conforme ele responde, você ESCREVE o cérebro do SDR em 3 blocos de texto (sempre o conteúdo COMPLETO atualizado, não só o novo pedaço):
- treino_geral: quem a IA é/como se apresenta + tom de voz + regras de estilo
- treino_pitch: o que vende, o que resolve, preço, prova social, links, objetivo da conversa
- treino_objecoes: uma objeção por linha no formato "objeção -> como responder"

Quando tiver o essencial (o que vende + objetivo + tom + 1 objeção), pergunte se pode finalizar. Ele confirmando, concluido=true.
Não invente nada: só use o que ele disse. Linguagem simples, brasileira. Nunca use travessão.

FORMATO (responda SOMENTE JSON válido, sem markdown):
{"mensagem":"sua próxima fala/pergunta","campos":{"treino_geral":"...","treino_pitch":"...","treino_objecoes":"..."},"concluido":false}
"campos" leva só os blocos que você atualizou AGORA (pode ser {}).`;

export async function entrevistaTurno(historico) {
  const atual = ["treino_geral", "treino_pitch", "treino_objecoes"]
    .map((k) => `### ${k} (conteúdo atual)\n${getConfig(k, "") || "(vazio)"}`)
    .join("\n\n");
  const conversa = (historico || [])
    .map((m) => `${m.role === "user" ? "EMPRESÁRIO" : "VOCÊ"}: ${m.content}`)
    .join("\n") ||
    "(início — faça a primeira pergunta, dando boas-vindas curtas)";
  const prompt = `${PROMPT_ENTREVISTA}

## CÉREBRO ATUAL
${atual}

## CONVERSA
${conversa}

Responda com o JSON.`;
  const saida = await chamarClaude(prompt);
  const s2 = String(saida || "");
  const ini = s2.indexOf("{");
  for (let fim = s2.lastIndexOf("}"); fim > ini && ini >= 0; fim = s2.lastIndexOf("}", fim - 1)) {
    try {
      const obj = JSON.parse(s2.slice(ini, fim + 1));
      if (obj && typeof obj.mensagem === "string") return obj;
    } catch { /* tenta fechar antes */ }
  }
  return { mensagem: s2.slice(0, 500), campos: {}, concluido: false };
}

// ---------- RESUMO da conversa (cacheado; regenera so se a conversa andou) ----------
export async function resumoDaConversa(leadId) {
  const lead = getLead(leadId);
  if (!lead) return null;
  const hist = historicoLead(leadId, 40);
  const doLead = hist.filter((m) => m.role === "user");
  if (doLead.length < 1) return null; // sem conversa util
  // cache valido se a ultima msg e anterior ao resumo salvo
  const ultimaMsg = hist.length ? hist[hist.length - 1].criado_em : null;
  if (lead.resumo && lead.resumo_em && ultimaMsg && lead.resumo_em >= ultimaMsg) return lead.resumo;

  const conversa = hist.map((m) => `${m.role === "user" ? "LEAD" : "NÓS"}: ${m.texto}`).join("\n");
  const prompt = `Resuma esta conversa de prospecção em 2-4 bullets curtos (o essencial pro vendedor bater o olho e saber o que rolou e o próximo passo). Português, direto, sem enrolação. Comece cada bullet com "• ". Responda SÓ os bullets.\n\n${conversa}`;
  try {
    const saida = await chamarClaude(prompt);
    const resumo = String(saida || "").trim().slice(0, 600);
    if (resumo) db.prepare("UPDATE leads SET resumo = ?, resumo_em = datetime('now') WHERE id = ?").run(resumo, leadId);
    return resumo || null;
  } catch { return lead.resumo || null; }
}

// ---------- entrada principal ----------
// Chamado pelo webhook DEPOIS do debounce. Monta prompt, chama o Claude do plano,
// executa as acoes. Uma tentativa de reprocesso se um horario foi tomado no meio.
// A IA CHAMA O DECISOR sozinha: abre a segunda conversa do card e manda a
// abertura no estilo da casa (saudacao + quem e + quem passou o contato).
// A persona e o DONO DO FUNIL do lead (Matheus nos dele, Valentino nos dele).
export async function abordarDecisor(leadId, telefoneCru, nomeDecisor, instanceToken) {
  const lead = getLead(leadId);
  if (!lead) return;
  const tel = normalizarTelefone(telefoneCru, lead.telefone);
  if (!tel || tel === lead.telefone) return;
  // ja existe conversa com esse numero? nao chama de novo
  const jaTem = db.prepare("SELECT id FROM threads WHERE lead_id = ? AND telefone = ?").get(leadId, tel);
  if (jaTem) return;

  // persona = dono do NUMERO que envia (nunca se apresentar como outro socio)
  const persona = personaDoLead(lead);
  // cota do chip: abordagem fria conta como disparo — nao pode estourar o limite do numero
  const instEnvio = db.prepare("SELECT * FROM instancias WHERE uazapi_token = ?").get(instanceToken || "") || null;
  if (instEnvio && instEnvio.cota_dia && (instEnvio.disparos_hoje || 0) >= instEnvio.cota_dia) {
    registrarEvento(leadId, "decisor_abordagem_segurada", `cota do chip ${instEnvio.nome} batida (${instEnvio.disparos_hoje}/${instEnvio.cota_dia})`);
    await alertar(`⏸️ IA NÃO chamou o decisor da ${lead.nome_clinica}: cota diária do chip "${instEnvio.nome}" batida. O contato ficou salvo no card — chama manual ou aguarda amanhã.`, { usuarioId: donoDoLeadId(lead) });
    return;
  }
  const nomeDecCompleto = nomeDecisor || lead.nome_decisor || null;
  const decisor = (nomeDecCompleto || "").split(" ")[0] || null;
  // atendente = quem passou o contato; nunca usar o proprio nome do decisor aqui
  const atendenteCompleto = lead.nome_atendente ||
    (lead.nome_contato && lead.nome_contato !== nomeDecCompleto ? lead.nome_contato : null);
  const atendente = (atendenteCompleto || "").split(" ")[0] || null;

  addTelefone(leadId, tel, "decisor", nomeDecCompleto || "Decisor");
  const th = abrirThread(leadId, tel, decisor ? `${decisor} (decisor)` : "Decisor", lead.instancia_id || null);
  atualizarLead(leadId, { nome_decisor: nomeDecCompleto });

  const h = agoraSP().hora;
  const sauda = h < "12:00" ? "Bom dia" : h < "18:00" ? "Boa tarde" : "Boa noite";
  const msgs = [
    `${sauda}${decisor ? " " + decisor : ""}, tudo certo contigo?`,
    `Me chamo ${persona}, sou um dos diretores da Facilita AI. ${atendente ? `A ${atendente} da ${lead.nome_clinica} me passou teu contato` : `Me passaram teu contato na ${lead.nome_clinica}`}, disseram que é contigo que eu falo. Consigo te explicar o motivo em 1 minuto?`,
  ];
  const simulado = String(tel).startsWith("0000");
  for (const m of msgs) {
    const r = simulado ? { ok: true } : await enviarTexto(instanceToken, tel, m);
    if (!r.ok) { registrarEvento(leadId, "erro", `abordagem decisor falhou: ${r.erro}`); return; }
    const ins = salvarMensagem(leadId, "assistant", m);
    db.prepare("UPDATE mensagens SET thread_id = ? WHERE id = ?").run(th.id, ins.lastInsertRowid);
    await new Promise((r2) => setTimeout(r2, 2500 + Math.random() * 2000));
  }
  registrarEvento(leadId, "decisor_abordado", tel);
  if (!simulado && instEnvio) db.prepare("UPDATE instancias SET disparos_hoje = disparos_hoje + 1 WHERE id = ?").run(instEnvio.id);
  await alertar(`🤖➡️📞 IA chamou o decisor da ${lead.nome_clinica} (${tel}) como ${persona}. A conversa segue na aba do card.`, { usuarioId: donoDoLeadId(lead) });
}

export async function responderLead(leadId, instanceToken, opts = {}) {
  const lead = getLead(leadId);
  if (!lead || lead.ia_pausada) return;
  const thread = opts.threadId ? getThread(opts.threadId) : null;

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let saida;
    try {
      saida = await chamarClaude(montarPrompt(getLead(leadId), thread));
    } catch (e) {
      registrarEvento(leadId, "erro", `claude falhou: ${e.message}`);
      await alertar(`🔴 SDR: Claude da VPS falhou (${e.message}). Verifica se a conta está logada (claude /login).`);
      return;
    }
    const acoes = parseAcoes(saida);
    if (!acoes) {
      registrarEvento(leadId, "erro", `saida sem JSON: ${String(saida).slice(0, 200)}`);
      if (tentativa === 0) continue; // segunda chance
      await alertar(`⚠️ SDR: resposta da IA sem JSON pra ${lead.nome_clinica} (lead ${leadId}). Ver logs.`, { usuarioId: donoDoLeadId(lead) });
      return;
    }
    const { reprocessar } = await executarAcoes(getLead(leadId), acoes, instanceToken, thread);
    if (!reprocessar) return;
  }
}
