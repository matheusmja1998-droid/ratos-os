"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Botao pra desconectar (logout) um numero de WhatsApp. Pede confirmacao,
// chama PATCH /api/instancias e recarrega a lista. So aparece pra numero on.
export default function BotaoDesconectar({ id }: { id: string }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function desconectar() {
    if (!confirm("Desconectar esse número? A IA para de atender por ele até você reconectar pelo QR.")) return;
    setErro("");
    setCarregando(true);
    try {
      const res = await fetch("/api/instancias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao: "desconectar" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não consegui desconectar");
      router.refresh(); // atualiza a lista sem recarregar a pagina
      setCarregando(false);
    } catch (e: any) {
      setErro(e?.message || "erro");
      setCarregando(false);
    }
  }

  return (
    <>
      <button
        onClick={desconectar}
        disabled={carregando}
        className="btn-fantasma"
        style={{ padding: "6px 12px", fontSize: 13, flexShrink: 0, color: "var(--danger)", borderColor: "var(--danger)" }}
      >
        {carregando ? "..." : "desconectar"}
      </button>
      {erro && <span style={{ color: "var(--danger)", fontSize: 12 }}>{erro}</span>}
    </>
  );
}
