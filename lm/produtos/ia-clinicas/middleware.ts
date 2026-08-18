import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NOME, lerSessao } from "@/lib/auth";

// Rotas publicas (match EXATO — sub-rotas nao herdam o bypass):
//  - /api/webhook, /api/cron       (protegidas por segredo proprio)
//  - /api/stripe/webhook           (protegida pela assinatura do Stripe)
//  - /api/login                    (a propria rota de entrar)
//  - /login                        (tela de login unica)
const PUBLICO_EXATO = new Set([
  "/api/webhook",
  "/api/cron",
  "/api/cron/saude-trial", // raio-x do trial (tem o mesmo CRON_SECRET no handler)
  "/api/stripe/webhook",
  "/api/login",
  "/login",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLICO_EXATO.has(pathname)) return NextResponse.next();

  // so protege /admin, /painel e /api/* (o resto — home "/" — passa e redireciona)
  const ehAdmin = pathname.startsWith("/admin");
  const ehPainel = pathname.startsWith("/painel");
  const ehApi = pathname.startsWith("/api");
  if (!ehAdmin && !ehPainel && !ehApi) return NextResponse.next();

  const sessao = await lerSessao(req.cookies.get(COOKIE_NOME)?.value);

  // sem sessao -> API 401, pagina redireciona pro login
  if (!sessao) {
    if (ehApi) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // /admin/* exige papel admin
  if (ehAdmin && sessao.papel !== "admin") {
    if (ehApi) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/painel"; // clinica vai pro painel dela
    return NextResponse.redirect(url);
  }

  // Sessao valida: segue. (Os handlers releem a sessao do cookie via
  // lib/sessao.ts — que tambem revalida contra o banco. Antes setavamos
  // x-papel/x-conta-id/x-clinica-id aqui, mas em headers de RESPOSTA: nenhum
  // handler recebia (codigo morto) e os IDs internos vazavam pro browser.)
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
