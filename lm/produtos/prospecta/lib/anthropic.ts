// IA por conta. Cada cliente pagante traz o token dele (paga os proprios tokens).
// Conta interna (Matheus/Valentino) usa o plano da VPS via `claude -p` — mas no
// SaaS Vercel nao roda `claude -p`, entao a conta interna tambem precisa de uma
// chave (ou usa uma chave da agencia setada em env). Modelo: Haiku (barato).
import Anthropic from "@anthropic-ai/sdk";
import { contaPorId } from "./db";
import { decifrar } from "./auth";

export const MODELO = process.env.PROSPECTA_MODELO || "claude-haiku-4-5-20251001";

// Valida uma chave fazendo UMA chamada minima. Retorna {ok, erro?}.
export async function validarChave(chave: string): Promise<{ ok: boolean; erro?: string }> {
  if (!chave || !chave.startsWith("sk-ant-")) return { ok: false, erro: "formato inválido (a chave começa com sk-ant-)" };
  try {
    const client = new Anthropic({ apiKey: chave });
    await client.messages.create({
      model: MODELO, max_tokens: 5, messages: [{ role: "user", content: "oi" }],
    });
    return { ok: true };
  } catch (e: any) {
    const msg = String(e?.error?.error?.message || e?.message || "erro");
    if (/authentication|invalid.*api.*key|401/i.test(msg)) return { ok: false, erro: "chave inválida ou revogada" };
    if (/credit|billing|quota|429/i.test(msg)) return { ok: false, erro: "chave sem saldo (recarregue em console.anthropic.com)" };
    return { ok: false, erro: msg.slice(0, 120) };
  }
}

// Retorna um client Anthropic pronto pra conta (decifra o token guardado).
// Conta sem chave -> null (o chamador decide o que fazer).
export async function clientDaConta(contaId: string): Promise<Anthropic | null> {
  const conta = await contaPorId(contaId);
  if (!conta?.anthropic_key) return null;
  const chave = await decifrar(conta.anthropic_key);
  if (!chave) return null;
  return new Anthropic({ apiKey: chave });
}
