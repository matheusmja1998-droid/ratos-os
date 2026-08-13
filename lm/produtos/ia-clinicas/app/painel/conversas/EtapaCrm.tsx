"use client";

import Link from "next/link";
import { useState } from "react";
import { IconeKanban } from "../Icones";

// Em que ponto do funil esse paciente esta, direto no topo da conversa.
// Trocar aqui move o card no quadro do CRM na hora (e vice-versa: arrastar no
// quadro reflete aqui). O botao ao lado abre o quadro pra ver o contexto.

const ETAPAS = [
  { id: "novo", rotulo: "Novo contato", cor: "#64748b" },
  { id: "atendimento", rotulo: "Em atendimento", cor: "#2563eb" },
  { id: "agendado", rotulo: "Agendado", cor: "#ca8a04" },
  { id: "cliente", rotulo: "Cliente", cor: "#16a34a" },
  { id: "perdido", rotulo: "Perdido", cor: "#dc2626" },
];

export default function EtapaCrm({
  clinicaId,
  telefone,
  etapaInicial,
  sufClinica,
}: {
  clinicaId: string;
  telefone: string;
  etapaInicial: string;
  /** "&clinica=ID" quando o admin inspeciona outra clinica; "" pra conta clinica */
  sufClinica: string;
}) {
  const [etapa, setEtapa] = useState(etapaInicial || "novo");
  const [salvando, setSalvando] = useState(false);
  const atual = ETAPAS.find((e) => e.id === etapa) || ETAPAS[0];
  // o sufixo vem no formato "&clinica=ID" (pra colar em URL que ja tem query).
  // Aqui a URL comeca limpa, entao o primeiro parametro precisa do "?".
  const hrefCrm = "/painel/crm" + (sufClinica ? "?" + sufClinica.replace(/^&/, "") : "");

  async function mudar(novo: string) {
    const anterior = etapa;
    setEtapa(novo); // otimista
    setSalvando(true);
    try {
      const res = await fetch("/api/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, telefone, crm: { etapa: novo } }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEtapa(anterior); // falhou: volta pro que era (nao mente o estado)
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <select
        value={etapa}
        onChange={(e) => mudar(e.target.value)}
        disabled={salvando}
        title="Etapa do paciente no funil (CRM)"
        aria-label="Etapa do paciente no funil"
        style={{
          appearance: "none",
          border: "1px solid " + atual.cor,
          color: atual.cor,
          background: "transparent",
          borderRadius: 20,
          fontSize: 12.5,
          fontWeight: 700,
          padding: "6px 12px",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {ETAPAS.map((e) => (
          <option key={e.id} value={e.id} style={{ color: "var(--text)", background: "var(--surface)" }}>
            {e.rotulo}
          </option>
        ))}
      </select>
      <Link
        href={hrefCrm}
        className="btn-fantasma"
        title="Ver esse paciente no quadro do CRM"
        aria-label="Ver no quadro do CRM"
        style={{ padding: "6px 9px", display: "grid", placeItems: "center" }}
      >
        <IconeKanban size={16} />
      </Link>
    </div>
  );
}
