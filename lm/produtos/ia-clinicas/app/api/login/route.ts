import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NOME, criarSessao, verificarSenha, hashSenha } from "@/lib/auth";
import { getContaPorEmail, loginBloqueado, registrarTentativaLogin } from "@/lib/db";

// POST /api/login  { email, senha }  -> valida conta e seta cookie de sessao
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").toLowerCase().trim();
  const senha = String(body?.senha || "");

  if (!email || !senha) {
    return NextResponse.json({ ok: false, erro: "informe email e senha" }, { status: 400 });
  }

  // RATE LIMIT: muitas falhas recentes pra esse email = bloqueia por uns
  // minutos. Sem isso dava pra testar milhares de senhas por minuto (e cada
  // tentativa roda PBKDF2 100k iteracoes — tambem servia de ataque de CPU).
  // FAIL-OPEN: se a checagem falhar (tabela nao migrada), nao tranca ninguem.
  const bloqueado = await loginBloqueado(email).catch(() => false);
  if (bloqueado) {
    return NextResponse.json(
      { ok: false, erro: "muitas tentativas. Espera uns minutos e tenta de novo." },
      { status: 429 }
    );
  }

  const conta = await getContaPorEmail(email);
  // mensagem generica (nao revela se o email existe)
  const invalido = async () => {
    await registrarTentativaLogin(email, false).catch(() => {});
    return NextResponse.json({ ok: false, erro: "email ou senha incorretos" }, { status: 401 });
  };

  if (!conta || !(conta.ativo === true || conta.ativo === 1)) {
    // TIMING: roda um hash de mentira pra email inexistente custar o MESMO
    // tempo que email real — senao dava pra descobrir quais emails tem conta
    // so medindo a latencia da resposta.
    await hashSenha(senha).catch(() => {});
    return invalido();
  }
  const ok = await verificarSenha(senha, conta.senha_hash);
  if (!ok) return invalido();

  await registrarTentativaLogin(email, true).catch(() => {});
  const valor = await criarSessao({
    papel: conta.papel,
    contaId: conta.id,
    clinicaId: conta.clinica_id ?? null,
    versao: Number(conta.sessao_versao ?? 1),
  });

  const res = NextResponse.json({ ok: true, papel: conta.papel });
  res.cookies.set(COOKIE_NOME, valor, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

// DELETE /api/login -> logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NOME, "", { path: "/", maxAge: 0 });
  return res;
}
