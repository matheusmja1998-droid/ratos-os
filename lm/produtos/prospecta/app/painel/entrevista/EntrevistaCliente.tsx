"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Msg = { role: "user" | "assistant"; content: string };

export default function EntrevistaCliente({ temChave }: { temChave: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [preenchidos, setPreenchidos] = useState<string[]>([]);
  const fim = useRef<HTMLDivElement>(null);

  const nomeCampo: Record<string, string> = {
    quem_sou: "Apresentação", produto_nome: "O que vende", produto_desc: "Descrição",
    produto_preco: "Preço", produto_prova: "Prova social", objetivo: "Objetivo",
    cta_link: "Link", objecoes: "Objeções", tom: "Tom de voz", obs_extra: "Regras extras",
  };

  async function turno(historico: Msg[]) {
    setPensando(true);
    const r = await fetch("/api/entrevista", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ historico }),
    });
    const d = await r.json();
    setPensando(false);
    if (!r.ok) { setMsgs((p) => [...p, { role: "assistant", content: "⚠️ " + (d.erro || "erro") }]); return; }
    setMsgs((p) => [...p, { role: "assistant", content: d.mensagem }]);
    if (d.campos) setPreenchidos((p) => Array.from(new Set([...p, ...Object.keys(d.campos)])));
    if (d.concluido) setConcluido(true);
  }

  useEffect(() => { if (temChave) turno([]); /* primeira pergunta */ }, [temChave]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, pensando]);

  async function enviar() {
    if (!texto.trim() || pensando) return;
    const novo: Msg[] = [...msgs, { role: "user", content: texto }];
    setMsgs(novo); setTexto("");
    turno(novo);
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <Link href="/painel" style={{ color: "#6cc24a", textDecoration: "none" }}>← painel</Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>💬 Configurar minha IA (conversando)</h1>
      </header>
      <p style={{ color: "#9aa4bd", fontSize: 13.5, marginTop: 0 }}>
        Só conversar. Vou te perguntar sobre seu produto e vou montando a IA sozinho. Quando terminar, ela tá pronta.
      </p>

      {!temChave ? (
        <div style={{ ...card, color: "#f0c674" }}>
          ⚠️ Conecte sua chave da Anthropic primeiro. <Link href="/painel/config" style={{ color: "#6cc24a" }}>configurar →</Link>
        </div>
      ) : (
        <>
          {preenchidos.length > 0 && (
            <div style={{ ...card, marginBottom: 12, fontSize: 13 }}>
              <b style={{ color: "#6cc24a" }}>✓ já configurei:</b>{" "}
              {preenchidos.map((k) => nomeCampo[k] || k).join(" · ")}
            </div>
          )}

          <div style={{ ...card, minHeight: 340, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: 440 }}>
              {msgs.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%",
                  padding: "9px 13px", borderRadius: 12, fontSize: 14, whiteSpace: "pre-wrap",
                  background: m.role === "user" ? "#1f3d2a" : "#232b45", color: "#e8ecf5",
                }}>{m.content}</div>
              ))}
              {pensando && <div style={{ color: "#8b93a7", fontSize: 13 }}>…</div>}
              <div ref={fim} />
            </div>

            {concluido ? (
              <Link href="/painel/testar" style={{ ...btn, textAlign: "center", textDecoration: "none", display: "block" }}>
                ✅ Pronto! Testar minha IA →
              </Link>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <textarea style={inp} rows={2} placeholder="responda aqui…" value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
                <button style={btn} onClick={enviar} disabled={pensando}>Enviar</button>
              </div>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: "#8b93a7", marginTop: 10 }}>
            Prefere preencher em formulário? <Link href="/painel/cerebro" style={{ color: "#6cc24a" }}>ir pro modo manual</Link>
          </p>
        </>
      )}
    </div>
  );
}
const card: React.CSSProperties = { background: "#141a2e", border: "1px solid #232b45", borderRadius: 12, padding: 16 };
const inp: React.CSSProperties = { flex: 1, boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 14, fontFamily: "inherit", resize: "none" };
const btn: React.CSSProperties = { padding: "0 18px", borderRadius: 9, border: "none", background: "#6cc24a", color: "#0b1020", fontWeight: 700, fontSize: 14, cursor: "pointer" };
