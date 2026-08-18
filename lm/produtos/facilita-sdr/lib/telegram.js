// Alertas no Telegram (lead quente, reuniao marcada, erro, chip caiu).
// Vai pra TODOS os chats cadastrados: o do .env (Matheus) + os extras salvos na
// config `telegram_chats_extras` (Valentino e quem mais mandar /start pro bot
// e for adicionado em Configuracoes > Notificacoes).
import { getConfig } from "./db.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const escaparHTML = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function chatsDestino() {
  const extras = String(getConfig("telegram_chats_extras", "") || "")
    .split(",").map((c) => c.trim()).filter(Boolean);
  return [...new Set([CHAT_ID, ...extras].filter(Boolean))];
}

export async function alertar(texto) {
  const chats = chatsDestino();
  if (!TOKEN || !chats.length) { console.log("[telegram DEMO]", texto); return false; }
  let algumOk = false;
  for (const chat of chats) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: escaparHTML(texto), parse_mode: "HTML" }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) algumOk = true;
      else console.warn(`[telegram] falha no chat ${chat}:`, res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.warn(`[telegram] erro no chat ${chat}:`, e.message);
    }
  }
  return algumOk;
}

// quem mandou mensagem pro bot recentemente (pra descobrir o chat_id de quem
// quer receber os alertas — a pessoa manda /start e aparece aqui)
export async function chatsRecentes() {
  if (!TOKEN) return [];
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`, { signal: AbortSignal.timeout(10_000) });
    const d = await res.json().catch(() => null);
    if (!d?.ok) return [];
    const vistos = new Map();
    for (const u of d.result || []) {
      const c = u.message?.chat || u.my_chat_member?.chat;
      if (c?.id) vistos.set(String(c.id), { id: String(c.id), nome: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.title || c.username || String(c.id) });
    }
    return [...vistos.values()];
  } catch {
    return [];
  }
}
