"use client";
import { useState } from "react";
import Link from "next/link";

export default function ConfigCliente({ temChave }: { temChave: boolean }) {
  const [chave, setChave] = useState("");
  const [status, setStatus] = useState<"idle" | "validando" | "ok" | "erro">(temChave ? "ok" : "idle");
  const [msg, setMsg] = useState(temChave ? "chave configurada ✅" : "");

  async function salvar() {
    setStatus("validando"); setMsg("validando a chave com a Anthropic…");
    const r = await fetch("/api/anthropic", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setStatus("ok"); setMsg("chave válida e salva com segurança ✅"); setChave(""); }
    else { setStatus("erro"); setMsg(d.erro || "erro ao validar"); }
  }
  async function remover() {
    await fetch("/api/anthropic", { method: "DELETE" });
    setStatus("idle"); setMsg(""); setChave("");
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/painel" style={{ color: "#6cc24a", textDecoration: "none" }}>← painel</Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>Configurações</h1>
      </header>

      <div style={card}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>🔑 Sua chave da Anthropic (IA)</h2>
        <p style={{ color: "#9aa4bd", fontSize: 14, lineHeight: 1.5 }}>
          O Prospecta usa a <b>sua</b> conta da Anthropic pra IA conversar. Você paga só o que
          usar (centavos por conversa), direto pra Anthropic. Leva 3 minutos pra configurar:
        </p>

        <ol style={{ color: "#c5cde0", fontSize: 14, lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Acesse <a href="https://console.anthropic.com/settings/keys" target="_blank" style={lk}>console.anthropic.com → API Keys</a></li>
          <li>Crie a conta (se não tiver) e adicione um crédito inicial em <b>Billing</b> (ex: US$5 já roda muita conversa)</li>
          <li>Clique em <b>Create Key</b>, dê um nome (ex: "Prospecta") e <b>copie</b> a chave (começa com <code style={code}>sk-ant-</code>)</li>
          <li>Cole aqui embaixo e salve. A gente valida na hora.</li>
        </ol>

        {status !== "ok" ? (
          <>
            <input
              style={inp} placeholder="sk-ant-api03-..." value={chave}
              onChange={(e) => setChave(e.target.value)} autoComplete="off"
            />
            <button style={btn} onClick={salvar} disabled={status === "validando" || !chave}>
              {status === "validando" ? "validando…" : "Validar e salvar"}
            </button>
          </>
        ) : (
          <button style={{ ...btn, background: "none", border: "1px solid #2a3350", color: "#e8ecf5" }} onClick={remover}>
            trocar chave
          </button>
        )}

        {msg && (
          <div style={{ marginTop: 12, fontSize: 14, color: status === "erro" ? "#ff6b6b" : status === "ok" ? "#6cc24a" : "#9aa4bd" }}>
            {msg}
          </div>
        )}

        <div style={{ marginTop: 18, padding: "10px 12px", background: "#0f1424", borderRadius: 8, fontSize: 12.5, color: "#8b93a7" }}>
          🔒 Sua chave fica criptografada no nosso banco e nunca aparece na tela de novo.
          Você pode revogá-la a qualquer momento no console da Anthropic.
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#141a2e", border: "1px solid #232b45", borderRadius: 14, padding: 22 };
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 14px", margin: "6px 0 12px", borderRadius: 10, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 14, fontFamily: "monospace" };
const btn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: "#6cc24a", color: "#0b1020", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const lk: React.CSSProperties = { color: "#6cc24a" };
const code: React.CSSProperties = { background: "#0f1424", padding: "1px 5px", borderRadius: 4, fontSize: 12.5 };
