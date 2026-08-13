"use client";

import { useState } from "react";

// Botao (admin) que gera o link de cobranca da assinatura de uma clinica.
// Chama /api/stripe/checkout e redireciona pro checkout do Stripe.
export default function BotaoCobranca({ clinicaId }: { clinicaId: string }) {
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState("");

  async function gerar() {
    setCarregando(true);
    setMsg("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicaId }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank");
      } else {
        setMsg(data.erro || "falha ao gerar cobranca");
      }
    } catch (e: any) {
      setMsg(e.message);
    }
    setCarregando(false);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={gerar}
        disabled={carregando}
        style={{
          background: "transparent",
          color: "var(--link)",
          border: "1px solid var(--border-forte)",
          padding: "6px 12px",
          borderRadius: 8,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {carregando ? "gerando..." : "gerar cobrança"}
      </button>
      {msg && <span style={{ color: "var(--muted)", fontSize: 12 }}>{msg}</span>}
    </span>
  );
}
