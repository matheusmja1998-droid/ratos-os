// Alertas no Telegram do Matheus (lead quente, reuniao marcada, erro, chip caiu).
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const escaparHTML = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function alertar(texto) {
  if (!TOKEN || !CHAT_ID) { console.log("[telegram DEMO]", texto); return false; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: escaparHTML(texto), parse_mode: "HTML" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn("[telegram] falha:", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.warn("[telegram] erro:", e.message);
    return false;
  }
}
