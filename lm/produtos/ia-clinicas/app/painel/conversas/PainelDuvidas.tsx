"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Painel de DÚVIDAS pendentes da conversa: a IA não soube responder, avisou o
// paciente que ia confirmar com o especialista, e abriu a pergunta aqui. A
// secretária responde de dois jeitos:
//  - "IA responde": a IA pega a resposta oficial e formula a mensagem pro
//    paciente no tom da clínica
//  - "Enviar como escrevi": o texto vai exatamente como digitado
// Nos dois casos a resposta vira APRENDIZADO (a IA usa em casos parecidos).
type Duvida = { id: string; pergunta_ia: string; criado_em?: string };

export default function PainelDuvidas({
  clinicaId,
  telefone,
}: {
  clinicaId: string;
  telefone: string;
}) {
  const router = useRouter();
  const [duvidas, setDuvidas] = useState<Duvida[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");

  async function carregar() {
    try {
      const res = await fetch(`/api/duvidas?clinica=${clinicaId}&telefone=${telefone}`);
      const j = await res.json();
      setDuvidas(Array.isArray(j.pendentes) ? j.pendentes : []);
    } catch {
      /* silencioso */
    }
  }
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId, telefone]);

  async function responder(id: string, modo: "ia" | "manual") {
    const resposta = (respostas[id] || "").trim();
    if (!resposta) {
      setErro("escreve a resposta primeiro");
      return;
    }
    setErro("");
    setOkMsg("");
    setEnviando(id + modo);
    try {
      const res = await fetch("/api/duvidas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, id, resposta, modo }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      setOkMsg(
        modo === "ia"
          ? "A IA respondeu o paciente com a informação da equipe (e aprendeu pra próxima)."
          : "Resposta enviada como você escreveu (e a IA aprendeu pra próxima)."
      );
      setRespostas((r) => ({ ...r, [id]: "" }));
      await carregar();
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || "erro ao responder");
    } finally {
      setEnviando(null);
    }
  }

  if (duvidas.length === 0 && !okMsg) return null;

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        border: duvidas.length > 0 ? "2px solid var(--danger)" : "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: duvidas.length ? 10 : 0 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: duvidas.length > 0 ? "var(--danger)" : "var(--ok)",
            flexShrink: 0,
          }}
        />
        <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
          {duvidas.length > 0
            ? `A IA precisa de você: ${duvidas.length} pergunta${duvidas.length > 1 ? "s" : ""} sem resposta`
            : "Dúvidas respondidas"}
        </div>
      </div>

      {erro && (
        <div style={{ marginBottom: 8, padding: "8px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>
          {erro}
        </div>
      )}
      {okMsg && (
        <div style={{ marginBottom: 8, padding: "8px 12px", background: "var(--ok-bg)", color: "var(--ok)", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
          {okMsg}
        </div>
      )}

      {duvidas.map((d) => (
        <div
          key={d.id}
          style={{ padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 10 }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>{d.pergunta_ia}</div>
          <textarea
            className="input"
            rows={2}
            value={respostas[d.id] || ""}
            onChange={(e) => setRespostas((r) => ({ ...r, [d.id]: e.target.value }))}
            placeholder="Escreve a resposta oficial da clínica aqui..."
            style={{ marginTop: 0, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button
              className="btn-primario"
              onClick={() => responder(d.id, "ia")}
              disabled={enviando !== null}
              title="A IA pega essa informação e responde o paciente no tom da clínica"
              style={{ padding: "8px 14px", fontSize: 13 }}
            >
              {enviando === d.id + "ia" ? "Enviando..." : "IA responde pro paciente"}
            </button>
            <button
              className="btn-fantasma"
              onClick={() => responder(d.id, "manual")}
              disabled={enviando !== null}
              title="Envia exatamente o texto que você escreveu"
              style={{ padding: "8px 14px", fontSize: 13 }}
            >
              {enviando === d.id + "manual" ? "Enviando..." : "Enviar como escrevi"}
            </button>
          </div>
        </div>
      ))}
      {duvidas.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          A resposta vira aprendizado: em perguntas parecidas, a IA responde sozinha do mesmo jeito.
        </div>
      )}
    </div>
  );
}
