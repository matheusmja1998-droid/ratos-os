// Alertas via Telegram — usado quando a IA passa pra humano e quando algo
// falha em producao (webhook/cron). Opcional: sem as env vars, vira console.log.
//
// Configurar no .env:
//   TELEGRAM_BOT_TOKEN=...   (bot do BotFather)
//   TELEGRAM_CHAT_ID=...     (chat que recebe os alertas)

import { getClinica, historicoConversa } from "./db";

const BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT = process.env.TELEGRAM_CHAT_ID || "";

// escapa entidades HTML pro Telegram (parse_mode HTML): sem isso, conteudo de
// paciente com "<"/"&" faz o Telegram rejeitar a mensagem inteira (400 "can't
// parse entities") e o alerta morre em silencio — inclusive o de handoff pra
// humano, que e o mais critico de perder.
function escaparHTML(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function enviarAlerta(texto: string): Promise<void> {
  if (!BOT || !CHAT) {
    console.log(`[ALERTA] ${texto}`);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text: texto, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // NAO engole: se o alerta nao saiu (ex: HTML mal formado apos escape,
      // bot removido do chat), pelo menos fica no log do servidor.
      const corpo = await res.text().catch(() => "");
      console.error(`[alertas] Telegram recusou (HTTP ${res.status}): ${corpo.slice(0, 300)}`);
    }
  } catch (e: any) {
    console.error("[alertas] falha ao enviar:", e.message);
  }
}

// Aviso de que um paciente precisa de atendente humano, com contexto.
export async function alertarHumano(params: {
  clinicaId: string;
  telefone: string;
  motivo: string;
}): Promise<void> {
  const clinica = await getClinica(params.clinicaId).catch(() => null);
  const hist = await historicoConversa(params.clinicaId, params.telefone, 6).catch(() => []);
  const ultimas = hist
    .map((m: any) => `${m.role === "user" ? "👤" : "🤖"} ${escaparHTML(m.conteudo)}`)
    .join("\n");
  const msg =
    `🙋 <b>Atendimento humano solicitado</b>\n` +
    `Clinica: ${escaparHTML(clinica?.nome || params.clinicaId)}\n` +
    `Paciente: ${escaparHTML(params.telefone)}\n` +
    `Motivo: ${escaparHTML(params.motivo)}\n\n` +
    `Ultimas mensagens:\n${ultimas || "(sem historico)"}`;
  await enviarAlerta(msg);
}

// Aviso de erro em producao (webhook/cron).
export async function alertarErro(onde: string, erro: any): Promise<void> {
  const msg = `🔴 <b>Erro em ${escaparHTML(onde)}</b>\n${escaparHTML(String(erro?.message || erro).slice(0, 500))}`;
  await enviarAlerta(msg);
}
