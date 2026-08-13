"use client";

import { useEffect, useMemo, useState } from "react";

type Exame = {
  agendamentoId: string;
  inicio: string; // "YYYY-MM-DDTHH:mm:00" wall-clock SP
  fim: string;
  procedimentoId: string;
  procedimentoNome: string;
  pacienteId: string;
  status: number;
};

// soma dias a "YYYY-MM-DD" sem fuso (wall-clock)
function somaDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(t);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
function rotuloDia(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dow]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export default function ExamesView({
  clinicaId,
  hoje,
  usaParam,
}: {
  clinicaId: string;
  hoje: string;
  usaParam: boolean;
}) {
  const suf = usaParam ? `&clinica=${clinicaId}` : "";
  const [dia, setDia] = useState(hoje);
  const [exameFiltro, setExameFiltro] = useState<string>("todos");
  const [exames, setExames] = useState<Exame[]>([]);
  const [catalogo, setCatalogo] = useState<{ id: string; nome: string }[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // PASSO 1: agenda do dia — rapido (aparece na hora, sem esperar nomes)
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    setNomes({});
    fetch(`/api/exames?de=${dia}&ate=${dia}${suf}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.erro) setErro(j.erro);
        setExames(j.exames || []);
        if (j.catalogo?.length) setCatalogo(j.catalogo);
      })
      .catch(() => vivo && setErro("não consegui carregar"))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [dia, suf]);

  // PASSO 2: resolve os nomes dos pacientes em paralelo, DEPOIS que a lista
  // apareceu — preenche "carregando nome…" conforme chega, sem travar a tela.
  useEffect(() => {
    const ids = Array.from(new Set(exames.map((e) => e.pacienteId).filter(Boolean)));
    if (ids.length === 0) return;
    let vivo = true;
    fetch(`/api/exames?nomes=${ids.join(",")}${suf}`)
      .then((r) => r.json())
      .then((j) => {
        if (vivo && j.nomes) setNomes(j.nomes);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [exames, suf]);

  // só os tipos de exame que REALMENTE aparecem no dia, COM a contagem de cada
  const tiposNoDia = useMemo(() => {
    const m = new Map<string, { nome: string; qtd: number }>();
    for (const e of exames) {
      const cur = m.get(e.procedimentoId) || { nome: e.procedimentoNome, qtd: 0 };
      cur.qtd++;
      m.set(e.procedimentoId, cur);
    }
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, nome: v.nome, qtd: v.qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [exames]);

  const filtrados = useMemo(() => {
    const arr = exameFiltro === "todos" ? exames : exames.filter((e) => e.procedimentoId === exameFiltro);
    return [...arr].sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [exames, exameFiltro]);

  // nome do tipo filtrado (pro contador: "10 Prova ventilatória")
  const nomeExameFiltro = useMemo(
    () => tiposNoDia.find((t) => t.id === exameFiltro)?.nome || "",
    [tiposNoDia, exameFiltro]
  );

  const btn: React.CSSProperties = {
    padding: "7px 12px",
    borderRadius: 8,
    border: "1px solid var(--border-forte)",
    background: "var(--card)",
    cursor: "pointer",
    fontSize: 14,
  };

  return (
    <div style={{ marginTop: 20 }}>
      {/* NAVEGACAO POR DIA + SELETOR DE EXAME */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button style={btn} onClick={() => setDia(somaDias(dia, -1))}>← dia anterior</button>
        <button style={btn} onClick={() => setDia(hoje)}>hoje</button>
        <button style={btn} onClick={() => setDia(somaDias(dia, 1))}>próximo dia →</button>
        <input
          type="date"
          value={dia}
          onChange={(e) => e.target.value && setDia(e.target.value)}
          style={{ ...btn, cursor: "text" }}
        />
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Exame:</label>
        <select
          className="input"
          value={exameFiltro}
          onChange={(e) => setExameFiltro(e.target.value)}
          style={{ minWidth: 200, padding: "7px 10px", fontSize: 14 }}
        >
          <option value="todos">Todos os exames ({exames.length})</option>
          {tiposNoDia.length
            ? tiposNoDia.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} ({t.qtd})
                </option>
              ))
            : catalogo.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
        </select>
      </div>

      {/* CABECALHO DO DIA + CONTADOR (total, ou do tipo filtrado) */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{rotuloDia(dia)}</div>
        {!carregando && !erro && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--link)",
              background: "color-mix(in srgb, var(--link) 12%, transparent)",
              padding: "3px 10px",
              borderRadius: 999,
            }}
          >
            {exameFiltro === "todos"
              ? `${filtrados.length} exame${filtrados.length === 1 ? "" : "s"} no dia`
              : `${filtrados.length} ${nomeExameFiltro || "desse tipo"}`}
          </span>
        )}
      </div>

      {carregando ? (
        <div style={{ color: "var(--muted)", padding: 20 }}>carregando exames do Feegow…</div>
      ) : erro ? (
        <div style={{ color: "#c0392b", padding: 20 }}>Erro: {erro}. Tenta de novo em instantes.</div>
      ) : filtrados.length === 0 ? (
        <div style={{ color: "var(--muted)", padding: 30, textAlign: "center", border: "1px dashed var(--border-forte)", borderRadius: 12 }}>
          Nenhum exame {exameFiltro !== "todos" ? "desse tipo " : ""}agendado nesse dia.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrados.map((e) => (
            <div
              key={e.agendamentoId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 16px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--card)",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, minWidth: 58, fontVariantNumeric: "tabular-nums" }}>
                {e.inicio.slice(11, 16)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{e.procedimentoNome}</div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  {nomes[e.pacienteId] || (
                    <span style={{ opacity: 0.6, fontStyle: "italic" }}>carregando nome…</span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {e.inicio.slice(11, 16)}–{e.fim.slice(11, 16)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
        {filtrados.length > 0 && `${filtrados.length} exame(s) · `}Direto do Feegow, ao vivo.
      </div>
    </div>
  );
}
