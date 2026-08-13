export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { hashSenha, criarSessao, COOKIE_NOME, SESSAO_VIDA_MS } from "@/lib/auth";
import { criarConta, contaPorEmail } from "@/lib/db";

export async function POST(req: Request) {
  const { nome, email, senha } = await req.json().catch(() => ({}));
  if (!email || !senha) return NextResponse.json({ erro: "email e senha obrigatórios" }, { status: 400 });
  if (String(senha).length < 6) return NextResponse.json({ erro: "senha mínima de 6 caracteres" }, { status: 400 });
  if (await contaPorEmail(email)) return NextResponse.json({ erro: "esse email já tem conta" }, { status: 409 });

  const conta = await criarConta({ nome, email, senha_hash: await hashSenha(senha) });
  const cookie = await criarSessao({ papel: "cliente", contaId: conta.id, versao: 1 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NOME, cookie, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSAO_VIDA_MS / 1000,
  });
  return res;
}
