export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { listarCampanhas, criarCampanha, setTemplates, disparosHoje, sb } from "@/lib/db";

export async function GET() {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const camps = await listarCampanhas(s.contaId);
  for (const c of camps) {
    const { count: total } = await sb.from("campanha_leads").select("lead_id", { count: "exact", head: true }).eq("campanha_id", c.id);
    const { count: disp } = await sb.from("campanha_leads").select("lead_id", { count: "exact", head: true }).eq("campanha_id", c.id).not("disparado_em", "is", null);
    c.total_leads = total || 0;
    c.disparados = disp || 0;
    c.na_fila = (total || 0) - (disp || 0);
  }
  return NextResponse.json({ campanhas: camps, disparados_hoje: await disparosHoje(s.contaId) });
}

export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.nome) return NextResponse.json({ erro: "nome obrigatório" }, { status: 400 });
  const id = await criarCampanha(s.contaId, b);
  if (b.aberturas) await setTemplates(s.contaId, id!, "abertura", b.aberturas);
  if (b.followup1) await setTemplates(s.contaId, id!, "followup1", b.followup1);
  if (b.followup2) await setTemplates(s.contaId, id!, "followup2", b.followup2);
  return NextResponse.json({ ok: true, id });
}
