// Helpers server-side pra ler a sessao dentro de Server Components e rotas.
// (o middleware ja validou HMAC+expiracao; aqui validamos tambem contra o
// banco: conta ainda ativa E versao da sessao bate — assim desativar a conta
// ou incrementar contas.sessao_versao DERRUBA sessoes ja emitidas, o que
// antes era impossivel: cookie capturado valia pra sempre.)
import { cookies } from "next/headers";
import { COOKIE_NOME, lerSessao, type Sessao } from "./auth";
import { getContaPorId } from "./db";

export async function sessaoAtual(): Promise<Sessao | null> {
  const jar = await cookies();
  const s = await lerSessao(jar.get(COOKIE_NOME)?.value);
  if (!s) return null;
  // revalida contra o banco (revogacao): conta sumiu/desativada ou versao
  // mudou = sessao morta. FAIL-CLOSED aqui (e o gate de dados de paciente).
  try {
    const conta = await getContaPorId(s.contaId);
    if (!conta || !(conta.ativo === true || conta.ativo === 1)) return null;
    if (Number(conta.sessao_versao ?? 1) !== s.versao) return null;
  } catch (e: any) {
    console.error("[sessao] revalidacao no banco falhou:", e.message);
    return null;
  }
  return s;
}

// exige uma sessao (usar em rotas ja protegidas pelo middleware)
export async function exigirSessao(): Promise<Sessao> {
  const s = await sessaoAtual();
  if (!s) throw new Error("sem sessao");
  return s;
}

// Resolve qual clinica a sessao pode operar, com ISOLAMENTO:
//  - admin: pode operar a clinica pedida (clinicaPedida) ou qualquer uma
//  - clinica: SEMPRE a propria (sessao.clinicaId), ignorando o que foi pedido.
//    Se pediu outra clinica, retorna null (acesso negado).
// Retorna o clinicaId permitido, ou null se negado.
export async function clinicaPermitida(clinicaPedida?: string | null): Promise<string | null> {
  const s = await sessaoAtual();
  if (!s) return null;
  if (s.papel === "admin") return clinicaPedida ?? null;
  // conta clinica: so a dela
  if (!s.clinicaId) return null;
  if (clinicaPedida && clinicaPedida !== s.clinicaId) return null; // tentou outra -> nega
  return s.clinicaId;
}
