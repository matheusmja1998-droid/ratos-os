"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconeLixeira } from "../Icones";

// Botao pra REMOVER um numero da lista de vez (numero que nao e da clinica ou
// que nao esta mais em uso). Diferente do desconectar: faz logout + delete na
// uazapi e apaga o registro do banco. Aparece pra todo numero.
export default function BotaoRemover({ id, rotulo }: { id: string; rotulo: string }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function remover() {
    if (!confirm(`Remover ${rotulo} da clínica? O número sai da lista e a IA para de atender por ele. Dá pra conectar de novo depois se precisar.`)) return;
    setErro("");
    setCarregando(true);
    try {
      const res = await fetch("/api/instancias", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.erro || "não consegui remover");
      router.refresh();
      setCarregando(false);
    } catch (e: any) {
      setErro(e?.message || "erro");
      setCarregando(false);
    }
  }

  return (
    <>
      <button
        onClick={remover}
        disabled={carregando}
        className="btn-fantasma"
        style={{ padding: "6px 12px", fontSize: 13, flexShrink: 0, color: "var(--danger)", borderColor: "var(--danger)" }}
        title="Remover esse número da clínica"
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{carregando ? "..." : <><IconeLixeira size={14} /> remover</>}</span>
      </button>
      {erro && <span style={{ color: "var(--danger)", fontSize: 12 }}>{erro}</span>}
    </>
  );
}
