import { NextRequest, NextResponse } from "next/server";
import { getProfissional } from "@/lib/db";
import { clinicaPermitida } from "@/lib/sessao";
import { trocarCodePorToken, validarState, NONCE_COOKIE } from "@/lib/gcal";

// GET /api/gcal/callback?code=...&state=... → o Google redireciona pra ca depois
// do consentimento. Valida o state (anti-CSRF) + isolamento, troca o code por
// refresh token e vincula ao medico.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code") || "";
  const state = sp.get("state") || "";
  const erroOAuth = sp.get("error");

  const voltarPro = (qs: string) => {
    const res = NextResponse.redirect(`${req.nextUrl.origin}/painel/clinica?${qs}`);
    res.cookies.set(NONCE_COOKIE, "", { path: "/", maxAge: 0 }); // limpa o nonce
    return res;
  };

  if (erroOAuth) return voltarPro("gcal=negado");
  if (!code || !state) return voltarPro("gcal=erro");

  // ANTI-CSRF: o state tem que estar assinado E o nonce tem que casar com o cookie
  const nonceCookie = req.cookies.get(NONCE_COOKIE)?.value || "";
  const v = validarState(state, nonceCookie);
  if (!v.ok || !v.profissionalId) return voltarPro("gcal=erro");

  const prof = await getProfissional(v.profissionalId);
  if (!prof) return voltarPro("gcal=erro");

  // isolamento: a sessao atual tem que poder operar a clinica do medico
  const permitida = await clinicaPermitida(prof.clinica_id);
  if (!permitida || permitida !== prof.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  const r = await trocarCodePorToken(code, v.profissionalId);
  return voltarPro(r.ok ? "gcal=conectado" : "gcal=falhou");
}
