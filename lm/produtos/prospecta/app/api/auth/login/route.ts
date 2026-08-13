export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { verificarSenha, criarSessao, COOKIE_NOME, SESSAO_VIDA_MS, type Papel } from "@/lib/auth";
import { contaPorEmail } from "@/lib/db";

// rate-limit simples em memoria (por instancia serverless; suficiente pra freio basico)
const tentativas = new Map<string, { n: number; ate: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "?";
  const t = tentativas.get(ip) || { n: 0, ate: 0 };
  if (t.n >= 8 && Date.now() < t.ate)
    return NextResponse.json({ erro: "muitas tentativas, espera uns minutos" }, { status: 429 });

  const { email, senha } = await req.json().catch(() => ({}));
  const conta = await contaPorEmail(email || "");
  const ok = conta && conta.ativo && (await verificarSenha(senha || "", conta.senha_hash));
  if (!ok) {
    tentativas.set(ip, { n: t.n + 1, ate: Date.now() + 15 * 60_000 });
    return NextResponse.json({ erro: "email ou senha errados" }, { status: 401 });
  }
  tentativas.delete(ip);
  const cookie = await criarSessao({
    papel: (conta.papel || "cliente") as Papel, contaId: conta.id, versao: Number(conta.sessao_versao ?? 1),
  });
  const res = NextResponse.json({ ok: true, papel: conta.papel });
  res.cookies.set(COOKIE_NOME, cookie, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSAO_VIDA_MS / 1000,
  });
  return res;
}
