export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { TEMPLATES_NICHO } from "@/lib/cerebro";

export async function GET(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const nicho = new URL(req.url).searchParams.get("nicho") || "";
  return NextResponse.json(TEMPLATES_NICHO[nicho] || {});
}
