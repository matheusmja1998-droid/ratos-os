export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { getLead, atualizarLead, sb } from "@/lib/db";
import { responderLead } from "@/lib/agente";

// pausar/devolver a IA. Ao devolver, a IA RETOMA na hora.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { id } = await params;
  const { pausar } = await req.json().catch(() => ({}));
  await atualizarLead(s.contaId, id, { ia_pausada: pausar ? 1 : 0 });
  if (!pausar) {
    const lead = await getLead(s.contaId, id);
    const { data: inst } = await sb.from("instancias").select("uazapi_token")
      .eq("conta_id", s.contaId).eq("status", "conectado").limit(1).maybeSingle();
    responderLead({ contaId: s.contaId, leadId: id, instanceToken: inst?.uazapi_token || "SIMULADO" })
      .catch((e) => console.error("[retomar]", e.message));
  }
  return NextResponse.json({ ok: true });
}
