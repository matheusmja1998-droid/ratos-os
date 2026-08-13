"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function TestarCliente({ temChave }: { temChave: boolean }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);

  async function carregar() {
    const r = await fetch("/api/simular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const d = await r.json();
    setMsgs(d.mensagens || []);
  }
  useEffect(() => { carregar(); }, []);

  async function enviar() {
    if (!texto.trim()) return;
    const t = texto; setTexto(""); setPensando(true);
    setMsgs((p) => [...p, { role: "user", texto: t }]);
    const r = await fetch("/api/simular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: t }) });
    const d = await r.json();
    setPensando(false);
    setMsgs(d.mensagens || []);
  }
  async function reiniciar() {
    await fetch("/api/simular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true }) });
    carregar();
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href="/painel" style={{ color: "#6cc24a", textDecoration: "none" }}>← painel</Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>🧪 Testar minha IA</h1>
        <button style={btnSec} onClick={reiniciar}>reiniciar</button>
      </header>

      {!temChave && (
        <div style={{ ...card, marginBottom: 12, color: "#f0c674", fontSize: 14 }}>
          ⚠️ Você ainda não conectou sua chave da Anthropic. <Link href="/painel/config" style={{ color: "#6cc24a" }}>configurar →</Link>
        </div>
      )}

      <div style={{ ...card, minHeight: 380, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
          {msgs.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-start" : "flex-end",
              maxWidth: "78%", padding: "8px 12px", borderRadius: 12, fontSize: 14, whiteSpace: "pre-wrap",
              background: m.role === "user" ? "#232b45" : "#1f3d2a", color: "#e8ecf5",
            }}>{m.texto}</div>
          ))}
          {pensando && <div style={{ alignSelf: "flex-end", color: "#8b93a7", fontSize: 13 }}>IA pensando…</div>}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <textarea style={inp} rows={2} placeholder="responda como se fosse o lead…" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
          <button style={btn} onClick={enviar} disabled={pensando}>Enviar</button>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: "#8b93a7", marginTop: 10 }}>
        Aqui você conversa com a SUA IA do jeito que ela vai falar com os leads. Ajuste o <Link href="/painel/cerebro" style={{ color: "#6cc24a" }}>cérebro</Link> e teste de novo.
      </p>
    </div>
  );
}
const card: React.CSSProperties = { background: "#141a2e", border: "1px solid #232b45", borderRadius: 12, padding: 16 };
const inp: React.CSSProperties = { flex: 1, boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 14, fontFamily: "inherit", resize: "none" };
const btn: React.CSSProperties = { padding: "0 18px", borderRadius: 9, border: "none", background: "#6cc24a", color: "#0b1020", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const btnSec: React.CSSProperties = { marginLeft: "auto", padding: "6px 12px", borderRadius: 8, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 13, cursor: "pointer" };
