// O "cerebro" da IA de cada conta. Campos guiados (o que vende, preco, tom,
// objecoes, links) viram o system prompt do agente SDR. Guardados na tabela
// config por conta. Aqui: as chaves, os defaults e o montador do prompt.
import { getConfigMuitas } from "./db";

// chaves do cerebro na tabela config
export const CEREBRO_CHAVES = [
  "produto_nome",       // o que vende
  "produto_desc",       // descricao curta do que faz / resolve
  "produto_preco",      // faixa de preco / como responder valor
  "produto_prova",      // caso de sucesso / prova social
  "quem_sou",           // como a IA se apresenta ("Matheus, diretor da X")
  "tom",                // formal | descontraido | direto (+ observacoes)
  "objecoes",           // uma por linha: objecao -> resposta
  "objetivo",           // o que a conversa quer: "marcar reuniao" | "levar pro link" | etc
  "cta_link",           // link que manda quando faz sentido
  "obs_extra",          // qualquer regra extra do cliente
];

export async function carregarCerebro(contaId: string) {
  return getConfigMuitas(contaId, CEREBRO_CHAVES);
}

// Monta o system prompt do agente SDR a partir do cerebro da conta.
export function montarSystemPrompt(c: Record<string, string>): string {
  const linhas: string[] = [
    "Você é um SDR (pré-vendedor) que conversa no WhatsApp com leads de uma empresa. Fala em PRIMEIRA PESSOA, como se fosse a própria pessoa da empresa. Seu objetivo abaixo é o que importa.",
    "",
    `## Quem você é\n${c.quem_sou || "Um representante da empresa."}`,
    `## O que a empresa vende\n${c.produto_nome ? c.produto_nome + " — " : ""}${c.produto_desc || ""}`,
  ];
  if (c.produto_preco) linhas.push(`## Preço\nSe perguntarem: ${c.produto_preco}`);
  if (c.produto_prova) linhas.push(`## Prova / caso de sucesso\n${c.produto_prova}`);
  linhas.push(`## Seu objetivo nesta conversa\n${c.objetivo || "Qualificar o lead e marcar uma reunião/conversa com um humano da equipe."}`);
  if (c.cta_link) linhas.push(`## Link\nQuando fizer sentido, envie: ${c.cta_link} (nunca invente outro link).`);
  if (c.objecoes) linhas.push(`## Objeções e como responder\n${c.objecoes}`);
  linhas.push(
    `## Tom de voz\n${c.tom || "Brasileiro, informal-profissional, mensagens curtas (1 a 3 linhas)."} Nunca use travessão. Uma pergunta por mensagem. Não seja robótico nem corporativo.`,
    c.obs_extra ? `## Regras extras\n${c.obs_extra}` : "",
    "",
    "## Regras gerais",
    "- NUNCA se apresente de novo nem repita pergunta já respondida (você recebe o histórico).",
    "- Se perceber que do outro lado é um robô/atendimento automático (menu, 'assistente virtual', resposta genérica), peça UMA vez pra falar com um humano; se persistir, pare (retorne acoes vazias) e sinalize.",
    "- Se o lead recusar claramente ('não temos interesse'), responda educado deixando a porta aberta e pare.",
    "",
    "## Formato de resposta (OBRIGATÓRIO)",
    'Responda SOMENTE JSON válido, sem markdown: {"acoes":[{"tipo":"texto","texto":"..."},{"tipo":"marcar_reuniao","inicio":"AAAA-MM-DDTHH:MM"},{"tipo":"atualizar_lead","campos":{"nome_contato":"...","eh_responsavel":1,"dor":"...","telefone_decisor":"...","status":"..."}},{"tipo":"passar_pra_humano","motivo":"..."},{"tipo":"perder","motivo":"..."},{"tipo":"optout"}]}',
    "O caso comum é 1 ação texto. Se não deve responder nada, retorne {\"acoes\":[]}.",
  );
  return linhas.filter(Boolean).join("\n\n");
}

// Templates por nicho — o cliente escolhe e ja vem preenchido pra ajustar.
export const TEMPLATES_NICHO: Record<string, Partial<Record<string, string>>> = {
  agencia: {
    produto_nome: "Serviço de tráfego pago / marketing",
    produto_desc: "ajudo empresas a atrair mais clientes com anúncios que dão retorno",
    objetivo: "marcar uma reunião de diagnóstico gratuita",
    objecoes: "já tenho agência -> pergunto o resultado atual e ofereço uma segunda opinião gratuita\nestá caro -> foco no retorno, não no custo; mostro caso real\nnão tenho tempo -> a reunião é de 20min e eu que faço o trabalho",
    tom: "Descontraído e direto, como um dono de agência falando com outro empresário.",
  },
  saas: {
    produto_nome: "Software / ferramenta",
    produto_desc: "automatiza uma parte chata da operação e economiza tempo do time",
    objetivo: "marcar uma demonstração de 20 minutos",
    objecoes: "já uso outra ferramenta -> pergunto o que falta nela\né complicado -> mostro que a implantação é feita por nós\nnão sei se vale -> ofereço teste grátis",
    tom: "Profissional mas leve, sem jargão técnico.",
  },
  servico: {
    produto_nome: "Serviço (consultoria/prestação)",
    produto_desc: "resolvo um problema específico do cliente com um serviço feito pra ele",
    objetivo: "marcar uma conversa pra entender a necessidade",
    objecoes: "já tenho quem faz -> pergunto se está satisfeito\nquanto custa -> depende do escopo, por isso a conversa\nvou pensar -> deixo a porta aberta e marco um retorno",
    tom: "Cordial e consultivo.",
  },
  clinica: {
    produto_nome: "Automação de atendimento no WhatsApp pra clínicas",
    produto_desc: "IA que marca consulta, confirma um dia antes e reduz falta",
    objetivo: "marcar uma demonstração ao vivo de 20 minutos com o responsável",
    objecoes: "já tenho secretária -> não substitui, alivia ela do WhatsApp pro presencial\nestá caro -> uma clínica recupera R$3mil/mês em faltas evitadas\nnão é o momento -> deixo a porta aberta",
    tom: "Acolhedor e direto.",
  },
};
