"use client";

import { useState } from "react";
import { IconeAlerta, IconeX } from "../Icones";

// Popup fechavel avisando que o WhatsApp da clinica esta DESCONECTADO —
// sem ele conectado, nada que o atendente enviar pela tela chega no paciente.
export default function AvisoDesconectado({ clinicaId, usaParam }: { clinicaId: string; usaParam: boolean }) {
  const [aberto, setAberto] = useState(true);
  if (!aberto) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 20,
        display: "grid",
        placeItems: "center",
        zIndex: 80,
        pointerEvents: "none",
        padding: "0 16px",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          maxWidth: 640,
          padding: "14px 18px",
          borderRadius: 14,
          background: "var(--danger-bg)",
          border: "1px solid var(--danger)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
        }}
      >
        <span style={{ display: "grid", placeItems: "center", color: "var(--danger)" }}><IconeAlerta size={19} /></span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--danger)" }}>
            WhatsApp desconectado
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2 }}>
            As mensagens, áudios e arquivos enviados pela tela NÃO vão chegar no paciente até
            reconectar o número da clínica.
          </div>
        </div>
        <a
          href={`/painel/conectar${usaParam ? `?clinica=${clinicaId}` : ""}`}
          className="btn-primario"
          style={{ padding: "9px 16px", fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          Conectar agora
        </a>
        <button
          onClick={() => setAberto(false)}
          className="btn-fantasma"
          aria-label="fechar aviso"
          style={{ padding: "7px 11px", fontSize: 13 }}
        >
          <IconeX size={14} />
        </button>
      </div>
    </div>
  );
}
