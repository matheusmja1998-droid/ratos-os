// Resumo da conversa pro card da secretaria — gerado pela IA UMA vez e
// guardado em pacientes.resumo (cache). So regenera quando a conversa andou
// depois do ultimo resumo, entao abrir a conversa mostra o resumo NA HORA e
// o custo de API e ~1 centavo por conversa que mudou, nao por abertura.

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELO } from "./claude";
import { getPacientePorTelefone, historicoConversa, salvarResumoPaciente } from "./db";

// timestamp do banco (sqlite "YYYY-MM-DD HH:MM:SS" utc / pg ISO) -> epoch ms
function paraMs(ts?: string | null): number {
  if (!ts) return 0;
  const s = String(ts);
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Devolve o resumo da conversa (cache ou recem-gerado).
 * ultimaMsgEm: timestamp da mensagem mais recente (a pagina ja tem isso).
 * Retorna null se nao da pra resumir (pouca conversa, sem API key, erro) —
 * o card mostra so os dados deterministicos e nada quebra.
 */
export async function resumoDaConversa(
  clinicaId: string,
  telefone: string,
  ultimaMsgEm?: string
): Promise<string | null> {
  try {
    const pac = await getPacientePorTelefone(clinicaId, telefone);
    if (!pac) return null;

    // cache valido: resumo existe e foi gerado DEPOIS da ultima mensagem
    if (pac.resumo && paraMs(pac.resumo_atualizado_em) >= paraMs(ultimaMsgEm)) {
      return pac.resumo;
    }

    const historico = await historicoConversa(clinicaId, telefone, 40);
    if (historico.length < 3) return pac.resumo || null; // pouco papo pra resumir

    const conversa = historico
      .map((m: any) => `${m.role === "user" ? "PACIENTE" : "IA"}: ${m.conteudo}`)
      .join("\n");

    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 300,
      system:
        "Voce resume conversas de WhatsApp entre a IA de uma clinica e um paciente, pra secretaria bater o olho e entender. Responda SO com 2 a 4 linhas curtas, cada uma comecando com '• '. Cubra: o que o paciente relatou/queixa, o que pediu, convenio ou particular (se falou), e o que ficou combinado (consulta marcada/alterada/cancelada, com data se houver). Sem introducao, sem markdown alem dos bullets, portugues direto.",
      messages: [{ role: "user", content: `Conversa:\n\n${conversa.slice(0, 8000)}` }],
    });

    const texto = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!texto) return pac.resumo || null;

    await salvarResumoPaciente(pac.id, texto).catch(() => {}); // cache best-effort
    return texto;
  } catch (e: any) {
    console.warn("[resumo] falhou (card segue sem resumo):", e.message);
    return null;
  }
}
