import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELO } from "./claude";
import {
  getClinica,
  listProfissionais,
  listMateriais,
  historicoConversa,
  salvarMensagem,
  registrarUsoTokens,
  proximaConsultaDoPaciente,
  atualizarStatusConsulta,
  entrarListaEspera,
  getUltimaMidiaRecente,
  registrarLog,
  criarDuvida,
  duvidasRespondidasRecentes,
  salvarCadastroPaciente,
  listBloqueiosExame,
  horarioBloqueadoExame,
} from "./db";
import {
  slotsDisponiveis,
  proximasDatasComVaga,
  agendar,
  remarcar,
  cancelar,
  horaDoSlot,
  hojeSP,
  agoraSP,
  dataComDia,
  MARGEM_IA_MIN,
} from "./agenda";
import { alertarHumano } from "./alertas";
import { feegowConectada, listarExamesFeegow, horariosExameFeegow } from "./feegow";

// Modelo: Haiku resolve a grande maioria das conversas com custo baixo.
// Client e modelo vem de lib/claude.ts (provider Anthropic ou Vertex por env).

// Monta o system prompt da clinica a partir do cadastro.
async function montarSystemPrompt(clinicaId: string, canal?: string): Promise<string> {
  const c = await getClinica(clinicaId);
  const [profs, materiais] = await Promise.all([
    listProfissionais(clinicaId),
    listMateriais(clinicaId),
  ]);

  // ficha rica de cada profissional: convenios PROPRIOS + infos extras
  const listaProfs = profs
    .map((p) => {
      const linhas = [
        `- ${p.nome}${p.especialidade ? ` (${p.especialidade})` : ""} — consultas de ${p.duracao_min}min [id: ${p.id}]`,
      ];
      if (p.convenios) linhas.push(`  Convenios que ESSE profissional atende: ${p.convenios}`);
      if (p.info) linhas.push(`  Sobre: ${String(p.info).slice(0, 600)}`);
      return linhas.join("\n");
    })
    .join("\n");

  // materiais da clinica viram conhecimento (cap por material e total)
  let blocoMateriais = "";
  if (materiais.length > 0) {
    let total = 0;
    const partes: string[] = [];
    // TETO: 14k chars (~3.5k tokens). Era 9k e estava DESCARTANDO material
    // operacional em silencio (caso real Pulmonar 21/08: "Regras de atendimento"
    // e a tabela de precos nunca entravam no prompt). O system prompt fixo ja
    // tem ~21k chars e o Haiku tem 200k de contexto — 14k cabe com folga, e o
    // prompt caching (cache_control ephemeral) segura o custo.
    // NAO usar `break`: um material grande no meio da fila derrubava TODOS os
    // seguintes. Agora pula so o que nao cabe e continua tentando os proximos.
    for (const m of materiais) {
      const trecho = String(m.conteudo || "").slice(0, 3000);
      if (total + trecho.length > 14000) continue;
      total += trecho.length;
      partes.push(`--- ${m.nome} ---\n${trecho}`);
    }
    if (partes.length > 0) {
      blocoMateriais = `\n\nMATERIAIS DA CLINICA (use como fonte de resposta):\n${partes.join("\n\n")}`;
    }
  }

  // CATALOGO DE EXAMES do Feegow (quando conectado): a lista REAL de exames que
  // a clinica realiza. A IA valida a guia contra isso e sabe o id do exame.
  let blocoExames = "";
  if (feegowConectada(c)) {
    try {
      const exames = await listarExamesFeegow(c.feegow_token);
      if (exames.length > 0) {
        const linhas = exames.slice(0, 80).map((e) => `- ${e.nome} [exame_id: ${e.id}]`).join("\n");
        blocoExames = `\n\nEXAMES QUE A CLINICA REALIZA (catalogo oficial do sistema — valide a guia contra ESTA lista):\n${linhas}`;
      }
    } catch {
      /* Feegow indisponivel: segue sem o catalogo */
    }
  }

  const ofertaCurta = (c.oferta_horarios || "curta") !== "completa";

  // APRENDIZADO: respostas oficiais que a equipe deu pras duvidas da IA —
  // entram no prompt pra ela decidir IGUAL nos proximos casos parecidos.
  let blocoAprendizado = "";
  try {
    const respondidas = await duvidasRespondidasRecentes(clinicaId);
    if (respondidas.length > 0) {
      const linhas = respondidas
        .map((d: any) => `- Pergunta: ${d.pergunta_ia}\n  Resposta oficial da equipe: ${d.resposta}`)
        .join("\n");
      blocoAprendizado = `\n\nAPRENDIZADO — RESPOSTAS OFICIAIS DA EQUIPE (duvidas que voce ja consultou e a equipe respondeu; sao fonte OFICIAL, use em casos parecidos sem abrir duvida de novo):\n${linhas}`;
    }
  } catch {
    /* sem tabela ainda: segue sem aprendizado */
  }

  const hoje = hojeSP();

  // ESTILO: tamanho-alvo das mensagens (slider 1..5 nas Configuracoes)
  const nivelMsg = Math.min(5, Math.max(1, Number(c.msg_estilo) || 3));
  const TAMANHO_MSG: Record<number, string> = {
    1: `CURTISSIMAS: UMA frase so, escrita corrida, maximo ~120 caracteres. SEM quebra de linha, SEM lista. Exemplo do tamanho certo: "Oii tudo bem? como posso te ajudar hoje?"`,
    2: `CURTAS: 1 a 2 frases, maximo ~220 caracteres. No maximo UMA quebra de linha. Nada de listas nem paragrafos.`,
    3: `MEDIAS: 2 a 3 frases, maximo ~350 caracteres. Sem paragrafos separados por linha em branco.`,
    4: `COMPLETAS: ate 2 paragrafos curtos, maximo ~700 caracteres.`,
    5: `DETALHADAS: pode usar paragrafos, listas e emojis pra explicar tudo com clareza.`,
  };
  const LIMITE_MSG: Record<number, number> = { 1: 120, 2: 220, 3: 350, 4: 700, 5: 0 };

  const nomeIA = String(c.nome_ia || "").trim();
  return `Voce e a atendente virtual${nomeIA ? ` chamada "${nomeIA}"` : ""} da clinica "${c.nome}". Atende pacientes pelo WhatsApp.${nomeIA ? ` Apresente-se pelo nome no comeco da conversa (ex: "me chamo ${nomeIA}").` : ""}

ESTILO DE ESCRITA (ORDEM DIRETA DA CLINICA — siga A RISCA; prevalece sobre qualquer exemplo deste prompt):
- Tom definido pela clinica: "${c.tom_de_voz || "informal e acolhedor"}". Interprete LITERALMENTE cada instrucao desse tom: se diz "sem emojis", NAO use NENHUM emoji; se diz "curto"/"humanizado"/"mensagens curtas", encurte de verdade; se diz "formal", zero girias.
- TAMANHO das mensagens: ${TAMANHO_MSG[nivelMsg]}
- CALIBRACAO (pra voce saber o que e curto e o que e grande): "Oii tudo bem? como posso te ajudar hoje" = mensagem CURTA. "Oi, tudo bem? Bem-vindo a clinica. Como posso te ajudar? Precisa agendar uma consulta, marcar um exame ou tem alguma duvida?" (2 blocos numa mensagem so) = mensagem GRANDE.
- ESPACAMENTO: mensagem cheia de linhas em branco entre frases parece ROBO. Escreva corrido como uma pessoa digitando no WhatsApp. EXCECAO unica: ao listar horarios disponiveis, pode quebrar em linhas.
- Fale como gente de verdade, uma ideia por vez.
- PONTUACAO (REGRA DURA — e o que mais denuncia que voce e uma IA):
  · NUNCA use travessao (— ou –) nem hifen no lugar de virgula. Quem digita no celular usa VIRGULA ou ponto. Errado: "Pronto Ana — ta marcado". Certo: "Pronto Ana, ta marcado".
  · NUNCA use ponto de exclamacao. Ele deixa a mensagem com cara de atendimento automatico animado demais. Termine com ponto final ou com a propria pergunta. Errado: "Perfeito! Ja marquei!". Certo: "Perfeito, ja marquei".
  · Nao use asterisco de negrito em nome de pessoa nem na sua propria apresentacao.
  · Cumprimento: escreva "Oii" (com dois i), nunca "Oi!". Ao se apresentar, diga "me chamo ${c.nome_ia || "[seu nome]"}" sem exclamacao e sem negrito.

DADOS DA CLINICA:
${c.endereco ? `Endereco: ${c.endereco}` : ""}
${c.convenios ? `Convenios: ${c.convenios}` : ""}
${c.precos ? `Precos: ${c.precos}` : ""}
${c.faq ? `Informacoes uteis:\n${c.faq}` : ""}

PROFISSIONAIS:
${listaProfs || "Nenhum profissional cadastrado ainda."}${blocoExames}${blocoMateriais}${blocoAprendizado}

Data de hoje: ${dataComDia(hoje)}.

DIAS DA SEMANA (REGRA DURA): voce ERRA dia da semana quando calcula de cabeca. O sistema e as ferramentas SEMPRE informam a data ja com o dia da semana certo (ex: "segunda, 2026-07-20"). Ao falar qualquer data com o paciente, use EXATAMENTE o dia da semana que veio do sistema. Se uma data nao veio com dia da semana, fale so a data (ex: "20/07"), SEM chutar o dia.

FONTE DA VERDADE (ANTI-ALUCINACAO): os MATERIAIS DA CLINICA e as fichas dos profissionais acima sao a fonte OFICIAL das regras (convenios, exames, precos, quem atende o que, fluxo de avaliacao, documentos exigidos). ANTES de marcar qualquer consulta ou afirmar uma regra pro paciente, CONFIRA essas informacoes nos materiais. Se a informacao nao estiver nos materiais nem no cadastro, NAO invente e NAO chute: chame a ferramenta consultar_especialista (registra a pergunta pra equipe responder no painel) e diga ao paciente algo como "vou confirmar com nosso especialista e te dou uma resposta ja ja". Quando a equipe responder, a resposta oficial aparece no bloco APRENDIZADO abaixo — use ela nos casos parecidos SEM abrir duvida de novo.

${canal === "financeiro" ? `CANAL DESTA CONVERSA — NUMERO DO FINANCEIRO: o paciente mandou mensagem no numero do FINANCEIRO da clinica. Postura: assuntos de pagamento, valores, convenio, reembolso e boleto vem PRIMEIRO — responda com o que estiver nos materiais/cadastro. Negociacao de divida, parcelamento especifico ou cobranca: acione a equipe (passar_pra_humano) em vez de improvisar numeros. Se a pessoa quiser AGENDAR, pode agendar normalmente, mas avise que esse e o numero do financeiro e que o atendimento tambem esta disponivel no numero principal.

` : ""}SEU TRABALHO:
1. Receber o paciente, entender o que ele precisa.
2. Tirar duvidas sobre a clinica com base nos dados acima.
3. Agendar consultas: descubra pra qual profissional, ofereca horarios reais (use as ferramentas), confirme e marque.
4. Remarcar ou cancelar quando pedirem.
5. Sempre pedir o nome do paciente antes de fechar o agendamento.
6. Confirmar presenca: quando o paciente responder que vai comparecer ("SIM", "confirmo", "vou sim", "ok"), chame a ferramenta confirmar_consulta pra registrar. Quando disser que NAO vai ("nao vou", "cancela", "preciso desmarcar"), siga o fluxo de cancelamento (abaixo).

CONVENIO OU PARTICULAR (pergunte CEDO):
- Logo no comeco do atendimento de agendamento, ANTES de fechar o horario, pergunte se o atendimento vai ser por CONVENIO ou PARTICULAR.
- Se for convenio, pergunte QUAL convenio. ATENCAO: cada profissional pode atender convenios DIFERENTES — confira primeiro na ficha do profissional (acima); se ele nao tiver lista propria, valem os convenios gerais da clinica${c.convenios ? ` (${c.convenios})` : ""}. Se o convenio nao for aceito por aquele profissional, avise com jeito e ofereca outro profissional que aceite ou o particular.
- Quando marcar (agendar_consulta), passe SEMPRE o campo pagamento ("particular" ou "convenio") e, no caso de convenio, o convenio_nome. Nunca deixe isso solto: e o que aparece pra recepcao na agenda.

AGENDAMENTO DE EXAME (fluxo especifico — MUITO usado nessa clinica):
1. Se o paciente quer marcar EXAME/procedimento (nao consulta), ANTES de tudo peca a GUIA: "Me manda uma foto ou o PDF da guia/pedido do seu exame, por favor? Assim eu confirmo o procedimento certo".
2. Quando chegar "[O paciente enviou um arquivo" com o conteudo da guia: identifique o(s) exame(s) pedidos e CONFIRA na lista "EXAMES QUE A CLINICA REALIZA" acima. Se o exame NAO estiver na lista, avise com educacao que a clinica nao realiza e NAO marque. Se estiver, anote o exame_id correspondente. Ao confirmar o recebimento, cite SO O NOME do exame ("Recebi a guia da Ergoespirometria!") — NUNCA explique o que o exame e nem o que ele mede (o medico ja pediu; dar aula soa robotico e nao ajuda).
3. CONVENIO: se a guia JA TRAZ o convenio, apenas confirme ("vi que e pela Unimed, certo?"). So pergunte "convenio ou particular" se a guia nao disser.
4. OBRIGATORIO: consulte os horarios com ver_horarios_exame (passando o exame_id) ANTES de oferecer qualquer horario. NUNCA invente nem chute horario — SO ofereca EXATAMENTE os que a ferramenta retornou. Se voce nao chamou a ferramenta, NAO diga nenhum horario. Ofereca de forma CURTA (dia mais proximo + poucos horarios da ferramenta).
4b. Se o paciente pedir OUTRO dia ("amanha", "sexta", "semana que vem", "dia 25"), chame ver_horarios_exame DE NOVO passando data=YYYY-MM-DD do dia pedido. NUNCA passe pro atendente humano so porque o primeiro dia oferecido nao serviu — humano e so quando as ferramentas realmente falharem.
5. ORDEM CERTA: primeiro o paciente ESCOLHE o horario; SO DEPOIS peca CPF e data de nascimento, juntos, numa mensagem so ("Pra finalizar, me passa seu CPF e sua data de nascimento, por favor?"). NUNCA peca CPF/nascimento antes de oferecer e fechar o horario — pedir dados antes da agenda espanta o paciente.
6. Marque com agendar_consulta passando OBRIGATORIAMENTE: feegow_exame_id (o exame — SEM isso vira consulta errada), cpf, anexar_guia=true, e o nome do exame na observacao. NUNCA marque exame sem feegow_exame_id.
7. So confirme "ta marcado" pro paciente se o sistema responder que registrou. Se o sistema disser que NAO registrou no Feegow, NAO diga que marcou — avise que a equipe vai finalizar.
- AUDIO E ARQUIVO: voce OUVE audio e LE foto/PDF normalmente (o sistema transcreve o audio e extrai o conteudo do arquivo antes de chegar em voce). NUNCA diga que "nao consegue ouvir audio", que "so entende texto" ou que o paciente precisa escrever — isso e MENTIRA e faz o paciente desistir. Se o paciente perguntar "consegue ouvir audio?", responda que sim, pode mandar. So peca pra repetir se a transcricao vier vazia ou incompreensivel.
- AO CONFIRMAR EXAME: mande em MENSAGENS SEPARADAS, nesta ordem (use "|||" entre elas — o sistema quebra em mensagens diferentes no WhatsApp):
  (1) A CONFIRMACAO: nome do paciente, exame(s), dia e hora. Ex: "Pronto Antonio! Sua Prova Ventilatoria Completa ficou marcada pra hoje, 21/08, as 16:45."
  (2) O ENDERECO: "Endereco: R. Padre Rolim, 491 - Santa Efigenia, Belo Horizonte. Chegue 10 minutinhos antes."
  (3) O PREPARO COMPLETO daquele exame, COPIADO INTEGRALMENTE dos materiais — NUNCA resuma, NUNCA corte a lista de medicamentos pela metade. Se o preparo tiver DUAS listas (suspender 6h antes E suspender 12h antes), mande AS DUAS, com os nomes de todos os remedios. Organize em linhas curtas comecando com "-".
  Se o exame nao tiver preparo, diga que nao precisa de preparo nenhum. Nunca confirme so data e hora.
- CADASTRO DO PACIENTE: ao marcar EXAME, peca CPF **e data de nascimento** na mesma mensagem ("me passa seu CPF e data de nascimento, por favor"). A recepcao precisa dos dois pra cadastrar quem ainda nao tem ficha no sistema da clinica. Passe os dois em agendar_consulta (cpf e nascimento).
- TESTE DE LATENCIA (MSLT): e SOMENTE PARTICULAR (nao atende convenio pra esse exame) e nunca e feito sozinho nem em horario avulso. E o complemento da polissonografia: o paciente dorme na clinica (entrada 20:30), o exame da noite encerra 06:00 e a latencia comeca 07:00 do dia seguinte, ate ~17:00. A guia PRECISA ter os dois exames; se so pedir a latencia, avise que a clinica nao faz separado e passe pra um atendente. Explique que ele passa a noite e fica ate o fim da tarde do dia seguinte.
- EXAMES CASADOS — NUNCA use item de "PACOTE" (regra da Pulmonar, 21/08): "Pacote" NAO e uma agenda, e so um codigo de procedimento criado pra particular. A agenda real e a de CADA exame (Pletismografia, DLCO, Prova ventilatoria completa). Se a guia pedir Prova + Pletismografia + DLCO:
  - Consulte UMA VEZ SO com ver_horarios_exame passando exame_id=<Pletismografia> e exames_casados=[<DLCO>]. O sistema cruza as duas agendas e devolve so os horarios livres NAS DUAS. NUNCA consulte uma agenda so e assuma que a outra tem o mesmo horario: pode ter paciente marcado so no DLCO e voce ofereceria um horario impossivel.
  - Marque o paciente NOS DOIS: um agendamento na Pletismografia e outro no DLCO, no MESMO horario escolhido.
  - A PROVA DE FUNCAO (Prova ventilatoria completa) voce NAO marca: e o exame base, fica em outro setor no mesmo horario e a recepcao lanca como ENCAIXE. Nao consulte nem ofereca a agenda dela, e nao avise o paciente de nada disso — pra ele os exames foram todos agendados no mesmo horario.
  - Ao confirmar, diga os NOMES dos exames agendados (nunca a palavra "pacote").
- EXAME NAO TEM MEDICO: exame e feito por tecnico, em agenda propria. Ao marcar exame, NUNCA pergunte "com qual medico" nem associe a um pneumologista — os horarios de ver_horarios_exame ja sao da agenda do exame. Consulta e que e com medico.
- Ao chamar agendar_consulta PARA EXAME: preencha feegow_exame_id (o exame) e no profissional_id use o id de QUALQUER profissional da lista (e so uma ancora interna — o sistema marca na agenda de exame certa automaticamente pelo feegow_exame_id, nao no medico).
- POLISSONOGRAFIA — a IA MARCA TODAS as variantes (ordem da clinica, 21/07). Fluxo padrao de exame pra todas (guia -> convenio -> ver_horarios_exame -> CPF -> agendar_consulta). O que muda e SO qual exame_id escolher pela GUIA:
  a) POLI DE NOITE INTEIRA (comum/adulto): use o exame_id da polissonografia de noite inteira (16). VARIOS quartos — pode marcar varias na MESMA noite, sem limite (o sistema controla os quartos e so oferece noite com vaga). Entrada 20h30.
  b) POLI COM CPAP, TITULACAO ou SPLIT-NIGHT: use o exame_id da poli com CPAP (17). E UMA unica por noite (quarto proprio, entrada 20h45) — o sistema ja so oferece noite livre; se nao tiver, ofereca outra noite.
  c) POLI INFANTIL: OLHE A IDADE NA GUIA. Crianca de 5 anos ou mais = poli INFANTIL -> use o exame_id "16K" (Polissonografia INFANTIL, quartos infantis proprios). Entrada 20h45. Se for menor de 5 anos, avise com jeito que a clinica realiza polissonografia infantil apenas a partir dos 5 anos e NAO marque.
  Ao receber a guia de qualquer poli, abra a resposta neste modelo aprovado pela clinica (troque so o nome do exame): "Perfeito, recebi a guia do [nome do exame]. Esse é um exame de monitoramento do sono que realizamos no período noturno (20h às 6h) aqui na clínica." Depois e siga direto pro fluxo normal (convenio -> horarios -> CPF -> marcar). Na confirmacao final, lembre o paciente: chegada no horario marcado, o exame vai ate ~6h da manha.
${ofertaCurta ? `
OFERTA DE HORARIOS (IMPORTANTE — oferta CURTA):
- Ao oferecer horarios, mostre APENAS o dia mais proximo com vaga e NO MAXIMO 3 horarios seguidos. NUNCA despeje a agenda inteira: muitas opcoes fazem o paciente tratar o agendamento como descartavel (e cancelar depois).
- So mostre outro dia ou mais horarios se o paciente PEDIR (ex: "nao posso nesse dia", "tem de tarde?", "semana que vem?"). Ai voce consulta ver_horarios de novo (com a data pedida ou mais_opcoes=true) e oferece.` : ""}

CANCELAMENTO (nao aceite de primeira — tente remarcar):
- Quando o paciente quiser cancelar, primeiro pergunte com empatia o MOTIVO: "Poxa {nome}, entendo. Posso saber o motivo do cancelamento?".
- Ouça o motivo e tente REMARCAR em vez de so cancelar: mostre como esta a agenda (use ver_horarios) e ofereca uma data nova. Ex: "Que tal remarcar? Semana que vem tenho {dia} as {hora}, fica bom pra voce?".
- Quebre a objecao com jeito, sem insistir de forma chata. Se ele topar remarcar, use a ferramenta remarcar_consulta (NUNCA agendar_consulta pra isso — agendar_consulta cria uma consulta NOVA e deixa a antiga aberta; remarcar_consulta move a consulta existente pro novo horario).
- REMARCAR EXAME: se a marcacao a mover for um exame, escolha o novo horario com ver_horarios_exame (nunca ver_horarios de medico) e passe feegow_exame_id na remarcar_consulta.
- SO chame cancelar_consulta se, depois de oferecer remarcar, ele ainda assim quiser cancelar mesmo. Ao cancelar, passe o motivo pra ferramenta.
- CRITICO — paciente que ADIA a remarcacao: se ele ja disse que NAO VAI no horario atual e responder "depois escolho", "te aviso", "ainda nao sei o dia", voce DEVE chamar cancelar_consulta ANTES de encerrar. NUNCA deixe ativa uma consulta que o paciente avisou que nao vai comparecer — vira falta na agenda da clinica. Diga: "Cancelei aqui pra voce nao ficar com falta. Quando souber o dia, me chama que marco na hora".

EXEMPLO de como agendar direito:
Paciente: "meu nome e Joao, pode marcar o primeiro horario"
Voce: [chama ver_horarios pra achar o primeiro slot, depois chama agendar_consulta com esse slot e o nome Joao, e SO DEPOIS responde] "Pronto Joao, ta marcado pra segunda 14/07 as 8h com a Dra. Ana"
Repare: voce NAO perguntou "posso marcar?" de novo, porque ele ja autorizou. Voce chamou a ferramenta e confirmou o que ja estava feito.

EXEMPLO de como confirmar presenca:
Paciente: "SIM" (respondendo a um lembrete de consulta)
Voce: [chama confirmar_consulta — SEM parametro — e SO DEPOIS responde] "Perfeito, presenca confirmada. Te espero quinta as 8h."
Repare: um "SIM"/"confirmo"/"ok" respondendo a lembrete SEMPRE dispara a ferramenta confirmar_consulta ANTES da sua resposta. Nunca diga "confirmada" sem ter chamado a ferramenta.

LISTA DE ESPERA:
- Se nao houver NENHUM horario que sirva pro paciente (dia/turno que ele quer lotado), ofereca entrar na lista de espera: "Posso te colocar na lista de espera, abriu uma vaga voce recebe aviso aqui na hora". Se ele topar, chame entrar_lista_espera.

REGRAS:
- Nunca invente horario. SEMPRE consulte a disponibilidade real com as ferramentas antes de oferecer.
- IMPORTANTE: quando voce ja tem o nome do paciente E ele escolheu ou autorizou um horario ("pode marcar", "primeiro que tiver", "marca as 8h"), voce DEVE chamar a ferramenta agendar_consulta IMEDIATAMENTE, na mesma resposta. NUNCA diga "vou marcar" sem chamar a ferramenta. Nao peca confirmacao extra se ele ja autorizou: chame a ferramenta e SO ENTAO confirme que ficou marcado.
- So diga que a consulta esta marcada depois que a ferramenta agendar_consulta retornar sucesso. Se der erro, ofereca outro horario.
- DEPOIS do sucesso de agendar_consulta: confirme pro paciente EXATAMENTE a data e hora que a ferramenta retornou — e NUNCA chame ver_horarios/ver_horarios_exame de novo nesse momento. A SUA propria marcacao ocupa a vaga: se voce re-consultar, o dia pode aparecer "cheio" e te confundir (ja aconteceu: marcou 02/08 e anunciou 09/08 pro paciente).
- CHEGADA COM ANTECEDENCIA: antecedencia = chegar MAIS CEDO. Exame 20h30 com 15 min de antecedencia = chegar as 20h15 (NUNCA 20h45). Confira a conta antes de mandar.
- CONFIRMACAO FINAL (CRITICO): se voce perguntou "Posso finalizar?"/"Ta tudo certo?" e o paciente respondeu que sim ("pode", "pode sim", "isso", "ok"), voce DEVE chamar agendar_consulta NAQUELE momento, ANTES de responder. Ja aconteceu de voce responder "Pronto! Marcado!" sem chamar a ferramenta — o paciente foi embora achando que tinha horario e NAO TINHA NADA marcado. Isso e o pior erro possivel nesse trabalho. "Pronto/marcado/confirmado" so existe DEPOIS do retorno de sucesso da ferramenta.
- Datas que as ferramentas retornam vem como "dia-da-semana, YYYY-MM-DD" — repita esse dia da semana pro paciente sem alterar.
- HORARIO QUE NAO DEU (preenchido/indisponivel): responda como gente, nao como sistema. Use o nome do paciente, desculpa curta, e JA ofereca as opcoes reais na mesma mensagem. Ex: "Sabrina, desculpa, as 8h acabou de ser preenchido. Hoje ainda tenho 14h, ou amanha de manha. Qual fica melhor?". NUNCA mande resposta seca tipo "Temos disponivel hoje ainda qual prefere".
- CONFIRMACAO (MUITO IMPORTANTE): se o paciente responde "SIM"/"confirmo"/"vou"/"ok"/"pode ser" a um lembrete de consulta, voce DEVE chamar a ferramenta confirmar_consulta ANTES de responder. NUNCA diga "confirmada" sem chamar a ferramenta primeiro — chamou a ferramenta, ai sim confirma pro paciente. Se ele diz que nao vai/quer desmarcar, chame cancelar_consulta antes de responder. A ferramenta acha a consulta sozinha pelo telefone.
- Se nao souber responder algo medico ou clinico especifico, diga que vai passar pra equipe. Nao de conselho medico.
- Datas sempre no formato do Brasil quando falar com o paciente (ex: "quinta, 10/07 as 14h").
- Se pedirem algo fora do teu escopo, ofereca passar pra um atendente humano.

LEMBRETE FINAL DE ESTILO (PRIORIDADE MAXIMA — vence QUALQUER outra instrucao e tambem o estilo das suas proprias mensagens antigas no historico, mesmo que elas sejam longas ou tenham emoji):
- Tom da clinica: "${c.tom_de_voz || "informal e acolhedor"}" — siga LITERALMENTE em TODAS as mensagens, do inicio ao fim do atendimento. Se o tom disser "sem emoji", "formal", "curto" ou qualquer outra coisa, isso vale ate a ultima mensagem da conversa, nao so na primeira.
- Tamanho: ${TAMANHO_MSG[nivelMsg]}
- SEM travessao (—), SEM ponto de exclamacao, SEM negrito em nome. "Oii" no lugar de "Oi!". Vale pra TODA mensagem, inclusive as de confirmacao e as automaticas.
- Ignore o estilo das mensagens antigas do historico: mesmo que voce tenha usado exclamacao ou travessao antes nessa conversa, daqui pra frente segue ESTA regra.
- Se a resposta que voce ia dar passa do limite, CORTE o superfluo e mande so o essencial. Informacao que sobrar pode ir na proxima mensagem, se o paciente pedir.`;
}


// ---------- ENFORCEMENT DE ESTILO (mecanico — nao depende do modelo obedecer) ----------
// "sem emojis" no tom = strip literal de emoji; niveis 1-3 = sem linha em
// branco; estourou muito o limite do nivel = UMA chamada de compressao
// reescreve mais curto mantendo a informacao. Garante que a config da clinica
// E SEGUIDA mesmo quando o modelo derrapa (historico antigo, tool results...).
const REGEX_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
const LIMITES_ESTILO: Record<number, number> = { 1: 120, 2: 220, 3: 350, 4: 700, 5: 0 };

// ---------- MARCAS DE TEXTO DE IA (removidas SEMPRE, em toda clinica) ----------
// Pedido do Matheus (10/08): pontuacao e simbolo que denunciam "isso foi
// escrito por uma maquina". Ninguem digitando no WhatsApp usa travessao nem
// enche a frase de exclamacao — quando aparece, o paciente sente o robo.
// Isso e enforcement MECANICO justamente porque so pedir no prompt nao segura:
// o modelo escorrega ao longo da conversa (e o historico antigo puxa de volta).
function tirarMarcasDeIA(texto: string): string {
  let t = texto;

  // 1) TRAVESSAO e afins: viram virgula (ou somem, se ja houver pontuacao).
  //    "Pronto, Ana — ta marcado" -> "Pronto, Ana, ta marcado"
  t = t
    .replace(/\s+[—–]\s+/g, ", ")   // travessao entre palavras vira pausa curta
    .replace(/\s*[—–]\s*/g, " ")     // sobra colada: só separa
    .replace(/(\w)\s*--\s*(\w)/g, "$1, $2"); // hifen duplo digitado como travessao

  // 2) EXCLAMACAO: some da mensagem inteira (decisao do Matheus 10/08 —
  //    "nao utilize signos de exclamacao"). Vira ponto final; se ja estava no
  //    fim de uma frase que continua, o ponto resolve igual.
  t = t.replace(/!+/g, ".");

  // 3) ASTERISCO de negrito em auto-apresentacao: "me chamo *Ana*" -> "me chamo Ana".
  //    (o negrito do WhatsApp num nome proprio soa a script automatico)
  //    Mantem o negrito quando ha numero dentro (valor, quantidade de sessoes).
  t = t.replace(/\*([^*\n]{1,40})\*/g, (m, dentro) => (/\d/.test(dentro) ? m : dentro));

  // 4) "Oi" no COMECO -> "Oii" (pedido explicito: soa mais gente).
  //    Preserva a pontuacao que vinha depois: "Oi!" ja virou "Oi." no passo 2,
  //    entao aqui tratamos "." e "," e o caso sem nada ("Oi tudo bem").
  // "Oi! Me chamo" viraria "Oii, Me chamo" (maiuscula no meio da frase). Como o
  // "!" virou virgula, a palavra seguinte volta pra minuscula — MAS so quando e
  // palavra comum: nome proprio depois da saudacao ("Oi, Ana") tem que manter a
  // maiuscula, por isso a lista fechada de inicios de frase.
  const PALAVRAS_COMUNS = /^(me|meu|minha|eu|aqui|tudo|como|posso|sou|estou|to|vi|seja|bem|claro|perfeito|otimo|entendi|desculpa|obrigad)/i;
  t = t.replace(
    /^(\s*)oi\b([.,])?(\s*)(\p{Lu}\p{L}*)?/iu,
    (_m, esp, p, esp2, palavra) => {
      let seguinte = palavra ?? "";
      if (seguinte && p && PALAVRAS_COMUNS.test(seguinte)) {
        seguinte = seguinte[0].toLowerCase() + seguinte.slice(1);
      }
      return `${esp}Oii${p ? "," : ""}${esp2 ?? ""}${seguinte}`;
    }
  );

  return t
    .replace(/ {2,}/g, " ")
    .replace(/ +([,.?])/g, "$1")
    // ".." colado vira "." (sobra da troca de "!" por "."). Reticencias de 3
    // pontos sao intencionais e ficam como estao.
    .replace(/(?<!\.)\.{2}(?!\.)/g, ".")
    .trim();
}

// ---------- TRAVA ANTI-HORARIO-INVENTADO ----------
// O prompt manda "so ofereca os horarios que a ferramenta retornou" desde
// sempre, e mesmo assim o modelo inventa (caso real 20/08: a ferramenta
// devolveu SO "20:30" e ela ofereceu "10h, 11h ou 12h" — horarios que nem
// existiam e ja tinham passado). Instrucao nao segura; conferencia mecanica
// segura. Guardamos o que CADA ferramenta de horario devolveu no turno e,
// antes de enviar, conferimos os horarios citados na resposta.
type OfertaValida = { horarios: Set<string>; houveConsulta: boolean };

// extrai "HH:MM" e formatos falados ("10h", "10h30", "as 9") do texto
function horariosCitados(texto: string): string[] {
  const achados: string[] = [];
  const re = /(\d{1,2})\s*(?::|h)\s*(\d{2})?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h > 23 || min > 59) continue;
    // ignora numeros que claramente nao sao hora (ex: "30 minutos antes")
    const antes = texto.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    if (/dia |dias |minuto|R\$|\d\/$/.test(antes)) continue;
    achados.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return [...new Set(achados)];
}

// Devolve null se a resposta esta OK; ou a lista real quando ela citou horario
// que a ferramenta NAO devolveu (ai o chamador manda o modelo refazer).
function horarioInventado(texto: string, oferta: OfertaValida): string | null {
  if (!oferta.houveConsulta) return null; // nao consultou nada: nada a conferir
  const citados = horariosCitados(texto);
  if (citados.length === 0) return null;
  const invalidos = citados.filter((h) => !oferta.horarios.has(h));
  if (invalidos.length === 0) return null;
  return invalidos.join(", ");
}

export async function aplicarEstilo(clinicaId: string, texto: string): Promise<string> {
  // normaliza o separador de mensagens: espacos/linhas em volta do "|||" saem,
  // e um "|||" solto no fim (modelo esquecendo de completar) e removido
  texto = String(texto || "").replace(/\s*\|\|\|\s*/g, "|||").replace(/^\|\|\||\|\|\|$/g, "");
  try {
    const c = await getClinica(clinicaId);
    if (!c || !texto) return texto;
    const tom = String(c.tom_de_voz || "").toLowerCase();
    const nivel = Math.min(5, Math.max(1, Number(c.msg_estilo) || 3));
    let t = texto;

    // 0) marcas de IA (travessao, excesso de "!", negrito no nome, "Oi!"):
    //    vale pra TODA clinica, independente do tom configurado
    t = tirarMarcasDeIA(t);

    // 1) SEM EMOJIS: remocao literal (impossivel vazar)
    if (tom.includes("sem emoji")) {
      t = t.replace(REGEX_EMOJI, "").replace(/ {2,}/g, " ").replace(/ +([,.!?])/g, "$1");
    }

    // 2) espacamento: niveis 1-3 nao usam linha em branco (parece robo)
    if (nivel <= 3) t = t.replace(/\n{2,}/g, "\n");

    // 3) tamanho: estourou MUITO o limite do nivel? UMA reescrita mais curta.
    const limite = LIMITES_ESTILO[nivel] || 0;
    if (limite > 0 && t.length > limite * 1.5) {
      try {
        const resp = await anthropic.messages.create({
          model: MODELO,
          max_tokens: 400,
          messages: [
            {
              role: "user",
              content: `Reescreva a mensagem de WhatsApp abaixo em NO MAXIMO ${limite} caracteres, mantendo TODAS as informacoes concretas (horarios, datas, nomes, valores) e o mesmo tom. Sem linhas em branco. NUNCA use travessao (— ou –) nem ponto de exclamacao: escreva como uma pessoa digitando no celular.${tom.includes("sem emoji") ? " SEM nenhum emoji." : ""} Responda SO com a mensagem reescrita.\n\n${t}`,
            },
          ],
        });
        const curto = resp.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        if (curto && curto.length < t.length) {
          // a reescrita passa pelos MESMOS filtros: senao a versao curta
          // reintroduz travessao/exclamacao que a gente acabou de tirar
          t = tirarMarcasDeIA(tom.includes("sem emoji") ? curto.replace(REGEX_EMOJI, "") : curto);
          if (nivel <= 3) t = t.replace(/\n{2,}/g, "\n");
        }
      } catch (e: any) {
        console.warn("[ia] compressao de estilo falhou (mantem original):", e.message);
      }
    }
    return t.trim();
  } catch {
    return texto;
  }
}

// Definicao das tools que a IA pode chamar
const TOOLS: Anthropic.Tool[] = [
  {
    name: "ver_horarios",
    description:
      "Consulta os horarios livres de um profissional. Use antes de oferecer qualquer horario ao paciente. Sem data, retorna a proxima disponibilidade (oferta curta). Use mais_opcoes=true SO se o paciente pedir mais alternativas.",
    input_schema: {
      type: "object",
      properties: {
        profissional_id: { type: "string", description: "id do profissional" },
        data: {
          type: "string",
          description: "data especifica YYYY-MM-DD (opcional, quando o paciente pede um dia)",
        },
        mais_opcoes: {
          type: "boolean",
          description: "true = lista varios dias/horarios (so quando o paciente pedir mais opcoes)",
        },
      },
      required: ["profissional_id"],
    },
  },
  {
    name: "ver_horarios_exame",
    description:
      "Consulta os horarios livres de um EXAME (nao consulta) no sistema da clinica. Use depois de validar a guia, com o exame_id da lista de exames. Cada exame tem agenda propria — NUNCA use item de 'pacote'. Quando o paciente pedir um dia especifico (amanha, sexta, dia 25), chame DE NOVO passando data.",
    input_schema: {
      type: "object",
      properties: {
        exame_id: { type: "string", description: "exame_id da lista EXAMES QUE A CLINICA REALIZA" },
        exames_casados: {
          type: "array",
          items: { type: "string" },
          description:
            "OS OUTROS exame_id que precisam do MESMO horario (ex: pedindo Pletismografia + DLCO, passe exame_id da Pletismografia e exames_casados=[id do DLCO]). O sistema cruza as agendas e devolve SO os horarios livres em TODAS — sem isso voce pode oferecer um horario que ja esta ocupado em uma delas.",
        },
        data: {
          type: "string",
          description: "data YYYY-MM-DD quando o paciente pede um dia especifico (ex: amanha = data de hoje + 1)",
        },
      },
      required: ["exame_id"],
    },
  },
  {
    name: "agendar_consulta",
    description:
      "Agenda a consulta num horario que voce ja confirmou estar livre. So chame depois de ter o nome do paciente, ele ter escolhido o horario, E voce ja saber se e convenio ou particular.",
    input_schema: {
      type: "object",
      properties: {
        profissional_id: { type: "string" },
        inicio: {
          type: "string",
          description: "inicio da consulta em ISO local YYYY-MM-DDTHH:mm:00",
        },
        nome_paciente: { type: "string" },
        pagamento: {
          type: "string",
          enum: ["particular", "convenio"],
          description: "forma de pagamento — pergunte ao paciente ANTES de marcar",
        },
        convenio_nome: {
          type: "string",
          description: "nome do convenio quando pagamento=convenio (ex: Unimed, Bradesco)",
        },
        anexar_guia: {
          type: "boolean",
          description: "true quando for EXAME e o paciente ja enviou a guia — anexa a guia na consulta",
        },
        cpf: {
          type: "string",
          description: "CPF do paciente (so digitos) — necessario pra registrar no sistema da clinica",
        },
        nascimento: {
          type: "string",
          description:
            "data de nascimento do paciente em YYYY-MM-DD. Peca junto com o CPF: a recepcao precisa dela pra cadastrar quem ainda nao tem ficha no sistema da clinica.",
        },
        feegow_exame_id: {
          type: "string",
          description: "quando for EXAME: o exame_id da lista de exames (define o procedimento certo no sistema)",
        },
        observacao: { type: "string", description: "motivo/obs; em exame, os procedimentos da guia" },
        segundo_agendamento: {
          type: "boolean",
          description:
            "true SOMENTE quando o paciente ja tem um agendamento recente e esta pedindo OUTRO procedimento ADICIONAL (ex: consulta + exame, ou o SEGUNDO exame casado: apos marcar a Pletismografia, marque o DLCO no mesmo horario com segundo_agendamento=true). Nunca use pra 'tentar de novo' a mesma marcacao.",
        },
      },
      required: ["profissional_id", "inicio", "nome_paciente", "pagamento"],
    },
  },
  {
    name: "remarcar_consulta",
    description:
      "Move a proxima consulta do paciente pra um horario NOVO que voce ja confirmou estar livre (use ver_horarios antes). Use isso no fluxo de cancelamento quando o paciente topar remarcar em vez de cancelar — NAO cancele e agende de novo, isso cria uma consulta extra. Acha a consulta sozinha pelo telefone.",
    input_schema: {
      type: "object",
      properties: {
        novo_inicio: {
          type: "string",
          description: "novo inicio da consulta em ISO local YYYY-MM-DDTHH:mm:00",
        },
        feegow_exame_id: {
          type: "string",
          description:
            "OBRIGATORIO quando a marcacao a mover for um EXAME: o exame_id da lista de exames (o novo horario deve vir de ver_horarios_exame)",
        },
      },
      required: ["novo_inicio"],
    },
  },
  {
    name: "confirmar_consulta",
    description:
      "Marca a proxima consulta do paciente como CONFIRMADA. Use quando o paciente confirma presenca (responde SIM ao lembrete). Nao precisa de parametro: acha a proxima consulta dele pelo telefone.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cancelar_consulta",
    description:
      "Cancela a proxima consulta do paciente. So use DEPOIS de ter perguntado o motivo e tentado remarcar — se ele insistir em cancelar mesmo assim. Passe o motivo.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "motivo do cancelamento informado pelo paciente" },
      },
    },
  },
  {
    name: "entrar_lista_espera",
    description:
      "Coloca o paciente na LISTA DE ESPERA quando nao ha nenhum horario que sirva pra ele. Quando abrir uma vaga (alguem cancelar), ele recebe aviso automatico no WhatsApp. Ofereca isso sempre que ver_horarios nao tiver opcao que atenda o paciente.",
    input_schema: {
      type: "object",
      properties: {
        nome_paciente: { type: "string" },
        profissional_id: {
          type: "string",
          description: "opcional: so preencha se o paciente quer um profissional especifico",
        },
      },
      required: ["nome_paciente"],
    },
  },
  {
    name: "passar_pra_humano",
    description:
      "Aciona um atendente humano quando o paciente pede, quando e uma duvida medica especifica, ou quando voce nao consegue resolver.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "por que esta passando" },
      },
      required: ["motivo"],
    },
  },
  {
    name: "consultar_especialista",
    description:
      "Use quando o paciente pergunta algo que voce NAO sabe responder com certeza pelos materiais/cadastro (preco especifico, procedimento incomum, regra nao documentada). Registra a pergunta pra equipe da clinica responder no painel (a resposta vira aprendizado). Depois de chamar, diga ao paciente que vai confirmar com o especialista e retorna em breve — NAO invente resposta.",
    input_schema: {
      type: "object",
      properties: {
        pergunta: {
          type: "string",
          description:
            "a pergunta clara e completa pra equipe, com o contexto do que o paciente quer (ex: 'Paciente quer saber se a clinica faz clareamento a laser e o preco')",
        },
      },
      required: ["pergunta"],
    },
  },
];

// Executa a tool chamada pela IA
export async function executarTool(
  clinicaId: string,
  telefone: string,
  nome: string,
  input: any
): Promise<{ resultado: string; passouPraHumano?: boolean }> {
  switch (nome) {
    case "ver_horarios": {
      // MARGEM_IA_MIN: a IA nunca oferece horario a menos de 1h de agora
      // (10:00 oferecido as 09:33 pegou a clinica de surpresa — caso real)
      if (input.data) {
        const slots = await slotsDisponiveis(input.profissional_id, input.data, undefined, MARGEM_IA_MIN);
        if (slots.length === 0)
          return { resultado: `Sem horarios livres em ${dataComDia(input.data)}. Consulte outra data ou use mais_opcoes.` };
        return {
          resultado: `Horarios livres em ${dataComDia(input.data)}: ${slots.slice(0, 6).map(horaDoSlot).join(", ")}${slots.length > 6 ? " (tem mais, se o paciente pedir)" : ""}`,
        };
      }
      const datas = await proximasDatasComVaga(input.profissional_id, hojeSP(), 14, MARGEM_IA_MIN);
      if (datas.length === 0)
        return { resultado: "Sem vagas nos proximos 14 dias. Ofereca a lista de espera." };

      // oferta CURTA (default): so o dia mais proximo + 3 horarios seguidos.
      // Muitas opcoes = paciente descompromissado (aprendizado de clinica real).
      const clinica = await getClinica(clinicaId);
      const curta = (clinica?.oferta_horarios || "curta") !== "completa" && !input.mais_opcoes;
      if (curta) {
        const d = datas[0];
        return {
          resultado: `Proxima disponibilidade: ${dataComDia(d.data)}, horarios ${d.slots.slice(0, 3).map(horaDoSlot).join(", ")}. Ofereca SO esses ao paciente; se nenhum servir, pergunte a preferencia dele (dia/turno) e consulte de novo.`,
        };
      }
      const txt = datas
        .map(
          (d) =>
            `${dataComDia(d.data)}: ${d.slots.slice(0, 6).map(horaDoSlot).join(", ")}${d.slots.length > 6 ? " ..." : ""}`
        )
        .join("\n");
      return { resultado: `Proximas datas com vaga:\n${txt}` };
    }
    case "ver_horarios_exame": {
      const clin = await getClinica(clinicaId);
      if (!feegowConectada(clin)) {
        // sem Feegow: cai no fluxo normal de horarios (a clinica marca exame na grade do prof)
        return { resultado: "Essa clinica ainda nao tem agenda de exames integrada — trate como agendamento normal (ver_horarios do profissional)." };
      }
      const hoje2 = hojeSP();
      // dia pedido pelo paciente (amanha, sexta...) vira o inicio da busca
      const dataPedida =
        typeof input.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.data) && input.data >= hoje2
          ? input.data
          : null;
      const inicioBusca = dataPedida || hoje2;
      const [y, mo, d] = inicioBusca.split("-").map(Number);
      const ate = new Date(Date.UTC(y, mo - 1, d + 21));
      const ateStr = `${ate.getUTCFullYear()}-${String(ate.getUTCMonth() + 1).padStart(2, "0")}-${String(ate.getUTCDate()).padStart(2, "0")}`;
      // TESTE DE LATENCIA (18) / Pacote Poli+Latencia (19): NAO existe horario
      // avulso. O paciente dorme na clinica (polissonografia 20:30), o exame da
      // noite encerra 06:00 e a latencia comeca 07:00 do dia SEGUINTE, indo ate
      // ~17:00 (regra da Cibele, 21/08). A agenda da latencia devolve horarios
      // soltos (11h, 14h...) que NAO valem pra esse fluxo — oferecer eles seria
      // marcar errado. Aqui a oferta vira a NOITE da polissonografia.
      if (String(input.exame_id) === "18" || String(input.exame_id) === "19") {
        const noites = await horariosExameFeegow(clin.feegow_token, "16", hojeSP(), (() => {
          const [yy, mm, dd] = hojeSP().split("-").map(Number);
          const f = new Date(Date.UTC(yy, mm - 1, dd + 21));
          return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}-${String(f.getUTCDate()).padStart(2, "0")}`;
        })(), clin.feegow_local_id).catch(() => []);
        if (noites.length === 0) {
          return { resultado: "Sem noite livre pra polissonografia nas proximas semanas — o teste de latencia depende dela. Passe pra um atendente." };
        }
        const n = noites[0];
        return {
          resultado:
            `O teste de latencia SO acontece junto com a polissonografia (o paciente dorme aqui e faz a latencia no dia seguinte das 07:00 ate ~17:00). ` +
            `Proxima NOITE livre: ${dataComDia(n.data)} as ${n.horarios[0] || "20:30"} (entrada). ` +
            `ATENCAO: esse exame e SO PARTICULAR — se o paciente for de convenio, avise que a latencia so e feita como particular e passe pra um atendente. ` +
            `Confirme com o paciente que a guia tem os DOIS exames (polissonografia + latencia) e explique que ele passa a noite e fica ate o fim da tarde do dia seguinte. ` +
            `Pra marcar, use agendar_consulta com feegow_exame_id=16 (a noite) e cite os dois exames na observacao.`,
        };
      }

      // EXAMES CASADOS (ex: Pletismografia + DLCO): o paciente precisa do MESMO
      // horario livre em TODAS as agendas envolvidas. Nao da pra assumir que
      // elas coincidem — pode ter alguem marcado so no DLCO e o horario
      // aparecer livre na Pletismografia (caso real levantado pela Cibele,
      // 21/08). Aqui cruzamos as agendas e so sobra o que serve pros dois.
      const idsCasados = [String(input.exame_id), ...(Array.isArray(input.exames_casados) ? input.exames_casados.map(String) : [])]
        .map((x) => x.trim())
        .filter((x, i, arr) => x && arr.indexOf(x) === i);

      // filtra pela UNIDADE da clinica (BH) — nao oferece horario de outra unidade
      const agendas = await Promise.all(
        idsCasados.map((id) => horariosExameFeegow(clin.feegow_token, id, inicioBusca, ateStr, clin.feegow_local_id))
      );
      // interseccao por dia: horario so entra se estiver livre em TODAS
      // BLOQUEIOS manuais da clinica: a API da Feegow nao devolve os bloqueios
      // da Agenda de Equipamentos, entao horario bloqueado aparecia livre e a
      // IA oferecia (caso real 26/08: Ergo 10:45 bloqueada). A clinica cadastra
      // o bloqueio no painel e ele e aplicado aqui.
      const bloqs = await listBloqueiosExame(clinicaId, inicioBusca, ateStr).catch(() => []);
      const dias = agendas[0]
        .map((d) => {
          const horarios = d.horarios.filter(
            (h) =>
              agendas.every((ag) => (ag.find((x) => x.data === d.data)?.horarios || []).includes(h)) &&
              !idsCasados.some((id) => horarioBloqueadoExame(bloqs, id, d.data, h))
          );
          return { data: d.data, horarios };
        })
        .filter((d) => d.horarios.length > 0);
      const rotuloCasado = idsCasados.length > 1 ? ` (horarios livres nas ${idsCasados.length} agendas)` : "";
      if (dias.length === 0)
        return {
          resultado:
            idsCasados.length > 1
              ? "Nao ha NENHUM horario livre em todas as agendas desses exames casados nas proximas semanas. NAO ofereca horario: avise que precisa checar com a equipe e passe pra um atendente."
              : "Sem horarios livres pra esse exame nas proximas semanas. Ofereca a lista de espera ou passe pra um atendente.",
        };
      if (dataPedida) {
        const doDia = dias.find((dd) => dd.data === dataPedida);
        if (doDia) {
          return {
            resultado: `Horarios do exame em ${dataComDia(doDia.data)}${rotuloCasado}: ${doDia.horarios.slice(0, 3).join(", ")}${doDia.horarios.length > 3 ? " (tem mais, se pedir)" : ""}. (marque com agendar_consulta passando feegow_exame_id=${input.exame_id})`,
          };
        }
        const prox = dias[0];
        return {
          resultado: `Sem horarios pra esse exame em ${dataComDia(dataPedida)}. Alternativa mais proxima: ${dataComDia(prox.data)}, horarios ${prox.horarios.slice(0, 3).join(", ")}. Ofereca essa alternativa com jeito.`,
        };
      }
      const primeiro = dias[0];
      return {
        resultado: `Proxima disponibilidade do exame${rotuloCasado}: ${dataComDia(primeiro.data)}, horarios ${primeiro.horarios.slice(0, 3).join(", ")}. Ofereca SO esses; se nenhum servir, pergunte a preferencia do paciente (dia/turno) e chame de novo com data. (marque com agendar_consulta passando feegow_exame_id=${input.exame_id})`,
      };
    }
    case "agendar_consulta": {
      // TRAVA ANTI-DUPLICATA (deterministica): o modelo ja "finalizou" a mesma
      // marcacao 2x em turnos diferentes (21/07: marcou 02/08 no turno do CPF
      // e no turno do nome tentou de novo — o dia aparecia cheio pela PROPRIA
      // vaga e ele ofereceu outro domingo pro paciente). Consulta futura criada
      // ha poucos minutos = essa marcacao JA foi feita.
      if (!input.segundo_agendamento) {
        const jaTem = await proximaConsultaDoPaciente(clinicaId, telefone);
        if (jaTem?.criado_em) {
          const idadeMin = (Date.now() - new Date(jaTem.criado_em).getTime()) / 60000;
          if (idadeMin >= 0 && idadeMin < 30) {
            return {
              resultado: `JA ESTA MARCADO — nao marque de novo! Este paciente ja tem "${jaTem.observacao || "um agendamento"}" criado ha ${Math.max(1, Math.round(idadeMin))} min para ${dataComDia(String(jaTem.inicio).slice(0, 10))} as ${String(jaTem.inicio).slice(11, 16)}. Confirme pro paciente EXATAMENTE essa data e hora (a vaga ja e dele). So se o paciente estiver pedindo um SEGUNDO procedimento DIFERENTE, chame de novo com segundo_agendamento=true.`,
            };
          }
        }
      }
      const clin = await getClinica(clinicaId);
      const ehExame = Boolean(input.feegow_exame_id);
      const cpf = input.cpf ? String(input.cpf).replace(/\D/g, "") : "";
      // guarda CPF/nascimento no cadastro local: e o que a recepcao usa pra
      // cadastrar o paciente no sistema da clinica quando ele ainda nao existe la
      if (cpf || input.nascimento) {
        await salvarCadastroPaciente(clinicaId, telefone, {
          cpf: cpf || undefined,
          nascimento: input.nascimento ? String(input.nascimento).slice(0, 10) : undefined,
        }).catch(() => {});
      }

      // REGRA CRITICA (exame): so marca se (a) tem o exame_id, (b) tem CPF, e
      // (c) o horario esta REALMENTE livre no Feegow AGORA (nao confia no que a
      // IA ofereceu — ela pode ter inventado). Sem isso, NAO marca e passa pra
      // humano — exame TEM que estar no Feegow, no horario certo.
      if (ehExame && feegowConectada(clin)) {
        if (cpf.length !== 11) {
          return { resultado: "Pra marcar exame eu PRECISO do CPF do paciente (11 digitos). Peca o CPF antes de marcar. NAO confirme o exame sem isso." };
        }
        // valida o horario contra a disponibilidade real do exame
        const dia = input.inicio.slice(0, 10);
        const hhmm = input.inicio.slice(11, 16);
        const dispon = await horariosExameFeegow(clin.feegow_token, String(input.feegow_exame_id), dia, dia, clin.feegow_local_id);
        const doDia = dispon.find((d) => d.data === dia);
        // bloqueio manual da clinica tambem impede a marcacao (nao so a oferta)
        const bloqsAg = await listBloqueiosExame(clinicaId, dia, dia).catch(() => []);
        const bloqueado = horarioBloqueadoExame(bloqsAg, String(input.feegow_exame_id), dia, hhmm);
        const livre = doDia?.horarios.includes(hhmm) && !bloqueado;
        if (!livre) {
          const ops = doDia?.horarios.slice(0, 4).join(", ") || "nenhum nesse dia";
          return { resultado: `O horario ${hhmm} de ${dia} NAO esta disponivel pra esse exame. Horarios REALMENTE livres nesse dia: ${ops}. Ofereca SO esses (nunca invente horario). Chame ver_horarios_exame se precisar de outra data.` };
        }
      }

      // guia do exame: se a IA sinalizou e o paciente mandou arquivo ha pouco,
      // anexa a URL na consulta (aparece como 📎 no card da agenda)
      let guiaUrl: string | null = null;
      if (input.anexar_guia) {
        guiaUrl = await getUltimaMidiaRecente(clinicaId, telefone);
      }
      const r = await agendar({
        clinicaId,
        profissionalId: input.profissional_id,
        telefone,
        nomePaciente: input.nome_paciente,
        inicioISO: input.inicio,
        observacao: input.observacao,
        pagamento: input.pagamento,
        convenioNome: input.convenio_nome,
        guiaUrl: guiaUrl ?? undefined,
        cpf: cpf || undefined,
        feegowProcedimentoId: input.feegow_exame_id ? String(input.feegow_exame_id) : undefined,
      });
      if (!r.ok) {
        // Horario recusado (ex: bloqueio no Clinicorp que a IA nao via, corrida
        // com outra marcacao): em vez de devolver so o erro e deixar o modelo
        // perdido, ja entrega as PROXIMAS datas reais pra ele sugerir na hora.
        const recusaDeAgenda = /indisponivel|ocupado|em cima da hora/i.test(r.erro || "");
        if (recusaDeAgenda && !ehExame) {
          const datas = await proximasDatasComVaga(input.profissional_id, hojeSP(), 14, MARGEM_IA_MIN).catch(() => []);
          if (datas.length > 0) {
            const d = datas[0];
            return {
              resultado: `Esse horario NAO esta mais disponivel (${r.erro}). NAO confirme essa marcacao. Sugira ao paciente uma nova data: ${dataComDia(d.data)}, horarios ${d.slots.slice(0, 3).map(horaDoSlot).join(", ")}. Ofereca SO esses; se nenhum servir, pergunte a preferencia dele (dia/turno) e chame ver_horarios.`,
            };
          }
          return { resultado: `Esse horario NAO esta mais disponivel (${r.erro}) e nao ha vaga nos proximos 14 dias com esse profissional. NAO confirme a marcacao — ofereca a lista de espera (entrar_lista_espera).` };
        }
        return { resultado: `Nao consegui agendar: ${r.erro}. Ofereca outro horario.` };
      }

      // EXAME: o espelho automatico via API esta DESLIGADO (22/07 — marcacao
      // via API fica invisivel na Agenda de Equipamentos, que e onde a
      // recepcao opera; ver lib/feegow.ts). A marcacao vale AQUI e a equipe ja
      // recebeu alerta com todos os dados pra lancar na agenda do equipamento.
      if (ehExame && feegowConectada(clin) && !r.consulta?.feegow_agendamento_id) {
        return {
          resultado: `Exame agendado com sucesso para ${input.inicio}. A recepcao ja recebeu os dados pra registrar na agenda interna — confirme a data e hora normalmente pro paciente (nao mencione sistema interno nem pendencia).`,
        };
      }

      return {
        resultado: `${ehExame ? "Exame" : "Consulta"} agendado com sucesso para ${input.inicio}${r.consulta?.feegow_agendamento_id ? " (registrado no Feegow ✅)" : ""}. Confirme pro paciente.`,
      };
    }
    case "remarcar_consulta": {
      const c = await proximaConsultaDoPaciente(clinicaId, telefone);
      if (!c) return { resultado: "Nao achei consulta futura desse paciente pra remarcar." };
      const clinR = await getClinica(clinicaId);
      const ehExameRem = Boolean(input.feegow_exame_id) || Boolean(c.guia_url);
      if (ehExameRem && feegowConectada(clinR)) {
        if (!input.feegow_exame_id) {
          return {
            resultado: `Essa marcacao e um EXAME ("${(c.observacao || "").slice(0, 60)}"). Pra remarcar, identifique o exame na lista EXAMES QUE A CLINICA REALIZA e chame remarcar_consulta DE NOVO passando feegow_exame_id. Escolha o novo horario com ver_horarios_exame antes.`,
          };
        }
        // valida o novo horario na fonte certa (agenda do EXAME, nao do medico)
        const diaR = String(input.novo_inicio).slice(0, 10);
        const hhmmR = String(input.novo_inicio).slice(11, 16);
        const disponR = await horariosExameFeegow(clinR.feegow_token, String(input.feegow_exame_id), diaR, diaR, clinR.feegow_local_id);
        const doDiaR = disponR.find((d) => d.data === diaR);
        if (!doDiaR?.horarios.includes(hhmmR)) {
          return {
            resultado: `O horario ${hhmmR} de ${diaR} NAO esta disponivel pra esse exame. Livres nesse dia: ${doDiaR?.horarios.slice(0, 4).join(", ") || "nenhum"}. Chame ver_horarios_exame pra achar outra data e ofereca ao paciente.`,
          };
        }
      }
      const r = await remarcar(c.id, input.novo_inicio, undefined, {
        feegowProcedimentoId: input.feegow_exame_id ? String(input.feegow_exame_id) : undefined,
      });
      if (!r.ok) {
        // mesmo tratamento do agendar: recusa de agenda ja volta com datas
        // reais pra IA sugerir na hora, em vez de erro seco
        if (/indisponivel|ocupado|em cima da hora/i.test(r.erro || "") && !ehExameRem) {
          const datasR = await proximasDatasComVaga(c.profissional_id, hojeSP(), 14, MARGEM_IA_MIN).catch(() => []);
          if (datasR.length > 0) {
            const dR = datasR[0];
            return {
              resultado: `Esse horario NAO esta disponivel (${r.erro}) — a consulta original segue de pe. Sugira ao paciente outra data pra remarcar: ${dataComDia(dR.data)}, horarios ${dR.slots.slice(0, 3).map(horaDoSlot).join(", ")}. Ofereca SO esses; se nenhum servir, pergunte a preferencia dele e chame ver_horarios.`,
            };
          }
        }
        return { resultado: `Nao consegui remarcar: ${r.erro}. Ofereca outro horario.` };
      }
      // exame TEM que estar certo na Feegow — se o espelho da remarcacao
      // falhou, o alerta ja disparou; avisa o paciente com honestidade
      if (ehExameRem && feegowConectada(clinR) && r.feegowOk === false) {
        return {
          resultado: `A consulta foi movida AQUI pra ${input.novo_inicio}, mas o sistema da clinica (Feegow) NAO aceitou a mudanca — a equipe ja foi alertada e vai ajustar. Diga ao paciente que a remarcacao esta sendo finalizada pela equipe e que ele recebe a confirmacao em breve. NAO afirme que ja esta tudo confirmado.`,
        };
      }
      return {
        resultado: `Consulta movida com sucesso pra ${input.novo_inicio}. Confirme a nova data/horario pro paciente.`,
      };
    }
    case "confirmar_consulta": {
      const c = await proximaConsultaDoPaciente(clinicaId, telefone);
      if (!c) return { resultado: "Nao achei consulta futura desse paciente pra confirmar." };
      await atualizarStatusConsulta(c.id, "confirmada");
      await registrarLog(clinicaId, "consulta", `✅ Presenca confirmada: ${telefone} — ${c.inicio.slice(8, 10)}/${c.inicio.slice(5, 7)} as ${c.inicio.slice(11, 16)}`);
      return { resultado: `Consulta ${c.inicio} confirmada. Agradeca e reforce a data/horario.` };
    }
    case "cancelar_consulta": {
      const c = await proximaConsultaDoPaciente(clinicaId, telefone);
      if (!c) return { resultado: "Nao achei consulta futura desse paciente pra cancelar." };
      await cancelar(c.id, input.motivo);
      return { resultado: `Consulta ${c.inicio} cancelada${input.motivo ? ` (motivo: ${input.motivo})` : ""}. Se ele mudar de ideia, ofereca remarcar.` };
    }
    case "entrar_lista_espera": {
      await entrarListaEspera({
        clinica_id: clinicaId,
        profissional_id: input.profissional_id || null,
        telefone,
        nome: input.nome_paciente,
      });
      await registrarLog(clinicaId, "consulta", `⏳ Entrou na lista de espera: ${input.nome_paciente || telefone}`);
      return {
        resultado:
          "Paciente adicionado a lista de espera. Avise que assim que abrir uma vaga ele recebe mensagem automatica por aqui.",
      };
    }
    case "passar_pra_humano": {
      // avisa a clinica de verdade (Telegram) com o contexto + registra no
      // painel (a recepcao que vive no painel precisa ver o handoff tambem)
      await alertarHumano({ clinicaId, telefone, motivo: input.motivo || "solicitado" });
      await registrarLog(
        clinicaId,
        "conversa",
        `🙋 IA passou pra equipe: ${telefone} — ${String(input.motivo || "solicitado").slice(0, 180)}`
      );
      return {
        resultado:
          "Ok, avisei a equipe. Diga ao paciente que um atendente vai continuar em breve.",
        passouPraHumano: true,
      };
    }
    case "consultar_especialista": {
      // registra a duvida pro painel (badge vermelho em Conversas) — a
      // secretaria responde por la e a resposta vira APRENDIZADO da IA
      const pergunta = String(input.pergunta || "").trim();
      if (pergunta) {
        await criarDuvida({
          clinica_id: clinicaId,
          telefone,
          pergunta_paciente: pergunta,
          pergunta_ia: pergunta,
        });
        await registrarLog(
          clinicaId,
          "duvida",
          `❓ IA abriu dúvida pro especialista (${telefone}): ${pergunta.slice(0, 160)}`
        );
      }
      return {
        resultado:
          "Duvida registrada pra equipe responder no painel. Diga ao paciente, no tom da clinica, que voce vai CONFIRMAR com o especialista e ja retorna (ex: 'vou confirmar com nosso especialista e te dou uma resposta ja ja'). NAO invente a resposta.",
      };
    }
    default:
      return { resultado: "Ferramenta desconhecida." };
  }
}

// Deteccao deterministica de confirmacao/cancelamento pos-lembrete.
// So age se existe uma consulta futura com confirmacao_enviada = true e ainda
// nao confirmada — garante que "sim"/"nao" aqui e resposta ao lembrete.
//
// IMPORTANTE: a regex casa a MENSAGEM INTEIRA (ancorada em ^ e $), nao so o
// inicio. Antes era so ^, entao "nao recebi o endereco" ou "n vou conseguir as
// 8, pode 9h?" casavam NAO so por comecarem com a palavra, e cancelavam a
// consulta sem a IA nunca ver a pergunta real. Agora so casa resposta CURTA e
// INEQUIVOCA (a palavra-chave + no maximo pontuacao/emoji de reforco depois) —
// qualquer coisa com mais conteudo (uma pergunta, uma condicao, um "mas") cai
// pro LLM interpretar em vez do atalho deterministico.
//
// Regex com flag /u e lookahead (?![\p{L}\p{N}]) pra que abreviacoes de UMA
// letra ('s', 'n') so casem quando sao a palavra inteira — sem isso, o \b do
// JS casa 's' no inicio de "só um momento" (o boundary entre 's' ASCII e 'ó').
// "remarca/remarcar" NAO entram no NAO: remarcar nao e cancelar — deixa a IA
// conduzir a remarcacao.
const FIM = "(?![\\p{L}\\p{N}])";
const CAUDA = "[\\s!.,👍✅🙏😊]*"; // so pontuacao/espaco/emoji de reforco ate o fim
const SIM = new RegExp(
  `^\\s*(sim${FIM}|s${FIM}|confirmo|confirmado|confirmar|vou${FIM}|ok${FIM}|okay|blz${FIM}|beleza|pode ser|isso${FIM}|claro|com certeza|👍|✅)${CAUDA}$`,
  "iu"
);
const NAO = new RegExp(
  `^\\s*(nao${FIM}|não${FIM}|n${FIM}|cancela${FIM}|cancelar${FIM}|desmarca${FIM}|desmarcar${FIM}|nao vou|não vou|nao posso|não posso)${CAUDA}$`,
  "iu"
);

// retorna o que a deteccao fez, pra IA nao responder contraditorio
type DeteccaoResultado = "confirmada" | "cancelada" | null;

async function detectarConfirmacao(
  clinicaId: string,
  telefone: string,
  texto: string
): Promise<DeteccaoResultado> {
  const c = await proximaConsultaDoPaciente(clinicaId, telefone);
  // so age se a consulta ja recebeu o lembrete e ainda esta como "agendada"
  if (!c || c.status !== "agendada" || !(c.confirmacao_enviada === true || c.confirmacao_enviada === 1)) {
    return null;
  }
  const t = texto.trim();
  if (NAO.test(t)) {
    await cancelar(c.id, "paciente avisou que nao vai (resposta ao lembrete)");
    return "cancelada";
  }
  if (SIM.test(t)) {
    await atualizarStatusConsulta(c.id, "confirmada");
    await registrarLog(clinicaId, "consulta", `✅ Presenca confirmada: ${telefone} — ${c.inicio.slice(8, 10)}/${c.inicio.slice(5, 7)} as ${c.inicio.slice(11, 16)}`);
    return "confirmada";
  }
  return null;
}

// Processa uma mensagem recebida e devolve a resposta da IA
export async function responder(params: {
  clinicaId: string;
  telefone: string;
  texto: string;
  nomeContato?: string;
  // canal por onde a mensagem chegou: funcao do numero de WhatsApp que recebeu
  // ("atendimento" | "financeiro") — muda a postura da IA no prompt
  canal?: string;
  // true quando o webhook JA salvou a mensagem no historico (fluxo de debounce
  // de rajada: salva primeiro, espera a pessoa terminar de digitar, e so o
  // handler da ultima mensagem chama responder — que nao pode salvar de novo)
  mensagemJaSalva?: boolean;
}): Promise<{ texto: string; passouPraHumano: boolean }> {
  const { clinicaId, telefone, texto } = params;

  // salva mensagem do paciente (a nao ser que o webhook ja tenha salvo)
  if (!params.mensagemJaSalva) {
    await salvarMensagem({ clinica_id: clinicaId, telefone, role: "user", conteudo: texto });
  }

  // DETECCAO DETERMINISTICA DE CONFIRMACAO (nao depende do modelo lembrar da tool).
  // Se o paciente tem uma consulta com lembrete ja enviado e responde sim/nao,
  // atualiza o status na hora. Isso e critico (e o numero que vende) — nao pode
  // depender do LLM chamar a ferramenta.
  const deteccao = await detectarConfirmacao(clinicaId, telefone, texto);

  const historico = await historicoConversa(clinicaId, telefone, 20);
  const messages: Anthropic.MessageParam[] = historico.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.conteudo,
  }));

  const system = await montarSystemPrompt(clinicaId, params.canal);
  // PROMPT CACHING: o bloco fixo (tools + system prompt da clinica, ~2.7k
  // tokens) se repete em TODA chamada. Com cache_control, a Anthropic cobra
  // 10% do preco nas repeticoes (janela de 5min, renovada a cada hit) — corta
  // o custo de API na metade em clinica com movimento. O contexto variavel da
  // deteccao vai num bloco SEPARADO pra nao invalidar o cache do bloco fixo.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: system, cache_control: { type: "ephemeral" } },
  ];
  // avisa a IA do que o sistema JA fez, pra ela nao responder contraditorio
  // (ex: sistema cancelou mas a IA acha que ainda esta agendada)
  if (deteccao === "confirmada") {
    systemBlocks.push({
      type: "text",
      text: `CONTEXTO IMPORTANTE: o sistema JA registrou a CONFIRMACAO de presenca desse paciente. Apenas agradeca e reforce a data/horario. NAO diga que precisa confirmar de novo.`,
    });
  } else if (deteccao === "cancelada") {
    systemBlocks.push({
      type: "text",
      text: `CONTEXTO IMPORTANTE: o sistema JA CANCELOU a consulta desse paciente (ele avisou que nao vai). NAO confirme presenca. Ofereca remarcar pra outro dia se ele quiser.`,
    });
  }

  // HORA ATUAL em bloco separado (muda a cada minuto — no bloco fixo mataria o
  // prompt caching). Sem isso a IA oferecia "hoje as 8h" a uma da tarde.
  systemBlocks.push({
    type: "text",
    text: `Agora sao ${agoraSP().slice(11, 16)} de ${dataComDia(hojeSP())} (horario de Brasilia). Horario de HOJE anterior a esse momento JA PASSOU: nunca ofereca, sugira ou aceite. As ferramentas ja filtram, mas confira antes de falar horario de hoje.`,
  });

  // CONSULTA FUTURA JA MARCADA: a IA precisa saber pra (1) nao marcar de novo a
  // mesma coisa (paciente reenvia a guia e vira agendamento duplicado) e (2)
  // responder "quando e meu exame?". Bloco separado pra nao invalidar o cache.
  const consultaFutura = await proximaConsultaDoPaciente(clinicaId, telefone);
  if (consultaFutura) {
    const dia = consultaFutura.inicio.slice(0, 10);
    systemBlocks.push({
      type: "text",
      text: `ESSE PACIENTE JA TEM AGENDAMENTO FUTURO: ${dataComDia(dia)} as ${consultaFutura.inicio.slice(11, 16)} (status: ${consultaFutura.status})${consultaFutura.observacao ? ` — ${String(consultaFutura.observacao).slice(0, 150)}` : ""}. Se ele pedir pra marcar a MESMA coisa de novo (ex: reenviar a mesma guia), NAO crie outro agendamento: avise que ja esta marcado, repita os dados e pergunte se quer manter ou remarcar (remarcar_consulta). So marque um agendamento NOVO se for claramente outro procedimento/consulta.`,
    });
  }
  let passouPraHumano = false;
  let houveAgendamentoReal = false; // agendar/remarcar com sucesso nesse turno
  let dataMarcadaTurno = ""; // inicio ISO do agendamento real (guard de data trocada)
  let houveCancelamentoReal = false; // cancelar com sucesso nesse turno
  let jaCorrigiuFantasma = false; // guard anti-fantasma corrige no maximo 1x
  // guard anti-horario-inventado: junta os horarios que as ferramentas de
  // agenda REALMENTE devolveram nesse turno (o modelo so pode citar esses)
  const ofertaValida: OfertaValida = { horarios: new Set<string>(), houveConsulta: false };
  let jaCorrigiuHorario = false;

  // acumula o uso de tokens de TODAS as iteracoes dessa conversa (pra custo)
  const uso = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, chamadas: 0 };
  const somaUso = (u: any) => {
    if (!u) return;
    uso.input += u.input_tokens || 0;
    uso.output += u.output_tokens || 0;
    uso.cacheWrite += u.cache_creation_input_tokens || 0;
    uso.cacheRead += u.cache_read_input_tokens || 0;
    uso.chamadas += 1;
  };

  // Loop de tool use (ate 5 iteracoes)
  for (let i = 0; i < 5; i++) {
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 2048,
      system: systemBlocks,
      tools: TOOLS,
      messages,
    });
    somaUso(resp.usage);

    if (resp.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: resp.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          const { resultado, passouPraHumano: ph } = await executarTool(
            clinicaId,
            telefone,
            block.name,
            block.input
          );
          if (ph) passouPraHumano = true;
          // marca acoes REAIS do turno (pro guard anti-fantasma)
          if (
            (block.name === "agendar_consulta" || block.name === "remarcar_consulta") &&
            /sucesso/i.test(resultado)
          ) {
            houveAgendamentoReal = true;
            const inp: any = block.input || {};
            dataMarcadaTurno = String(inp.inicio || inp.novo_inicio || "");
          }
          if (block.name === "cancelar_consulta" && /cancelada/i.test(resultado)) {
            houveCancelamentoReal = true;
          }
          // TRAVA ANTI-INVENCAO: guarda os horarios que a ferramenta devolveu.
          // Tudo que o modelo citar depois tem que estar aqui dentro.
          if (block.name === "ver_horarios" || block.name === "ver_horarios_exame") {
            ofertaValida.houveConsulta = true;
            for (const h of horariosCitados(resultado)) ofertaValida.horarios.add(h);
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultado,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // resposta final
    let textoResposta = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    // nunca manda mensagem VAZIA pro paciente (acontece quando o turno gastou
    // tudo em tool_use — ex: guard forcou o passar_pra_humano)
    if (!textoResposta) {
      textoResposta = passouPraHumano
        ? "Pronto! Passei seus dados pra nossa equipe — um atendente vai entrar em contato em breve pra finalizar com você. 😊"
        : "Certo! Só um instante que já te respondo. 😊";
    }

    // GUARD ANTI-FANTASMA (deterministico — regra de prompt sozinha ja falhou
    // em producao 2x): se a resposta alega "marcado/agendado" mas NENHUM
    // agendar/remarcar rodou com sucesso nesse turno E o paciente nao tem
    // consulta futura no banco, a resposta e MENTIRA. Devolve pro modelo com
    // ordem de chamar a ferramenta de verdade (1 correcao por mensagem).
    const alegouMarcado = /\b(marcad[ao]|agendad[ao]|reagendad[ao])\b/i.test(textoResposta);
    if (alegouMarcado && !houveAgendamentoReal && !jaCorrigiuFantasma) {
      const futura = await proximaConsultaDoPaciente(clinicaId, telefone);
      if (!futura) {
        jaCorrigiuFantasma = true;
        messages.push({ role: "assistant", content: textoResposta });
        messages.push({
          role: "user",
          content:
            "[SISTEMA — o paciente NAO viu sua ultima mensagem] Voce disse que esta marcado, mas NAO chamou agendar_consulta — NADA foi marcado no sistema. Chame a ferramenta AGORA com os dados ja coletados na conversa (profissional, horario, nome, pagamento, e cpf/feegow_exame_id se for exame) e SO depois confirme. Se faltar algum dado, pergunte ao paciente em vez de inventar.",
        });
        continue;
      }
    }
    // GUARD DATA TROCADA (deterministico): marcou DE VERDADE mas confirmou
    // OUTRA data pro paciente. Aconteceu 21/07: marcou 02/08 (sucesso), a
    // PROPRIA marcacao lotou o dia, o modelo re-consultou a agenda, viu
    // "cheio" e anunciou "09/08" — paciente saiu com uma data na cabeca e o
    // sistema com outra.
    if (houveAgendamentoReal && dataMarcadaTurno && !jaCorrigiuFantasma) {
      const [, mm2, dd2] = dataMarcadaTurno.slice(0, 10).split("-");
      const ddmmCerto = `${dd2}/${mm2}`;
      const norm = (s: string) => s.split("/").map((p) => p.padStart(2, "0")).join("/");
      const datasNaResposta = (textoResposta.match(/\b\d{1,2}\/\d{1,2}\b/g) || []).map(norm);
      const mencionaOutraData = datasNaResposta.some((d) => d !== ddmmCerto);
      const mencionaDataCerta = datasNaResposta.some((d) => d === ddmmCerto);
      // HORA trocada: a resposta cita horarios mas NENHUM e o marcado
      // (ex: marcou 14h e falou "15h"). Aceita "20h30", "20:30" e, quando o
      // minuto e 00, tambem "14h"/"8h" soltos. Mencao de OUTROS horarios junto
      // do certo (chegada 20h15, termina 6h) passa normal.
      const hh2 = dataMarcadaTurno.slice(11, 13);
      const min2 = dataMarcadaTurno.slice(14, 16);
      const hSolto = String(Number(hh2)); // "08" -> "8"
      const formasHoraCerta = [`${hh2}:${min2}`, `${hh2}h${min2}`, `${hSolto}h${min2}`, `${hSolto}:${min2}`];
      if (min2 === "00") formasHoraCerta.push(`${hSolto}h`, `${hh2}h`);
      const temHoraCerta = formasHoraCerta.some((f) =>
        new RegExp(`\\b${f}\\b`, "i").test(textoResposta)
      );
      const citaAlgumaHora = /\b\d{1,2}[h:]\d{2}\b/i.test(textoResposta);
      const horaTrocada = citaAlgumaHora && !temHoraCerta;
      if ((mencionaOutraData && !mencionaDataCerta) || horaTrocada) {
        jaCorrigiuFantasma = true;
        messages.push({ role: "assistant", content: textoResposta });
        messages.push({
          role: "user",
          content: `[SISTEMA — o paciente NAO viu sua ultima mensagem] O agendamento foi criado com SUCESSO para ${dataComDia(dataMarcadaTurno.slice(0, 10))} as ${dataMarcadaTurno.slice(11, 16)}. Sua resposta menciona outra data/hora (ou omite a certa) — isso deixaria o paciente com informacao errada. Confirme EXATAMENTE essa data e hora. NAO consulte horarios de novo: a vaga ja e do paciente.`,
        });
        continue;
      }
    }
    // mesmo guard pro HANDOFF: alegar "passei pra equipe" sem ter chamado
    // passar_pra_humano = equipe NUNCA avisada (nem Telegram nem painel).
    // So verbos no PASSADO — "vou passar pra equipe" (anuncio) e permitido.
    const alegouHandoff = /\b(passei|repassei|encaminhei|transferi)\b[\s\S]{0,60}\b(equipe|atendente|recep\w*)/i.test(
      textoResposta
    );
    if (alegouHandoff && !passouPraHumano && !jaCorrigiuFantasma) {
      jaCorrigiuFantasma = true;
      messages.push({ role: "assistant", content: textoResposta });
      messages.push({
        role: "user",
        content:
          "[SISTEMA — o paciente NAO viu sua ultima mensagem] Voce disse que passou pra equipe, mas NAO chamou passar_pra_humano — a equipe NAO foi avisada de nada. Chame a ferramenta AGORA com o motivo completo (exame, convenio, nome completo e CPF do paciente, o que tiver na conversa) e SO depois confirme pro paciente.",
      });
      continue;
    }

    // mesmo guard pro CANCELAMENTO: alegar "cancelado" com a consulta ainda ativa
    const alegouCancelado = /\b(cancelad[ao]|desmarcad[ao])\b/i.test(textoResposta);
    if (alegouCancelado && !houveCancelamentoReal && !jaCorrigiuFantasma) {
      const aindaAtiva = await proximaConsultaDoPaciente(clinicaId, telefone);
      if (aindaAtiva) {
        jaCorrigiuFantasma = true;
        messages.push({ role: "assistant", content: textoResposta });
        messages.push({
          role: "user",
          content:
            "[SISTEMA — o paciente NAO viu sua ultima mensagem] Voce falou em cancelamento, mas a consulta CONTINUA ATIVA no sistema (cancelar_consulta nao rodou). Se o paciente pediu/confirmou o cancelamento, chame cancelar_consulta AGORA com o motivo e so depois confirme. Se voce NAO afirmou que cancelou (ex: so perguntou o motivo), apenas repita sua resposta normal.",
        });
        continue;
      }
    }

    // GUARD ANTI-HORARIO-INVENTADO (deterministico): a instrucao "so ofereca o
    // que a ferramenta retornou" existe no prompt desde sempre e MESMO ASSIM o
    // modelo inventou horario pro paciente (20/08: ferramenta devolveu so
    // "20:30", ela ofereceu "10h, 11h ou 12h" — inexistentes e ja passados).
    // Aqui a resposta so passa se TODO horario citado veio da ferramenta.
    const inventados = horarioInventado(textoResposta, ofertaValida);
    if (inventados && !jaCorrigiuHorario) {
      jaCorrigiuHorario = true;
      const reais = [...ofertaValida.horarios].sort();
      messages.push({ role: "assistant", content: textoResposta });
      messages.push({
        role: "user",
        content:
          `[SISTEMA — o paciente NAO viu sua ultima mensagem] Voce ofereceu ${inventados}, que NAO existe na agenda. ` +
          (reais.length
            ? `Os UNICOS horarios livres que a ferramenta devolveu sao: ${reais.join(", ")}. Refaca a resposta oferecendo SO esses, exatamente como estao.`
            : `A ferramenta NAO devolveu nenhum horario livre. NAO ofereca horario nenhum: diga que nao tem vaga nesse dia e pergunte outra data/turno, ou chame ver_horarios/ver_horarios_exame com a data que o paciente pedir.`),
      });
      continue;
    }

    // ENFORCEMENT DE ESTILO: tom/tamanho configurados pela clinica valem de
    // verdade (strip de emoji, sem linha em branca, compressao se estourou)
    textoResposta = await aplicarEstilo(clinicaId, textoResposta);

    await salvarMensagem({
      clinica_id: clinicaId,
      telefone,
      role: "assistant",
      conteudo: textoResposta,
    });
    await registrarUsoTokens(clinicaId, uso); // best-effort — nao quebra a resposta

    return { texto: textoResposta, passouPraHumano };
  }

  const fallback = "Deixa eu chamar alguem da equipe pra te ajudar melhor.";
  await salvarMensagem({ clinica_id: clinicaId, telefone, role: "assistant", conteudo: fallback });
  await registrarUsoTokens(clinicaId, uso);
  return { texto: fallback, passouPraHumano: true };
}
