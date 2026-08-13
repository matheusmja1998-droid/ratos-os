export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { contaPorId } from "@/lib/db";
import { criarCheckout, stripeConfigurado } from "@/lib/stripe";

export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  if (!stripeConfigurado()) return NextResponse.json({ erro: "cobrança ainda não ativada" }, { status: 503 });
  const { whatsappsExtra } = await req.json().catch(() => ({}));
  const conta = await contaPorId(s.contaId);
  try {
    const url = await criarCheckout(conta, Math.max(0, Number(whatsappsExtra) || 0));
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}
