// Sessao server-side do Prospecta. Le o cookie, valida HMAC+expiracao (auth.ts)
// e revalida contra o banco (conta ativa + sessao_versao). Fail-closed.
import { cookies } from "next/headers";
import { COOKIE_NOME, lerSessao, type Sessao } from "./auth";
import { contaPorId } from "./db";

export async function sessaoAtual(): Promise<Sessao | null> {
  const cookie = (await cookies()).get(COOKIE_NOME)?.value;
  const s = await lerSessao(cookie);
  if (!s) return null;
  const conta = await contaPorId(s.contaId);
  if (!conta || !conta.ativo) return null;
  if (Number(conta.sessao_versao ?? 1) !== s.versao) return null; // sessao revogada
  return s;
}

// helper pra rotas de API: exige sessao ou lanca 401
export async function exigirConta(): Promise<Sessao> {
  const s = await sessaoAtual();
  if (!s) throw new Response(JSON.stringify({ erro: "nao autenticado" }), { status: 401 });
  return s;
}
