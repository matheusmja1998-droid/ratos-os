import { NextRequest, NextResponse } from "next/server";
import { getProfissional } from "@/lib/db";
import { clinicaPermitida } from "@/lib/sessao";
import { urlAutorizacao, montarState, gcalConfigurado, NONCE_COOKIE } from "@/lib/gcal";

// GET /api/gcal/conectar?prof=ID → redireciona pro consentimento do Google.
// ISOLAMENTO: so quem pode operar a clinica do medico inicia a conexao.
// ANTI-CSRF: gera state assinado + nonce em cookie HttpOnly (o callback confere).
export async function GET(req: NextRequest) {
  if (!gcalConfigurado()) {
    return NextResponse.json(
      { erro: "Google Calendar ainda nao configurado (falta GOOGLE_CLIENT_ID/SECRET)" },
      { status: 503 }
    );
  }
  const profId = req.nextUrl.searchParams.get("prof") || "";
  const prof = await getProfissional(profId);
  if (!prof) return NextResponse.json({ erro: "profissional nao encontrado" }, { status: 404 });

  const permitida = await clinicaPermitida(prof.clinica_id);
  if (!permitida || permitida !== prof.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  const { state, nonce } = montarState(profId);
  const url = urlAutorizacao(state);
  if (!url) return NextResponse.json({ erro: "falha ao gerar url" }, { status: 500 });

  const res = NextResponse.redirect(url);
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // lax permite o retorno do redirect do Google
    path: "/",
    maxAge: 600, // 10 min pra completar o fluxo
  });
  return res;
}
