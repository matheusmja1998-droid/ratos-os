export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { getLead, atualizarLead, historicoLead, sb } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { id } = await params;
  const lead = await getLead(s.contaId, id);
  if (!lead) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  const mensagens = await historicoLead(s.contaId, id, 200);
  return NextResponse.json({ lead, mensagens });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { id } = await params;
  await atualizarLead(s.contaId, id, await req.json().catch(() => ({})));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { id } = await params;
  await sb.from("mensagens").delete().eq("conta_id", s.contaId).eq("lead_id", id);
  await sb.from("leads").delete().eq("conta_id", s.contaId).eq("id", id);
  return NextResponse.json({ ok: true });
}
