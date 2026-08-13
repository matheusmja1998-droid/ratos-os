export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { upsertLead, getLead, getLeadPorTelefone, salvarMensagem, historicoLead, atualizarLead, registrarEvento, sb } from "@/lib/db";
import { responderLead } from "@/lib/agente";

// Simulador: o cliente faz papel de lead e vê a IA dele respondendo.
// Nada sai pro WhatsApp (telefone 0000...).
export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { texto, reset } = await req.json().catch(() => ({}));
  const tel = "0000000001";
  let lead = await getLeadPorTelefone(s.contaId, tel);

  if (reset && lead) {
    await sb.from("mensagens").delete().eq("conta_id", s.contaId).eq("lead_id", lead.id);
    await sb.from("leads").delete().eq("conta_id", s.contaId).eq("id", lead.id);
    lead = null;
  }
  if (!lead) {
    const id = await upsertLead(s.contaId, { nome_empresa: "Lead Simulado", telefone: tel, cidade: "Teste", nicho: "teste", origem_lista: "simulador" });
    await atualizarLead(s.contaId, id!, { status: "disparado" });
    await salvarMensagem(s.contaId, id!, "assistant", "Oi! Tudo bem? Posso te fazer uma pergunta rápida?");
    lead = await getLead(s.contaId, id!);
  }
  if (!texto) return NextResponse.json({ lead, mensagens: await historicoLead(s.contaId, lead.id, 100) });

  await salvarMensagem(s.contaId, lead.id, "user", texto);
  if (lead.status === "disparado") { await atualizarLead(s.contaId, lead.id, { status: "respondeu" }); await registrarEvento(s.contaId, lead.id, "resposta", "sim"); }
  await responderLead({ contaId: s.contaId, leadId: lead.id, instanceToken: "SIMULADO" });
  const atual = await getLead(s.contaId, lead.id);
  return NextResponse.json({ lead: atual, mensagens: await historicoLead(s.contaId, lead.id, 100) });
}
