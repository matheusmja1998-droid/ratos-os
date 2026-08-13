export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { setConfig } from "@/lib/db";
import { carregarCerebro, CEREBRO_CHAVES } from "@/lib/cerebro";

export async function GET() {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  return NextResponse.json(await carregarCerebro(s.contaId));
}

export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  for (const chave of CEREBRO_CHAVES)
    if (body[chave] !== undefined) await setConfig(s.contaId, chave, String(body[chave]));
  return NextResponse.json({ ok: true });
}
