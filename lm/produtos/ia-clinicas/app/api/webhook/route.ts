import { NextRequest, NextResponse } from "next/server";
import { parseWebhook, enviarTexto, mostrarDigitando } from "@/lib/uazapi";
import {
  getInstanciaPorNumero,
  getInstanciaPorIdentificador,
  listTodasInstancias,
  pausarIAPaciente,
  getOuCriaPaciente,
  salvarMensagem,
  marcarEventoProcessado,
  adquirirLockConversa,
  liberarLockConversa,
  historicoConversa,
  ultimaMensagemUsuario,
  salvarContatoWhats,
  moverEtapaAutomatica,
  iaPausadaPaciente,
  registrarLog,
  isTrue,
} from "@/lib/db";
import { responder } from "@/lib/ia";
import { alertarErro, enviarAlerta } from "@/lib/alertas";
import { transcreverDetalhado } from "@/lib/transcrever";
import { lerMidia } from "@/lib/lermidia";
import { salvarUltimaMidia } from "@/lib/db";

// Comandos de controle do atendimento humano (o paciente ou o atendente digita).
// "stop"/"parar"/"atendente"/"humano" -> IA CALA e um humano assume a conversa.
// RETOMAR: so comando EXPLICITO e raro. "voltar"/"iniciar" foram REMOVIDOS
// (bug real Compass 05/08: paciente/testador digitava "voltar" num contexto
// qualquer e a IA reassumia conversa que o atendente tinha pego — parecia que
// o refresh da pagina desfazia o assumir). Devolver pra IA agora e pelo painel
// (botao "Devolver pra IA") ou pelo comando explicito.
const CMD_PAUSAR = ["stop", "parar", "atendente", "humano"];
const CMD_RETOMAR = ["ativar ia", "reativar ia", "ia voltar"];
function comandoControle(texto: string): "pausar" | "retomar" | null {
  const t = texto.trim().toLowerCase();
  if (CMD_PAUSAR.includes(t)) return "pausar";
  if (CMD_RETOMAR.includes(t)) return "retomar";
  return null;
}

// Teto de execucao do webhook. 60s e o maximo do plano Hobby da Vercel — da
// folga pro delay humanizado de ~30s + o processamento da IA (que roda em
// PARALELO com o delay, ver enviarHumanizado). No Pro da pra ir ate 300s.
export const maxDuration = 60;
// margem de seguranca antes do teto (pra request terminar e responder 200
// antes da Vercel matar a funcao — sem isso, "quase estourar" ainda derruba)
const MARGEM_SEGURANCA_MS = 4000;

// Humanizacao: o alvo e o TEMPO TOTAL entre a mensagem do paciente e a
// resposta (nao um sleep somado depois da IA). A IA processa primeiro; o que
// faltar pro alvo vira espera com "digitando". Ex: alvo 30s, IA levou 12s →
// espera mais 18s. IA levou 40s → envia na hora. Assim o tempo de resposta e
// consistente e nunca estoura o teto da funcao.
// env: HUMANIZAR_DELAY_MIN / HUMANIZAR_DELAY_MAX (segundos, alvo total).
// Guard contra env vazia/NaN — env "" quebrava tudo.
const DELAY_MIN = Number(process.env.HUMANIZAR_DELAY_MIN) || 3;
const DELAY_MAX = Number(process.env.HUMANIZAR_DELAY_MAX) || 6;

// NUMEROS DE TESTE (sem delay): responder na hora, sem humanizacao nem espera
// de rajada. So pra QUEM TESTA o sistema — paciente real precisa do delay (ele
// da tempo da pessoa terminar de digitar e evita resposta "robotica na hora").
// env TELEFONES_SEM_DELAY: numeros separados por virgula, em qualquer formato
// (a comparacao usa so os digitos, entao "+55 31 8331-7347" == "553183317347").
const SEM_DELAY = new Set(
  String(process.env.TELEFONES_SEM_DELAY || "")
    .split(",")
    .map((t) => t.replace(/\D/g, ""))
    .filter(Boolean)
);
function semDelay(telefone: string): boolean {
  const d = String(telefone || "").replace(/\D/g, "");
  if (!d || SEM_DELAY.size === 0) return false;
  // compara pelos ultimos 8 digitos: cobre variacao de DDI/DDD e do 9o digito
  const curto = d.slice(-8);
  for (const n of SEM_DELAY) if (n.slice(-8) === curto) return true;
  return false;
}

// A mensagem fromMe recebida bate com uma resposta que a IA acabou de enviar?
// (o WhatsApp ecoa toda saida do numero — inclusive as respostas da propria IA)
// Compara com as ultimas mensagens 'assistant' do historico. Normaliza espacos
// e ignora acento/caixa pra pegar o eco mesmo com pequena diferenca de encoding.
function normalizar(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
async function ecoDeRespostaDaIA(clinicaId: string, telefone: string, texto: string): Promise<boolean> {
  try {
    const t = normalizar(texto);
    if (t.length < 3) return false;
    const hist = await historicoConversa(clinicaId, telefone, 6);
    return hist.some((m: any) => m.role === "assistant" && normalizar(m.conteudo) === t);
  } catch {
    return false; // na duvida, NAO trata como eco (deixa o fluxo normal seguir)
  }
}

// Espera a vez na conversa: tenta adquirir o lock por ate (orcamento - 8s de
// processamento minimo). Se o paciente mandou 2 mensagens quase juntas, a
// segunda espera a primeira terminar — em vez de rodarem 2 IAs em paralelo
// (que respondiam fora de ordem e podiam marcar 2 consultas).
async function aguardarLockConversa(
  clinicaId: string,
  telefone: string,
  inicioRequestMs: number
): Promise<boolean> {
  const orcamentoEsperaMs =
    maxDuration * 1000 - MARGEM_SEGURANCA_MS - (Date.now() - inicioRequestMs) - 8000;
  const limite = Date.now() + Math.max(0, orcamentoEsperaMs);
  while (true) {
    if (await adquirirLockConversa(clinicaId, telefone)) return true;
    if (Date.now() + 700 > limite) return false;
    await new Promise((r) => setTimeout(r, 700));
  }
}

// Espera da RAJADA: dorme ate completar o alvo humanizado (mesma janela
// HUMANIZAR_DELAY_MIN/MAX) desde o RECEBIMENTO — e o tempo que damos pra
// pessoa terminar de digitar as mensagens dela. Reserva ~20s do teto pro
// processamento da IA que vem depois (tools, integracoes).
async function esperarRajada(inicioRequestMs: number, telefone?: string) {
  if (telefone && semDelay(telefone)) return; // numero de teste: responde na hora
  const alvoS = DELAY_MIN + Math.floor(Math.random() * Math.max(0, DELAY_MAX - DELAY_MIN + 1));
  const jaGastoMs = Date.now() - inicioRequestMs;
  const tetoMs = maxDuration * 1000 - MARGEM_SEGURANCA_MS - 20_000 - jaGastoMs;
  const esperaMs = Math.max(0, Math.min(alvoS * 1000 - jaGastoMs, tetoMs));
  if (esperaMs > 0) await new Promise((r) => setTimeout(r, esperaMs));
}

// O atendente ASSUMIU enquanto a IA processava? Descarta o envio. Fecha a
// corrida criada pelo delay de ~30s: a checagem de pausa acontecia so no
// INICIO — clicar "Assumir conversa" durante a espera/processamento nao
// impedia a resposta que ja estava em voo (parecia botao quebrado).
async function assumidaDurante(clinicaId: string, telefone: string): Promise<boolean> {
  try {
    return await iaPausadaPaciente(clinicaId, telefone);
  } catch {
    return false;
  }
}

// inicioRequestMs: timestamp de quando a request comecou. O delay e cortado
// pelo tempo que sobra ate o teto (maxDuration - margem) — se audio/tools ja
// gastaram 20s, nao insiste em mais 9s de delay e estoura a funcao (que mata
// a resposta no meio: paciente fica sem nada e ainda sofre reenvio da uazapi).
async function enviarHumanizado(
  token: string,
  telefone: string,
  texto: string,
  inicioRequestMs: number
): Promise<{ ok: boolean; erro?: string }> {
  if (!texto) return { ok: true };
  // numero de teste: envia direto, sem "digitando" nem espera
  if (semDelay(telefone)) return await enviarTexto(token, telefone, texto);
  // alvo TOTAL desde o recebimento da mensagem: desconta o que a IA ja gastou
  // processando. Clampa pelo orcamento restante da funcao (nunca estoura o teto).
  const alvoTotalS = DELAY_MIN + Math.floor(Math.random() * Math.max(0, DELAY_MAX - DELAY_MIN + 1));
  const jaGastoMs = Date.now() - inicioRequestMs;
  const orcamentoMs = maxDuration * 1000 - MARGEM_SEGURANCA_MS - jaGastoMs;
  const segundos = Math.max(0, Math.min(Math.floor((alvoTotalS * 1000 - jaGastoMs) / 1000), Math.floor(orcamentoMs / 1000)));
  // WhatsApp mostra "digitando" por ~poucos segundos; reenvia a cada 8s pra
  // manter o "digitando" visivel durante toda a espera.
  const fim = Date.now() + segundos * 1000;
  await mostrarDigitando(token, telefone);
  while (Date.now() < fim) {
    const resta = fim - Date.now();
    await new Promise((r) => setTimeout(r, Math.min(8000, resta)));
    if (Date.now() < fim) await mostrarDigitando(token, telefone); // renova o "digitando"
  }
  const r = await enviarTexto(token, telefone, texto);
  // NAO deixa a falha em silencio: se o WhatsApp caiu/instancia desconectou,
  // o paciente nao recebe nada e a resposta ja foi salva no historico (a IA
  // "acha" que respondeu) — alerta pra alguem seguir manualmente.
  if (!r.ok) {
    console.error("[webhook] falha ao enviar resposta:", r.erro);
    await enviarAlerta(`⚠️ Nao consegui enviar resposta pra ${telefone}. Motivo: ${r.erro || "desconhecido"}`);
    return { ok: false, erro: r.erro };
  }
  return { ok: true };
}

// Webhook que a uazapi chama quando chega mensagem no WhatsApp da clinica.
// Configurar na uazapi: URL = https://SEU_HOST/api/webhook?secret=WEBHOOK_SECRET
//
// SEGURANCA: exige o WEBHOOK_SECRET (query ?secret= ou header x-webhook-secret).
// Sem ele, qualquer um poderia injetar mensagens e queimar credito da Claude.
export async function POST(req: NextRequest) {
  const inicioRequestMs = Date.now();
  // 1) valida o segredo do webhook (FAIL-CLOSED: sem o segredo configurado,
  //    a rota NEGA em vez de abrir — nunca processa sem autenticacao)
  const esperado = process.env.WEBHOOK_SECRET;
  if (!esperado) {
    console.error("[webhook] WEBHOOK_SECRET nao configurado — negando");
    return NextResponse.json(
      { ok: false, erro: "servico mal configurado" },
      { status: 500 }
    );
  }
  const recebido =
    req.nextUrl.searchParams.get("secret") ||
    req.headers.get("x-webhook-secret") ||
    "";
  if (recebido !== esperado) {
    return NextResponse.json({ ok: false, erro: "nao autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const msg = parseWebhook(body);

    if (!msg) return NextResponse.json({ ok: true, ignored: true });

    // DEDUP: a uazapi reenvia o webhook se nao receber 200 a tempo (nosso
    // processamento leva 5-20s: delay humanizado + IA + tools). Sem isso, um
    // reenvio reprocessa tudo de novo — mensagem/resposta duplicada, e ate
    // uma segunda consulta marcada. So dedupa quando ha messageId (mensagens
    // sem id, se existirem, seguem processando — nao ha como travar sem chave).
    if (msg.messageId) {
      // chave inclui o telefone: id de mensagem igual em CONVERSAS diferentes
      // (teoricamente possivel entre instancias) nunca se engole por engano
      const eraNovo = await marcarEventoProcessado(`${msg.telefone}:${msg.messageId}`);
      if (!eraNovo) {
        return NextResponse.json({ ok: true, duplicado: true });
      }
    }

    // GRUPOS: a IA NUNCA responde em grupo de WhatsApp (so atendimento 1:1).
    if (msg.ehGrupo) return NextResponse.json({ ok: true, grupo: true, ignored: true });

    // 2) descobre a instancia/clinica. Ordem de roteamento robusta:
    //    a) pelo identificador da instancia (uazapi_instance / uazapi_token)
    //    b) pelo NUMERO da clinica que recebeu (owner) — funciona multi-tenant
    //    c) fallback: SO se existir exatamente uma instancia no sistema inteiro
    let instancia =
      (msg.instancia && (await getInstanciaPorIdentificador(msg.instancia))) ||
      null;

    if (!instancia && msg.numeroClinica) {
      instancia = await getInstanciaPorNumero(msg.numeroClinica);
    }

    // fallback so e seguro quando ha UMA unica instancia (fase de piloto).
    // Com varias clinicas, NUNCA adivinha — melhor alertar do que misrotear.
    if (!instancia) {
      const todas = await listTodasInstancias();
      if (todas.length === 1) instancia = todas[0];
    }

    if (!instancia) {
      // nao engole em silencio: loga e alerta pra investigar o payload
      console.warn("[webhook] instancia nao encontrada. ident:", msg.instancia);
      await enviarAlerta(
        `⚠️ Webhook recebeu mensagem mas nao achou a instancia (ident: ${msg.instancia}). Telefone: ${msg.telefone}`
      );
      // 200 pra uazapi nao ficar reenviando; o alerta ja avisou
      return NextResponse.json({ ok: false, erro: "instancia nao encontrada" });
    }

    // MENSAGEM COM fromMe=true: pode ser (a) a PROPRIA IA (o WhatsApp ecoa toda
    // mensagem que sai do numero, inclusive as que a IA enviou pela API), ou
    // (b) um humano digitando no celular da clinica.
    //  - (a) IA/sistema -> IGNORAR (senao a IA se auto-pausa apos a 1a resposta!)
    //  - (b) humano digitou -> pausa a IA (o atendente assumiu)
    // Distincao: enviadaPelaApi (flag da uazapi) OU o texto bate com uma
    // resposta que a IA acabou de mandar (dedup por conteudo recente).
    if (msg.fromMe) {
      const respostaDaIA =
        msg.enviadaPelaApi ||
        (msg.tipo === "texto" && (await ecoDeRespostaDaIA(instancia.clinica_id, msg.telefone, msg.texto)));
      if (respostaDaIA) {
        // eco da propria IA — ignora totalmente (nao pausa, nao duplica no historico)
        return NextResponse.json({ ok: true, ecoIA: true });
      }
      // humano de verdade assumiu pelo celular
      await pausarIAPaciente(instancia.clinica_id, msg.telefone, true);
      await salvarMensagem({
        clinica_id: instancia.clinica_id,
        instancia_id: instancia.id,
        telefone: msg.telefone,
        role: "assistant",
        conteudo: msg.tipo === "texto" ? msg.texto : `[${msg.tipo} enviado pelo atendente]`,
      });
      return NextResponse.json({ ok: true, atendenteAssumiu: true });
    }

    // 2.5) CONTROLE DE ATENDIMENTO HUMANO ("stop")
    //   Comando de texto exato: "stop"/"parar" -> IA cala e humano assume;
    //   "voltar"/"iniciar" -> IA volta. Vale so pra mensagem de TEXTO curta.
    const cmd = msg.tipo === "texto" ? comandoControle(msg.texto) : null;
    if (cmd === "pausar") {
      await pausarIAPaciente(instancia.clinica_id, msg.telefone, true);
      await salvarMensagem({
        clinica_id: instancia.clinica_id,
        instancia_id: instancia.id,
        telefone: msg.telefone,
        role: "user",
        conteudo: msg.texto,
      });
      await enviarAlerta(
        `🙋 Paciente ${msg.telefone} pediu ATENDENTE (stop). IA pausada — assuma a conversa no WhatsApp. (paciente digita "voltar" pra IA retornar)`
      );
      // NAO responde nada ao paciente: quem fala agora e o humano
      return NextResponse.json({ ok: true, pausada: true });
    }
    if (cmd === "retomar") {
      await pausarIAPaciente(instancia.clinica_id, msg.telefone, false);
      await enviarTexto(
        instancia.uazapi_token,
        msg.telefone,
        "Prontinho, voltei a te atender por aqui 😊 Como posso ajudar?"
      );
      return NextResponse.json({ ok: true, retomada: true });
    }

    // registra/acha o paciente JA NO PRIMEIRO CONTATO (antes so nascia quando
    // agendava): alimenta a metrica de "conversas iniciadas" e o log de
    // atendimento iniciado, e ja devolve o estado de pausa da conversa.
    const pacienteReg = await getOuCriaPaciente(instancia.clinica_id, msg.telefone);

    // nome publicado no WhatsApp: veio de graca no evento, guardamos pra lista
    // de Conversas mostrar a mesma cara que a clinica ve no celular. Fica em
    // wa_nome (separado de `nome`, que e o nome que o paciente diz pra IA e vai
    // pro cadastro da consulta). So grava se mudou — evita escrita a cada msg.
    if (msg.pushName && msg.pushName !== pacienteReg.wa_nome) {
      await salvarContatoWhats(instancia.clinica_id, msg.telefone, { nome: msg.pushName });
    }
    // CRM: quem respondeu saiu de "novo contato" e esta em atendimento. So
    // avanca (nunca puxa pra tras um card que a recepcao ja classificou).
    await moverEtapaAutomatica(instancia.clinica_id, msg.telefone, "atendimento");

    // se a IA esta pausada pra esse paciente (humano assumiu), so registra a
    // mensagem no historico e NAO responde — deixa o atendente conduzir.
    if (isTrue(pacienteReg.ia_pausada)) {
      await salvarMensagem({
        clinica_id: instancia.clinica_id,
        instancia_id: instancia.id,
        telefone: msg.telefone,
        role: "user",
        conteudo: msg.tipo === "texto" ? msg.texto : `[${msg.tipo}]`,
      });
      return NextResponse.json({ ok: true, pausada: true, ignored: true });
    }

    // DEBOUNCE DE RAJADA (so texto): salva a mensagem JA, espera o alvo
    // humanizado (~30s) pra pessoa TERMINAR de digitar, e so responde se essa
    // mensagem ainda for a ULTIMA. Se chegou outra nesse meio tempo, este
    // handler sai em silencio — o handler da mensagem mais nova responde com o
    // historico completo da rajada (a IA analisa o CONTEXTO todo, nao responde
    // mensagem por mensagem). Roda ANTES do lock, senao a 2a mensagem ficaria
    // presa esperando a 1a terminar a espera dela.
    let msgSalvaId: string | null = null;
    if (msg.tipo === "texto") {
      const salva = await salvarMensagem({
        clinica_id: instancia.clinica_id,
        instancia_id: instancia.id,
        telefone: msg.telefone,
        role: "user",
        conteudo: msg.texto,
      });
      msgSalvaId = salva?.id || null;
      await esperarRajada(inicioRequestMs, msg.telefone);
      if (msgSalvaId) {
        const ultima = await ultimaMensagemUsuario(instancia.clinica_id, msg.telefone);
        if (ultima && ultima.id !== msgSalvaId) {
          return NextResponse.json({ ok: true, aguardouRajada: true });
        }
      }
    }

    // LOCK POR CONVERSA: garante UMA resposta da IA por vez por paciente.
    // Se nao conseguir a vez dentro do orcamento de tempo, so registra a
    // mensagem no historico (a IA ve na proxima interacao) e nao responde
    // agora — melhor que responder em paralelo/fora de ordem.
    if (!(await aguardarLockConversa(instancia.clinica_id, msg.telefone, inicioRequestMs))) {
      if (msg.tipo !== "texto") {
        // texto ja foi salvo antes do debounce; midia salva aqui
        await salvarMensagem({
          clinica_id: instancia.clinica_id,
          instancia_id: instancia.id,
          telefone: msg.telefone,
          role: "user",
          conteudo: `[${msg.tipo}]`,
        });
      }
      return NextResponse.json({ ok: true, aguardandoVez: true });
    }
    try {

    // RE-CHECA a rajada depois de pegar o lock (pode ter chegado mensagem nova
    // enquanto esperava a vez) — de novo, quem responde e o handler da ultima.
    if (msg.tipo === "texto" && msgSalvaId) {
      const ultima = await ultimaMensagemUsuario(instancia.clinica_id, msg.telefone);
      if (ultima && ultima.id !== msgSalvaId) {
        return NextResponse.json({ ok: true, aguardouRajada: true });
      }
    }

    // RE-CHECA a pausa depois da espera: o atendente pode ter clicado
    // "Assumir conversa" durante os ~30s do debounce — ai a IA CALA.
    if (await assumidaDurante(instancia.clinica_id, msg.telefone)) {
      return NextResponse.json({ ok: true, pausada: true, assumidaDuranteEspera: true });
    }

    // 3) FIGURINHA (sticker): expressao, nao pergunta — ignora em silencio.
    //    Responder qualquer coisa a figurinha soa robo (pedido da clinica 05/08).
    if (msg.tipo === "figurinha") {
      return NextResponse.json({ ok: true, ignored: "figurinha" });
    }

    // 4) midia: audio agora e TRANSCRITO (Whisper) e segue o fluxo normal da IA.
    //    Se a transcricao falhar (sem OPENAI_API_KEY, download falhou, etc),
    //    cai no fallback gracioso de sempre. Imagem continua pedindo texto.
    if (msg.tipo !== "texto") {
      if (msg.tipo === "audio") {
        const { texto: transcrito, erro } = await transcreverDetalhado(
          body,
          instancia.uazapi_token
        );
        if (transcrito) {
          const { texto, passouPraHumano } = await responder({
            clinicaId: instancia.clinica_id,
            telefone: msg.telefone,
            texto: transcrito,
            canal: instancia.funcao || "atendimento",
          });
          if (await assumidaDurante(instancia.clinica_id, msg.telefone)) {
            await registrarLog(instancia.clinica_id, "conversa", `🙋 Resposta da IA descartada — atendente assumiu durante o processamento (${msg.telefone})`).catch(() => {});
            return NextResponse.json({ ok: true, descartada: "atendente_assumiu" });
          }
          await enviarHumanizado(instancia.uazapi_token, msg.telefone, texto, inicioRequestMs);
          return NextResponse.json({ ok: true, transcrito: true, passouPraHumano });
        }
        // audio chegou mas nao transcreveu: NAO deixa em silencio — alerta pra gente
        // ver o motivo real (formato do payload, download, etc) em vez de so falhar.
        console.warn("[webhook] audio nao transcrito:", erro);
        await enviarAlerta(
          `🎤 Audio de ${msg.telefone} nao foi transcrito. Motivo: ${erro || "desconhecido"}`
        );
      } else {
        // IMAGEM/PDF (guia de exame, carteirinha, documento): baixa, LE o
        // conteudo com a IA e segue a conversa normal — antes respondia
        // "consigo te ajudar melhor por texto" e matava o fluxo da guia.
        const { texto: extraido, url } = await lerMidia(body, instancia.uazapi_token);
        if (!extraido) {
          // NAO deixa em silencio: guia que nao foi lida vira atendimento
          // manual (a IA perguntando "qual exame?" e o paciente digitando).
          // Caso real 20/08: PDF de Ergoespirometria chegou como "PEDIDO.pdf"
          // e a IA nao viu exame nem convenio.
          console.warn("[webhook] midia NAO lida:", msg.tipo, "arquivo:", msg.texto || "(sem nome)");
          await enviarAlerta(
            `📎 Arquivo de ${msg.telefone} NAO foi lido pela IA (${msg.texto || msg.tipo}). ` +
              `A IA vai pedir os dados por texto — confira a conversa se for guia de exame.`
          ).catch(() => {});
        }
        if (extraido) {
          // guarda a midia recente: se a IA agendar exame agora, ela anexa
          // essa guia na consulta (aparece no card da agenda)
          if (url) await salvarUltimaMidia(instancia.clinica_id, msg.telefone, url);
          const { texto, passouPraHumano } = await responder({
            clinicaId: instancia.clinica_id,
            telefone: msg.telefone,
            canal: instancia.funcao || "atendimento",
            texto: `[O paciente enviou um arquivo${msg.texto ? ` com a legenda: "${msg.texto}"` : ""}. Conteudo extraido do arquivo:]\n${extraido}`,
          });
          if (await assumidaDurante(instancia.clinica_id, msg.telefone)) {
            await registrarLog(instancia.clinica_id, "conversa", `🙋 Resposta da IA descartada — atendente assumiu durante o processamento (${msg.telefone})`).catch(() => {});
            return NextResponse.json({ ok: true, descartada: "atendente_assumiu" });
          }
          await enviarHumanizado(instancia.uazapi_token, msg.telefone, texto, inicioRequestMs);
          return NextResponse.json({ ok: true, midiaLida: true, passouPraHumano });
        }
      }
      const aviso =
        msg.tipo === "audio"
          ? "Oi! Nao consegui ouvir teu audio agora 😅 Pode me escrever por texto o que precisa?"
          : "Opa, nao consegui abrir o arquivo aqui. Pode mandar de novo (de preferencia uma FOTO da guia) ou me dizer por texto qual exame o medico pediu e qual seu convenio?";
      await enviarTexto(instancia.uazapi_token, msg.telefone, aviso);
      return NextResponse.json({ ok: true, midia: msg.tipo });
    }

    // 4) fluxo normal: IA responde (a mensagem ja foi salva no debounce; a IA
    //    le o historico completo da rajada e responde TUDO de uma vez)
    const { texto, passouPraHumano } = await responder({
      clinicaId: instancia.clinica_id,
      telefone: msg.telefone,
      texto: msg.texto,
      mensagemJaSalva: true,
      canal: instancia.funcao || "atendimento",
    });

    // ultima checagem antes de ENVIAR: assumiu durante o processamento da IA?
    if (await assumidaDurante(instancia.clinica_id, msg.telefone)) {
      await registrarLog(instancia.clinica_id, "conversa", `🙋 Resposta da IA descartada — atendente assumiu durante o processamento (${msg.telefone})`).catch(() => {});
      return NextResponse.json({ ok: true, descartada: "atendente_assumiu" });
    }
    await enviarHumanizado(instancia.uazapi_token, msg.telefone, texto, inicioRequestMs);

    return NextResponse.json({ ok: true, passouPraHumano });

    } finally {
      // libera a vez SEMPRE (mesmo com erro no meio) — senao a conversa do
      // paciente ficaria travada ate o TTL do lock vencer.
      await liberarLockConversa(instancia.clinica_id, msg.telefone);
    }
  } catch (e: any) {
    console.error("[webhook] erro:", e.message);
    await alertarErro("webhook", e);
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

// GET: health-check generico (nao revela detalhes do servico)
export async function GET() {
  return NextResponse.json({ ok: true });
}
