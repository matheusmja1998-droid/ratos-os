"use client";

import { useState } from "react";
import { IconeGraficoBarras, IconeGraficoRosca, IconeGraficoLinha } from "../Icones";

// Graficos em SVG puro (a CSP do app bloqueia CDN, entao nada de lib externa).
// A clinica escolhe COMO ver cada bloco: linha, coluna ou rosca.

export type PontoSerie = {
  dia: string;
  conversas: number;
  agendadas: number;
  confirmadas: number;
  canceladas: number;
};

// cores CATEGORICAS (de dado, nao de UI): contraste bom no claro e no escuro
export const CORES = {
  conversas: "#2563eb",
  agendadas: "#7c3aed",
  confirmadas: "#16a34a",
  canceladas: "#dc2626",
  aguardando: "#ca8a04",
} as const;

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function diaCurto(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}

// ---------- Grafico de LINHA ----------
function Linha({ serie, series }: { serie: PontoSerie[]; series: { chave: keyof PontoSerie; rotulo: string; cor: string }[] }) {
  const L = 620;
  const A = 220;
  const pad = { top: 14, right: 12, bottom: 26, left: 34 };
  const max = Math.max(
    1,
    ...serie.flatMap((p) => series.map((s) => Number(p[s.chave]) || 0))
  );
  const larg = L - pad.left - pad.right;
  const alt = A - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (serie.length <= 1 ? larg / 2 : (i / (serie.length - 1)) * larg);
  const y = (v: number) => pad.top + alt - (v / max) * alt;

  // no maximo 7 rotulos no eixo X pra nao virar sopa de datas
  const passo = Math.max(1, Math.ceil(serie.length / 7));

  return (
    <svg viewBox={`0 0 ${L} ${A}`} width="100%" height={A} role="img" aria-label="evolução no período">
      {/* grade horizontal + escala */}
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.left} x2={L - pad.right} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeWidth="1" />
          <text x={pad.left - 6} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="inherit">
            {Math.round(max * f)}
          </text>
        </g>
      ))}
      {serie.map((p, i) =>
        i % passo === 0 ? (
          <text key={p.dia} x={x(i)} y={A - 8} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="inherit">
            {diaCurto(p.dia)}
          </text>
        ) : null
      )}
      {series.map((s) => (
        <g key={String(s.chave)}>
          <polyline
            fill="none"
            stroke={s.cor}
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={serie.map((p, i) => `${x(i)},${y(Number(p[s.chave]) || 0)}`).join(" ")}
          />
          {serie.map((p, i) => (
            <circle key={p.dia} cx={x(i)} cy={y(Number(p[s.chave]) || 0)} r="2.6" fill={s.cor}>
              <title>{`${diaCurto(p.dia)} — ${s.rotulo}: ${p[s.chave]}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

// ---------- Grafico de COLUNAS (agrupadas por dia) ----------
function Colunas({ serie, series }: { serie: PontoSerie[]; series: { chave: keyof PontoSerie; rotulo: string; cor: string }[] }) {
  const L = 620;
  const A = 220;
  const pad = { top: 14, right: 12, bottom: 26, left: 34 };
  const max = Math.max(1, ...serie.flatMap((p) => series.map((s) => Number(p[s.chave]) || 0)));
  const larg = L - pad.left - pad.right;
  const alt = A - pad.top - pad.bottom;
  const passoDia = larg / Math.max(1, serie.length);
  const larguraBarra = Math.max(2, (passoDia * 0.68) / series.length);
  const rotulos = Math.max(1, Math.ceil(serie.length / 7));

  return (
    <svg viewBox={`0 0 ${L} ${A}`} width="100%" height={A} role="img" aria-label="evolução no período">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={pad.left}
            x2={L - pad.right}
            y1={pad.top + alt - f * alt}
            y2={pad.top + alt - f * alt}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text x={pad.left - 6} y={pad.top + alt - f * alt + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="inherit">
            {Math.round(max * f)}
          </text>
        </g>
      ))}
      {serie.map((p, i) => {
        const base = pad.left + i * passoDia + passoDia * 0.16;
        return (
          <g key={p.dia}>
            {series.map((s, j) => {
              const v = Number(p[s.chave]) || 0;
              const h = (v / max) * alt;
              return (
                <rect
                  key={String(s.chave)}
                  x={base + j * larguraBarra}
                  y={pad.top + alt - h}
                  width={Math.max(1.5, larguraBarra - 1.5)}
                  height={h}
                  rx="1.5"
                  fill={s.cor}
                >
                  <title>{`${diaCurto(p.dia)} — ${s.rotulo}: ${v}`}</title>
                </rect>
              );
            })}
            {i % rotulos === 0 && (
              <text x={base + (larguraBarra * series.length) / 2} y={A - 8} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="inherit">
                {diaCurto(p.dia)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Grafico de ROSCA ----------
export function Rosca({
  fatias,
  centro,
  legenda = "",
}: {
  fatias: { rotulo: string; valor: number; cor: string }[];
  centro?: string;
  legenda?: string;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const R = 54;
  const C = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={legenda || "distribuição"}>
        <circle cx="75" cy="75" r={R} fill="none" stroke="var(--border)" strokeWidth="16" />
        {total > 0 &&
          fatias
            .filter((f) => f.valor > 0)
            .map((f) => {
              const frac = f.valor / total;
              const el = (
                <circle
                  key={f.rotulo}
                  cx="75"
                  cy="75"
                  r={R}
                  fill="none"
                  stroke={f.cor}
                  strokeWidth="16"
                  strokeDasharray={`${frac * C} ${C}`}
                  strokeDashoffset={-acumulado * C}
                  transform="rotate(-90 75 75)"
                >
                  <title>{`${f.rotulo}: ${f.valor} (${Math.round(frac * 100)}%)`}</title>
                </circle>
              );
              acumulado += frac;
              return el;
            })}
        <text x="75" y="71" textAnchor="middle" fill="var(--text)" fontSize="24" fontWeight="700" fontFamily="inherit">
          {centro ?? total}
        </text>
        {legenda && (
          <text x="75" y="90" textAnchor="middle" fill="var(--muted)" fontSize="11" fontFamily="inherit">
            {legenda}
          </text>
        )}
      </svg>
      <div style={{ display: "grid", gap: 8, minWidth: 150 }}>
        {fatias.map((f) => (
          <div key={f.rotulo} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: f.cor, display: "inline-block", flexShrink: 0 }} />
            <span style={{ color: "var(--muted)" }}>{f.rotulo}</span>
            <strong style={{ marginLeft: "auto", paddingLeft: 16, color: "var(--text)" }}>{f.valor}</strong>
            <span style={{ color: "var(--muted)", fontSize: 11, width: 38, textAlign: "right" }}>
              {total > 0 ? Math.round((f.valor / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Bloco de serie com SELETOR de tipo ----------
export function GraficoSerie({ serie }: { serie: PontoSerie[] }) {
  const [tipo, setTipo] = useState<"linha" | "coluna" | "rosca">("linha");

  const series = [
    { chave: "conversas" as const, rotulo: "conversas", cor: CORES.conversas },
    { chave: "agendadas" as const, rotulo: "agendamentos", cor: CORES.agendadas },
    { chave: "confirmadas" as const, rotulo: "confirmados", cor: CORES.confirmadas },
    { chave: "canceladas" as const, rotulo: "cancelados", cor: CORES.canceladas },
  ];

  const totais = series.map((s) => ({
    rotulo: s.rotulo,
    valor: serie.reduce((acc, p) => acc + (Number(p[s.chave]) || 0), 0),
    cor: s.cor,
  }));

  const OPCOES = [
    { id: "linha" as const, rotulo: "Linha", Icone: IconeGraficoLinha },
    { id: "coluna" as const, rotulo: "Colunas", Icone: IconeGraficoBarras },
    { id: "rosca" as const, rotulo: "Círculo", Icone: IconeGraficoRosca },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, margin: 0, flex: 1, minWidth: 150 }}>Conversas ao longo do período</h2>
        <div style={{ display: "flex", gap: 4 }}>
          {OPCOES.map((o) => {
            const ativo = tipo === o.id;
            const Icone = o.Icone;
            return (
              <button
                key={o.id}
                onClick={() => setTipo(o.id)}
                title={`ver em ${o.rotulo.toLowerCase()}`}
                aria-pressed={ativo}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 11px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: ativo ? "var(--accent-contrast)" : "var(--muted)",
                  background: ativo ? "var(--accent)" : "var(--surface)",
                  border: "1px solid " + (ativo ? "var(--accent)" : "var(--border)"),
                }}
              >
                <Icone size={14} />
                {o.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {serie.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          Sem movimento nesse período.
        </div>
      ) : tipo === "rosca" ? (
        <Rosca fatias={totais} legenda="no período" />
      ) : tipo === "linha" ? (
        <Linha serie={serie} series={series} />
      ) : (
        <Colunas serie={serie} series={series} />
      )}

      {tipo !== "rosca" && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
          {totais.map((t) => (
            <span key={t.rotulo} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: t.cor, display: "inline-block" }} />
              {t.rotulo}
              <strong style={{ color: "var(--text)" }}>{t.valor}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- FUNIL de conversao ----------
export function Funil({
  etapas,
  ticket,
}: {
  etapas: { rotulo: string; valor: number; cor: string }[];
  ticket: number;
}) {
  const topo = Math.max(1, etapas[0]?.valor || 1);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {etapas.map((e, i) => {
        const pctTopo = Math.round((e.valor / topo) * 100);
        // conversao de uma etapa pra outra (quanto sobrou da anterior)
        const anterior = i > 0 ? etapas[i - 1].valor : null;
        const pctAnterior = anterior && anterior > 0 ? Math.round((e.valor / anterior) * 100) : null;
        return (
          <div key={e.rotulo}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: "var(--muted)" }}>{e.rotulo}</span>
              <span>
                <strong style={{ color: "var(--text)" }}>{e.valor}</strong>
                {pctAnterior !== null && (
                  <span style={{ color: "var(--muted)", fontSize: 11.5, marginLeft: 8 }}>
                    {pctAnterior}% da etapa anterior
                  </span>
                )}
              </span>
            </div>
            <div
              style={{
                height: 26,
                borderRadius: 6,
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(pctTopo, e.valor > 0 ? 3 : 0)}%`,
                  height: "100%",
                  background: e.cor,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingRight: 8,
                  color: "#fff",
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                {pctTopo >= 12 ? `${pctTopo}%` : ""}
              </div>
            </div>
          </div>
        );
      })}
      <p style={{ color: "var(--muted)", fontSize: 12, margin: "6px 0 0" }}>
        Cada paciente que compareceu vale {brl(ticket)} em receita realizada.
      </p>
    </div>
  );
}
