export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { contaPorId } from "@/lib/db";
import { criarPortal, stripeConfigurado } from "@/lib/stripe";

export async function POST() {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  if (!stripeConfigurado()) return NextResponse.json({ erro: "cobrança não ativada" }, { status: 503 });
  const conta = await contaPorId(s.contaId);
  const url = await criarPortal(conta);
  if (!url) return NextResponse.json({ erro: "sem assinatura ativa" }, { status: 400 });
  return NextResponse.json({ url });
}
