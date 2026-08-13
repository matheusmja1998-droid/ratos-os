// Chat-entrevista: um agente que conversa com o CLIENTE (dono da conta) e vai
// preenchendo o cerebro (produto, tom, objecoes...) sozinho. Como o Matheus faz
// com o Claude. Cada turno devolve {mensagem, campos, concluido}.
import { clientDaConta, MODELO } from "./anthropic";
import { CEREBRO_CHAVES } from "./cerebro";

const SYSTEM = `Você é um consultor que ajuda um empresário a configurar a IA de prospecção dele (um SDR que vai conversar com leads no WhatsApp). Você conduz uma ENTREVISTA curta e amigável, uma pergunta de cada vez, pra descobrir tudo que a IA dele precisa saber.

Descubra ao longo da conversa:
- O que a empresa vende e o que isso resolve
- Como ele quer que a IA se apresente (nome, cargo)
- O objetivo da conversa com o lead (marcar reunião? levar pro link? etc)
- Preço / como responder valor
- Prova social / caso de sucesso
- As objeções mais comuns e como ele responde cada uma
- O tom de voz (formal, descontraído, direto...)

REGRAS:
- Uma pergunta por mensagem. Linguagem simples, brasileira, acolhedora.
- Conforme ele responde, você PREENCHE os campos do cérebro que já dá pra preencher.
- Quando tiver o essencial (o que vende + objetivo + tom + pelo menos 1 objeção), pergunte se ele quer ajustar algo ou se pode finalizar. Se ele disser que pode, marque concluido=true.
- Não invente informação: só preencha campos com o que ele disse.

Campos do cérebro que você pode preencher: quem_sou, produto_nome, produto_desc, produto_preco, produto_prova, objetivo, cta_link, objecoes, tom, obs_extra.

FORMATO (responda SOMENTE JSON válido, sem markdown):
{"mensagem":"sua próxima pergunta ou fala pro empresário","campos":{"produto_nome":"...","tom":"..."},"concluido":false}
- "mensagem": o que você diz agora (pergunta ou confirmação).
- "campos": só os campos que você conseguiu preencher/atualizar AGORA (pode ser {}).
- "concluido": true só quando ele confirmar que pode finalizar.`;

function parseJSON(s: string): any | null {
  const ini = s.indexOf("{");
  if (ini === -1) return null;
  for (let fim = s.lastIndexOf("}"); fim > ini; fim = s.lastIndexOf("}", fim - 1)) {
    try { return JSON.parse(s.slice(ini, fim + 1)); } catch { /* tenta */ }
  }
  return null;
}

export async function turnoEntrevista(contaId: string, historico: { role: string; content: string }[]) {
  const client = await clientDaConta(contaId);
  if (!client) return { erro: "sem_chave" as const };

  const messages = historico.length
    ? historico.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    : [{ role: "user" as const, content: "(início — me faça a primeira pergunta)" }];

  let saida = "";
  try {
    const resp = await client.messages.create({ model: MODELO, max_tokens: 1024, system: SYSTEM, messages });
    saida = resp.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  } catch (e: any) {
    return { erro: "anthropic" as const, detalhe: e?.message };
  }

  const obj = parseJSON(saida) || { mensagem: saida, campos: {}, concluido: false };
  // sanitiza campos: so os validos
  const campos: Record<string, string> = {};
  for (const k of CEREBRO_CHAVES) if (obj.campos?.[k]) campos[k] = String(obj.campos[k]);
  return { mensagem: String(obj.mensagem || ""), campos, concluido: Boolean(obj.concluido) };
}
