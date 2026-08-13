"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconeLixeira } from "../painel/Icones";

// Botao de REMOVER CLINICA (so no painel admin). Irreversivel: apaga conversas,
// consultas, pacientes, contas de acesso e numeros de WhatsApp da clinica.
// Confirmacao dupla: precisa DIGITAR o nome exato da clinica.
export default function BotaoRemoverClinica({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState("");

  async function remover() {
    const digitado = prompt(
      `REMOVER A CLÍNICA "${nome}"?\n\nIsso apaga TUDO dela: conversas, consultas, pacientes, contas de acesso e números de WhatsApp. Não tem volta.\n\nPra confirmar, digita o nome exato da clínica:`
    );
    if (digitado === null) return; // cancelou
    setErro("");
    setRemovendo(true);
    try {
      const res = await fetch("/api/admin/clinicas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, confirmar_nome: digitado }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || "erro ao remover");
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={remover}
        disabled={removendo}
        className="btn-fantasma"
        title="Remove a clínica e todos os dados dela (pede confirmação)"
        style={{ padding: "6px 12px", fontSize: 13, color: "var(--danger)", borderColor: "var(--danger)", whiteSpace: "nowrap" }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{removendo ? "Removendo..." : <><IconeLixeira size={14} /> remover</>}</span>
      </button>
      {erro && <span style={{ color: "var(--danger)", fontSize: 12 }}>{erro}</span>}
    </span>
  );
}
