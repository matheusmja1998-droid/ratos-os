"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function WhatsappCliente() {
  const [insts, setInsts] = useState<any[]>([]);
  const [limite, setLimite] = useState(1);
  const [qr, setQr] = useState<{ id: string; img: string } | null>(null);
  const [msg, setMsg] = useState("");

  async function carregar() {
    const r = await fetch("/api/instancias");
    const d = await r.json();
    setInsts(d.instancias || []); setLimite(d.limite || 1);
  }
  useEffect(() => { carregar(); const t = setInterval(carregar, 8000); return () => clearInterval(t); }, []);

  async function adicionar() {
    const r = await fetch("/api/instancias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const d = await r.json();
    if (!r.ok) return setMsg(d.erro || "erro");
    setMsg(""); carregar();
  }
  async function remover(id: string) {
    if (!confirm("Remover esse WhatsApp?")) return;
    await fetch(`/api/instancias?id=${id}`, { method: "DELETE" });
    carregar();
  }
  async function conectar(id: string) {
    setQr({ id, img: "" }); setMsg("gerando QR…");
    const r = await fetch(`/api/qr?id=${id}`);
    const d = await r.json();
    setMsg("");
    if (d.qrcode) setQr({ id, img: d.qrcode });
    else { setQr(null); setMsg(d.status === "connected" ? "✅ conectado!" : `status: ${d.status || d.erro}`); carregar(); }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/painel" style={{ color: "#6cc24a", textDecoration: "none" }}>← painel</Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>Meus WhatsApp</h1>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#8b93a7" }}>{insts.length} de {limite} (plano)</span>
      </header>

      {insts.map((i) => (
        <div key={i.id} style={{ ...card, display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: i.status === "conectado" ? "#6cc24a" : "#6b2020" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{i.nome}</div>
            <div style={{ fontSize: 12.5, color: "#8b93a7" }}>{i.numero || "não conectado"} · {i.status}</div>
          </div>
          <button style={btnSec} onClick={() => conectar(i.id)}>{i.status === "conectado" ? "reconectar" : "conectar (QR)"}</button>
          <button style={{ ...btnSec, borderColor: "#6b2020", color: "#ff9b9b" }} onClick={() => remover(i.id)}>remover</button>
        </div>
      ))}

      {insts.length < limite && (
        <button style={btn} onClick={adicionar}>+ Adicionar WhatsApp</button>
      )}
      {insts.length >= limite && (
        <div style={{ ...card, fontSize: 13.5, color: "#9aa4bd" }}>
          Você atingiu o limite do seu plano ({limite}). <Link href="/painel/assinatura" style={{ color: "#6cc24a" }}>aumentar →</Link> (R$20/mês por WhatsApp)
        </div>
      )}
      {msg && <div style={{ marginTop: 12, fontSize: 14, color: "#9aa4bd" }}>{msg}</div>}

      {qr && qr.img && (
        <div style={{ ...card, marginTop: 16, textAlign: "center" }}>
          <img src={qr.img} style={{ width: 240, height: 240 }} alt="QR" />
          <p style={{ fontSize: 13, color: "#8b93a7" }}>WhatsApp → Aparelhos conectados → Conectar aparelho</p>
          <button style={btnSec} onClick={() => conectar(qr.id)}>🔄 novo QR</button>
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "#141a2e", border: "1px solid #232b45", borderRadius: 12, padding: 16 };
const btn: React.CSSProperties = { width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#6cc24a", color: "#0b1020", fontWeight: 700, fontSize: 15, cursor: "pointer" };
const btnSec: React.CSSProperties = { padding: "7px 12px", borderRadius: 8, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 13, cursor: "pointer" };
