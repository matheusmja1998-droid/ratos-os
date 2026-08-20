"use client";

import { useEffect, useState } from "react";

// Bloqueio manual de horario de EXAME. A API da Feegow nao devolve os
// bloqueios da Agenda de Equipamentos — sem isso a IA oferece horario que a
// clinica ja fechou (caso real 26/08: Ergo 10:45 bloqueada e oferecida).
// Aqui a recepcao cadastra e a IA passa a respeitar na hora.

type Bloqueio = {
  id: string;
  exame_id: string | null;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  motivo: string | null;
};

export default function BloqueiosExame({
  clinicaId,
  catalogo,
  dia,
}: {
  clinicaId: string;
  catalogo: { id: string; nome: string }[];
  dia: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Bloqueio[]>([]);
  const [data, setData] = useState(dia);
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [exameId, setExameId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const r = await fetch(`/api/bloqueios-exame?clinica=${clinicaId}`);
      const j = await r.json();
      setLista(Array.isArray(j.bloqueios) ? j.bloqueios : []);
    } catch {
      /* silencioso */
    }
  }
  useEffect(() => {
    if (aberto) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, clinicaId]);
  useEffect(() => setData(dia), [dia]);

  async function bloquear() {
    setErro("");
    if (!data || !ini || !fim) {
      setErro("Preencha a data e o horário.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/bloqueios-exame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinica_id: clinicaId,
          data,
          hora_inicio: ini,
          hora_fim: fim,
          exame_id: exameId || null,
          motivo,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.erro || "não deu certo");
      setIni("");
      setFim("");
      setMotivo("");
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "erro ao bloquear");
    } finally {
      setSalvando(false);
    }
  }

  async function liberar(id: string) {
    if (!confirm("Liberar esse horário? A IA volta a oferecer.")) return;
    await fetch("/api/bloqueios-exame", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinica_id: clinicaId, id }),
    });
    await carregar();
  }

  const nomeExame = (id: string | null) =>
    id ? catalogo.find((c) => String(c.id) === String(id))?.nome || `exame ${id}` : "todos os exames";

  return (
    <div style={{ marginTop: 18 }}>
      <button
        className="btn-fantasma"
        onClick={() => setAberto(!aberto)}
        style={{ padding: "7px 14px", fontSize: 13 }}
      >
        {aberto ? "▲ fechar bloqueios" : "🚫 bloquear horário"}
      </button>

      {aberto && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
            Bloqueou um horário no sistema da clínica? Cadastre aqui também — assim a IA
            para de oferecer esse horário pros pacientes.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>
              Data
              <input type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} style={{ marginTop: 2 }} />
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>
              De
              <input type="time" className="input" value={ini} onChange={(e) => setIni(e.target.value)} style={{ marginTop: 2 }} />
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>
              Até
              <input type="time" className="input" value={fim} onChange={(e) => setFim(e.target.value)} style={{ marginTop: 2 }} />
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)", flex: 1, minWidth: 190 }}>
              Exame
              <select className="input" value={exameId} onChange={(e) => setExameId(e.target.value)} style={{ marginTop: 2 }}>
                <option value="">todos os exames</option>
                {catalogo.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </label>
            <input
              className="input"
              placeholder="motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              style={{ flex: 1, minWidth: 150 }}
            />
            <button className="btn-primario" onClick={bloquear} disabled={salvando} style={{ padding: "9px 16px" }}>
              {salvando ? "..." : "Bloquear"}
            </button>
          </div>
          {erro && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{erro}</div>}

          {lista.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {lista.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    padding: "7px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {b.data.slice(8, 10)}/{b.data.slice(5, 7)} · {b.hora_inicio}–{b.hora_fim}
                  </span>
                  <span style={{ color: "var(--muted)", flex: 1 }}>
                    {nomeExame(b.exame_id)}
                    {b.motivo ? ` · ${b.motivo}` : ""}
                  </span>
                  <button className="btn-fantasma" onClick={() => liberar(b.id)} style={{ padding: "4px 10px", fontSize: 12 }}>
                    liberar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
