// Agente SDR do Prospecta (multi-tenant). Usa a API Anthropic DO CLIENTE
// (clientDaConta) com o cerebro DELE. Sem client (conta sem chave) -> nao responde.
import { clientDaConta, MODELO } from "./anthropic";
import { carregarCerebro, montarSystemPrompt } from "./cerebro";
import {
  getLead, atualizarLead, salvarMensagem, historicoLead, registrarEvento, bloquear,
} from "./db";
import { enviarTexto } from "./uazapi";
import { alertar } from "./telegram";

type Ctx = { contaId: string; leadId: string; instanceToken: string };

function montarConversa(hist: any[]): string {
  return hist.map((m) => {
    const quem = m.role === "user" ? "LEAD" : m.role === "assistant" ? "VOCÊ" : "SISTEMA";
    return `${quem}: ${m.texto}`;
  }).join("\n");
}

// extrai {"acoes":[...]} mesmo com texto/cerca em volta
function parseAcoes(saida: string): any[] | null {
  const s = String(saida || "");
  const ini = s.indexOf("{");
  if (ini === -1) return null;
  for (let fim = s.lastIndexOf("}"); fim > ini; fim = s.lastIndexOf("}", fim - 1)) {
    try {
      const obj = JSON.parse(s.slice(ini, fim + 1));
      if (Array.isArray(obj?.acoes)) return obj.acoes;
    } catch { /* tenta fechar antes */ }
  }
  return null;
}

export async function responderLead(ctx: Ctx) {
  const { contaId, leadId, instanceToken } = ctx;
  const lead = await getLead(contaId, leadId);
  if (!lead || lead.ia_pausada) return;

  const client = await clientDaConta(contaId);
  if (!client) { // conta sem chave Anthropic: nao tem como a IA responder
    await registrarEvento(contaId, leadId, "erro", "sem chave Anthropic");
    return;
  }

  const cerebro = await carregarCerebro(contaId);
  const system = montarSystemPrompt(cerebro);
  const hist = await historicoLead(contaId, leadId);
  const simulado = String(lead.telefone).startsWith("0000");

  const userMsg = `## LEAD
- Empresa: ${lead.nome_empresa}${lead.cidade ? ` (${lead.cidade})` : ""}
- Nicho: ${lead.nicho || "?"}
- Contato: ${lead.nome_contato || "ainda não sabemos"}
- É o responsável? ${lead.eh_responsavel ? "SIM" : "ainda não confirmado"}
- Dor: ${lead.dor || "nenhuma ainda"}
- Status: ${lead.status}

## CONVERSA ATÉ AGORA
${montarConversa(hist)}

Responda com o JSON de ações.`;

  let saida = "";
  try {
    const resp = await client.messages.create({
      model: MODELO, max_tokens: 1024, system,
      messages: [{ role: "user", content: userMsg }],
    });
    saida = resp.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  } catch (e: any) {
    await registrarEvento(contaId, leadId, "erro", `anthropic: ${e?.message || e}`);
    await alertar(contaId, `🔴 IA falhou pra ${lead.nome_empresa}. Verifique sua chave Anthropic (saldo?).`);
    return;
  }

  const acoes = parseAcoes(saida);
  if (!acoes) { await registrarEvento(contaId, leadId, "erro", "saída sem JSON"); return; }

  for (const acao of acoes) {
    if (acao.tipo === "texto" && acao.texto) {
      const r = simulado ? { ok: true } : await enviarTexto(instanceToken, lead.telefone, acao.texto);
      if (r.ok) await salvarMensagem(contaId, leadId, "assistant", acao.texto);
      else await registrarEvento(contaId, leadId, "erro", `envio: ${r.erro}`);
      if (lead.status === "respondeu") await atualizarLead(contaId, leadId, { status: "em_conversa" });
      await new Promise((res) => setTimeout(res, 1500));
    }
    if (acao.tipo === "atualizar_lead" && acao.campos) {
      const campos = { ...acao.campos };
      if (campos.telefone_decisor) campos.telefone_decisor = String(campos.telefone_decisor).replace(/\D/g, "");
      await atualizarLead(contaId, leadId, campos);
      if (campos.telefone_decisor)
        await alertar(contaId, `📞 Contato do decisor: ${lead.nome_empresa} — ${campos.nome_contato || "?"} ${campos.telefone_decisor}`);
    }
    if (acao.tipo === "marcar_reuniao" && acao.inicio) {
      await import("./db").then((d) => d.sb.from("reunioes").insert({ conta_id: contaId, lead_id: leadId, inicio: acao.inicio }));
      await atualizarLead(contaId, leadId, { status: "reuniao_marcada" });
      await registrarEvento(contaId, leadId, "reuniao", acao.inicio);
      await alertar(contaId, `📅 REUNIÃO: ${lead.nome_empresa} em ${acao.inicio}`);
    }
    if (acao.tipo === "passar_pra_humano") {
      await atualizarLead(contaId, leadId, { ia_pausada: 1 });
      await registrarEvento(contaId, leadId, "handoff", acao.motivo || "");
      await alertar(contaId, `🙋 Assumir: ${lead.nome_empresa} — ${acao.motivo || ""}`);
    }
    if (acao.tipo === "perder") {
      await atualizarLead(contaId, leadId, { status: "perdido", ia_pausada: 1, motivo_perda: acao.motivo || "sem interesse" });
      await registrarEvento(contaId, leadId, "perdido", acao.motivo || "");
    }
    if (acao.tipo === "optout") {
      await bloquear(contaId, lead.telefone, "pediu pra parar");
      await atualizarLead(contaId, leadId, { status: "optout", ia_pausada: 1 });
      await registrarEvento(contaId, leadId, "optout", "");
    }
  }
}
