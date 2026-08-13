export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { listarLeads, sb } from "@/lib/db";

export async function GET() {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const leads = await listarLeads(s.contaId);
  // anexa a ultima mensagem de cada lead (preview no card)
  const ids = leads.map((l: any) => l.id);
  if (ids.length) {
    const { data: msgs } = await sb.from("mensagens").select("lead_id, role, texto, criado_em")
      .eq("conta_id", s.contaId).in("lead_id", ids).order("criado_em", { ascending: false });
    const ultima: Record<string, any> = {};
    for (const m of msgs || []) if (!ultima[m.lead_id]) ultima[m.lead_id] = m;
    for (const l of leads) { l.ultima_role = ultima[l.id]?.role || null; l.ultima_msg = ultima[l.id]?.texto || null; }
  }
  return NextResponse.json(leads);
}
