export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { atualizarConta, contaPorId } from "@/lib/db";
import { cifrar } from "@/lib/auth";
import { validarChave } from "@/lib/anthropic";

// GET: status da chave (sem NUNCA devolver a chave em si)
export async function GET() {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const conta = await contaPorId(s.contaId);
  return NextResponse.json({ configurada: Boolean(conta?.anthropic_key) });
}

// POST: valida a chave e salva cifrada
export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { chave } = await req.json().catch(() => ({}));
  const v = await validarChave(String(chave || "").trim());
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 422 });
  await atualizarConta(s.contaId, { anthropic_key: await cifrar(String(chave).trim()) });
  return NextResponse.json({ ok: true });
}

// DELETE: remove a chave
export async function DELETE() {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  await atualizarConta(s.contaId, { anthropic_key: null });
  return NextResponse.json({ ok: true });
}
