"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Botao "Iniciar trial" no card da clinica (admin). Grava trial_inicio=agora
// e o card passa a mostrar a contagem dos 14 dias.
export default function BotaoIniciarTrial({ clinicaId, nome }: { clinicaId: string; nome: string }) {
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  async function iniciar() {
    if (!confirm(`Iniciar o trial de 14 dias da ${nome} agora?`)) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/clinicas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, acao: "iniciar_trial" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      router.refresh();
    } catch (e: any) {
      alert(e?.message || "erro ao iniciar o trial");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <button
      className="btn-primario"
      onClick={iniciar}
      disabled={salvando}
      style={{ padding: "7px 14px", fontSize: 13 }}
    >
      {salvando ? "Iniciando..." : "Iniciar trial"}
    </button>
  );
}
