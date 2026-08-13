export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { atualizarCampanha, setTemplates, vincularLeadsNovos, templatesDaCampanha, sb } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({
    aberturas: (await templatesDaCampanha(s.contaId, id, "abertura")).map((t: any) => t.texto),
    followup1: (await templatesDaCampanha(s.contaId, id, "followup1")).map((t: any) => t.texto),
    followup2: (await templatesDaCampanha(s.contaId, id, "followup2")).map((t: any) => t.texto),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (b.status === "ativa") // 1 campanha ativa por vez
    await sb.from("campanhas").update({ status: "pausada" }).eq("conta_id", s.contaId).eq("status", "ativa");
  const cfg: any = {};
  for (const k of ["status", "teto_dia", "cadencia_min_seg", "cadencia_max_seg", "janela_inicio", "janela_fim"])
    if (b[k] !== undefined) cfg[k] = b[k];
  if (Object.keys(cfg).length) await atualizarCampanha(s.contaId, id, cfg);
  for (const [campo, tipo] of [["aberturas", "abertura"], ["followup1", "followup1"], ["followup2", "followup2"]] as const)
    if (Array.isArray(b[campo])) await setTemplates(s.contaId, id, tipo, b[campo]);
  if (b.vincular) { const n = await vincularLeadsNovos(s.contaId, id); return NextResponse.json({ ok: true, vinculados: n }); }
  return NextResponse.json({ ok: true });
}
