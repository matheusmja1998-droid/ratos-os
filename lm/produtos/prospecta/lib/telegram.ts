// Alerta no Telegram POR CONTA (cada cliente pode configurar o dele, opcional).
// Token/chat vem da config da conta (chaves telegram_token / telegram_chat).
import { getConfigMuitas } from "./db";

const escaparHTML = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function alertar(contaId: string, texto: string): Promise<boolean> {
  const cfg = await getConfigMuitas(contaId, ["telegram_token", "telegram_chat"]);
  const token = cfg.telegram_token, chat = cfg.telegram_chat;
  if (!token || !chat) return false; // conta sem Telegram configurado = silencioso
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: escaparHTML(texto), parse_mode: "HTML" }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch { return false; }
}
