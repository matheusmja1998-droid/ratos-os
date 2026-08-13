"use client";

import { useState } from "react";
import { IconeLapis } from "../Icones";

// Observações da SECRETÁRIA no resumo do atendimento (lápis): anotações
// internas sobre o paciente que só o painel vê (a IA não usa isso).
export default function ObservacoesSecretaria({
  clinicaId,
  telefone,
  inicial,
}: {
  clinicaId: string;
  telefone: string;
  inicial: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(inicial || "");
  const [salvo, setSalvo] = useState(inicial || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    setSalvando(true);
    try {
      const res = await fetch("/api/conversas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, telefone, observacoes: texto }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      setSalvo(texto);
      setEditando(false);
    } catch (e: any) {
      setErro(e?.message || "erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, flex: 1 }}>
          Observações da secretária
        </div>
        <button
          onClick={() => {
            setTexto(salvo);
            setEditando((v) => !v);
          }}
          className="btn-fantasma"
          title="Adicionar/editar observações internas (só o painel vê)"
          style={{ padding: "5px 9px", display: "grid", placeItems: "center" }}
        >
          <IconeLapis size={14} />
        </button>
      </div>
      {erro && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{erro}</div>}
      {editando ? (
        <div style={{ marginTop: 6 }}>
          <textarea
            className="input"
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Anotações internas sobre esse paciente (só a equipe vê)..."
            style={{ marginTop: 0, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button className="btn-primario" onClick={salvar} disabled={salvando} style={{ padding: "7px 14px", fontSize: 13 }}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button className="btn-fantasma" onClick={() => setEditando(false)} disabled={salvando} style={{ padding: "7px 12px", fontSize: 13 }}>
              cancelar
            </button>
          </div>
        </div>
      ) : salvo ? (
        <div style={{ fontSize: 13.5, marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{salvo}</div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
          Nenhuma observação ainda — clica no lápis pra anotar.
        </div>
      )}
    </div>
  );
}
