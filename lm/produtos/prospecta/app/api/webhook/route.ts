export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { parseWebhook } from "@/lib/uazapi";
import {
  getLeadPorTelefone, salvarMensagem, atualizarLead, registrarEvento,
  naBlocklist, bloquear, webhookJaVisto, sb,
} from "@/lib/db";
import { responderLead } from "@/lib/agente";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const OPTOUT = /\b(par[ae] de (me )?(mandar|enviar)|remove\w* meu (numero|número|contato)|descadastr|me tir[ae] d)\b/i;

export async function POST(req: Request) {
  const u = new URL(req.url);
  if (WEBHOOK_SECRET && u.searchParams.get("secret") !== WEBHOOK_SECRET) return NextResponse.json({ ok: true });
  const contaId = u.searchParams.get("conta") || "";
  const instId = u.searchParams.get("inst") || "";
  if (!contaId) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => ({}));
  const m = parseWebhook(body);
  if (!m || m.ehGrupo || m.tipo === "figurinha") return NextResponse.json({ ok: true });
  if (await webhookJaVisto(m.messageId)) return NextResponse.json({ ok: true });

  const lead = await getLeadPorTelefone(contaId, m.telefone);
  if (!lead) return NextResponse.json({ ok: true }); // chip proprio: so responde quem e lead

  // token da instancia que recebeu (pra responder pelo mesmo numero)
  const { data: inst } = await sb.from("instancias").select("uazapi_token")
    .eq("conta_id", contaId).eq("id", instId).maybeSingle();
  const instanceToken = inst?.uazapi_token || "";

  // eco da propria IA
  if (m.fromMe && m.enviadaPelaApi) return NextResponse.json({ ok: true });
  // humano respondeu pelo celular -> pausa IA
  if (m.fromMe) {
    if (m.texto) await salvarMensagem(contaId, lead.id, "assistant", m.texto);
    if (!lead.ia_pausada) { await atualizarLead(contaId, lead.id, { ia_pausada: 1 }); await registrarEvento(contaId, lead.id, "handoff", "celular"); }
    return NextResponse.json({ ok: true });
  }
  if (await naBlocklist(contaId, m.telefone)) return NextResponse.json({ ok: true });

  const texto = m.texto || (m.tipo === "audio" ? "[o lead enviou um áudio; peça pra escrever]" : "[o lead enviou uma mídia]");
  await salvarMensagem(contaId, lead.id, "user", texto, m.tipo);
  if (lead.status === "disparado" || lead.status === "novo") {
    await atualizarLead(contaId, lead.id, { status: "respondeu" });
    await registrarEvento(contaId, lead.id, "resposta", "");
  }
  if (OPTOUT.test(m.texto || "")) {
    await bloquear(contaId, m.telefone, "opt-out");
    await atualizarLead(contaId, lead.id, { status: "optout", ia_pausada: 1 });
    return NextResponse.json({ ok: true });
  }
  if (lead.ia_pausada) return NextResponse.json({ ok: true });

  await responderLead({ contaId, leadId: lead.id, instanceToken });
  return NextResponse.json({ ok: true });
}
