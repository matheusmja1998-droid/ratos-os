"use client";
import { useState } from "react";
import Link from "next/link";

const BASE = 100, POR_WHATS = 20;

export default function AssinaturaCliente({ plano, ativa, temAssinatura }: any) {
  const [extra, setExtra] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const total = BASE + extra * POR_WHATS;
  const whatsTotal = 1 + extra;

  async function assinar() {
    setCarregando(true);
    const r = await fetch("/api/stripe/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsappsExtra: extra }),
    });
    const d = await r.json().catch(() => ({}));
    setCarregando(false);
    if (d.url) window.location.href = d.url;
    else alert(d.erro || "erro ao iniciar pagamento");
  }
  async function gerenciar() {
    const r = await fetch("/api/stripe/portal", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (d.url) window.location.href = d.url;
    else alert(d.erro || "erro");
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/painel" style={{ color: "#6cc24a", textDecoration: "none" }}>← painel</Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>Assinatura</h1>
      </header>

      <div style={card}>
        {plano === "ativo" && temAssinatura ? (
          <>
            <div style={{ fontSize: 15, marginBottom: 6 }}>✅ Assinatura ativa</div>
            <p style={{ color: "#9aa4bd", fontSize: 14 }}>Você pode trocar o cartão, mudar o nº de WhatsApp ou cancelar no portal.</p>
            <button style={btn} onClick={gerenciar}>Gerenciar assinatura</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Plano Prospecta</div>
            <p style={{ color: "#9aa4bd", fontSize: 14, margin: "0 0 16px" }}>
              R${BASE}/mês (inclui 1 WhatsApp) + R${POR_WHATS}/mês por WhatsApp extra.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 14 }}>WhatsApps:</span>
              <button style={ctrl} onClick={() => setExtra(Math.max(0, extra - 1))}>−</button>
              <b style={{ fontSize: 18, minWidth: 20, textAlign: "center" }}>{whatsTotal}</b>
              <button style={ctrl} onClick={() => setExtra(Math.min(9, extra + 1))}>+</button>
            </div>

            <div style={{ fontSize: 30, fontWeight: 800, color: "#6cc24a", marginBottom: 4 }}>R${total}<span style={{ fontSize: 15, color: "#9aa4bd", fontWeight: 400 }}>/mês</span></div>
            <p style={{ color: "#8b93a7", fontSize: 12.5, margin: "0 0 16px" }}>
              {plano === "trial" ? "Você está no trial. Assinando, continua sem interrupção." : ""}
            </p>

            {ativa ? (
              <button style={btn} onClick={assinar} disabled={carregando}>
                {carregando ? "abrindo pagamento…" : "Assinar agora"}
              </button>
            ) : (
              <div style={{ padding: "10px 12px", background: "#0f1424", borderRadius: 8, fontSize: 13, color: "#8b93a7" }}>
                💳 A cobrança ainda não foi ativada pelo administrador. Em breve.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#141a2e", border: "1px solid #232b45", borderRadius: 14, padding: 24 };
const btn: React.CSSProperties = { width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#6cc24a", color: "#0b1020", fontWeight: 700, fontSize: 15, cursor: "pointer" };
const ctrl: React.CSSProperties = { width: 34, height: 34, borderRadius: 8, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 18, cursor: "pointer" };
