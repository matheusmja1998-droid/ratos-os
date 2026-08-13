"use client";

import { useState } from "react";
import IntegracaoFeegow from "./IntegracaoFeegow";
import IntegracaoClinicorp from "./IntegracaoClinicorp";
import IntegracaoKlingo from "./IntegracaoKlingo";
import IntegracaoGoogleCalendar from "./IntegracaoGoogleCalendar";

// Vitrine de integracoes estilo marketplace (tile com logo + nome + botao),
// igual as lojas de apps de CRM: clica no tile e abre SO a integracao
// selecionada logo abaixo. Adicionar integracao nova = 1 entrada em TILES.

type Prof = { id: string; nome: string; especialidade?: string | null; gcal_conectado?: boolean; gcal_email?: string | null };

const TILES = [
  {
    chave: "feegow",
    nome: "Feegow Clinic",
    logo: "/feegow-logo.jpeg",
    descricao: "Agenda médica unificada",
  },
  {
    chave: "clinicorp",
    nome: "Clinicorp",
    logo: "/clinicorp-logo.jpeg",
    descricao: "Agenda odontológica unificada",
  },
  {
    chave: "klingo",
    nome: "Klingo",
    logo: "/klingo-logo.png",
    descricao: "Agenda unificada de saúde",
  },
  {
    chave: "gcal",
    nome: "Google Calendar",
    logo: "/google-calendar-logo.jpeg",
    descricao: "Agenda do Google por médico",
  },
] as const;

type Chave = (typeof TILES)[number]["chave"];

export default function IntegracoesGrid({
  clinicaId,
  profissionais,
  status,
}: {
  clinicaId: string;
  profissionais: Prof[];
  status: Record<Chave, boolean>; // true = conectada/ativa
}) {
  const [aberta, setAberta] = useState<Chave | null>(null);

  return (
    <div>
      {/* vitrine */}
      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          gap: 14,
        }}
      >
        {TILES.map((t) => {
          const on = status[t.chave];
          const selecionada = aberta === t.chave;
          return (
            <button
              key={t.chave}
              onClick={() => setAberta(selecionada ? null : t.chave)}
              style={{
                textAlign: "left",
                background: "var(--surface)",
                border: selecionada ? "2px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: 14,
                padding: 0,
                overflow: "hidden",
                cursor: "pointer",
                boxShadow: "var(--sombra)",
                fontFamily: "inherit",
              }}
            >
              {/* area da logo */}
              <div
                style={{
                  height: 96,
                  display: "grid",
                  placeItems: "center",
                  background: "#fff",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.logo}
                  alt={t.nome}
                  style={{ maxHeight: 64, maxWidth: "78%", objectFit: "contain", borderRadius: 10 }}
                />
              </div>
              {/* nome + status */}
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{t.nome}</div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2, minHeight: 16 }}>
                  {t.descricao}
                </div>
                <div style={{ marginTop: 10 }}>
                  {on ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ok)", background: "var(--ok-bg)", padding: "4px 10px", borderRadius: 20, display: "inline-block" }}>
                      ● conectada
                    </span>
                  ) : (
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", border: "1px solid var(--border-forte)", padding: "4px 12px", borderRadius: 8, display: "inline-block" }}>
                      + Conectar
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* painel da integracao selecionada (Feegow/Clinicorp ja sao cards
          completos com cabecalho proprio; so o Google ganha a moldura aqui) */}
      {aberta === "feegow" && <IntegracaoFeegow clinicaId={clinicaId} />}
      {aberta === "clinicorp" && <IntegracaoClinicorp clinicaId={clinicaId} />}
      {aberta === "klingo" && <IntegracaoKlingo clinicaId={clinicaId} />}
      {aberta === "gcal" && (
        <div className="card" style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/google-calendar-logo.jpeg"
              alt=""
              style={{ width: 30, height: 30, borderRadius: 8, objectFit: "contain", background: "#fff" }}
            />
            <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>Google Calendar</div>
            {status.gcal && (
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ok)", background: "var(--ok-bg)", padding: "4px 12px", borderRadius: 20 }}>
                ● ativa
              </span>
            )}
          </div>
          <IntegracaoGoogleCalendar clinicaId={clinicaId} profissionais={profissionais} />
        </div>
      )}
    </div>
  );
}
