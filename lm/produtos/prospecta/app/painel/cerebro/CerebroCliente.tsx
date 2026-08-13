"use client";
import { useState } from "react";
import Link from "next/link";

const CAMPOS = [
  { k: "quem_sou", label: "Como a IA se apresenta", ph: "Ex: Oi, aqui é o Matheus, um dos diretores da minha empresa", area: false },
  { k: "produto_nome", label: "O que você vende (nome)", ph: "Ex: Software de gestão / Serviço de tráfego", area: false },
  { k: "produto_desc", label: "O que isso faz / resolve", ph: "Ex: automatiza o atendimento e economiza tempo do time", area: true },
  { k: "objetivo", label: "Objetivo da conversa", ph: "Ex: marcar uma reunião de 20 minutos", area: false },
  { k: "produto_preco", label: "Preço (o que responder se perguntarem)", ph: "Ex: a partir de R$297/mês, depende do tamanho", area: false },
  { k: "produto_prova", label: "Prova / caso de sucesso", ph: "Ex: a clínica X recuperou R$3mil/mês", area: true },
  { k: "cta_link", label: "Link pra enviar (opcional)", ph: "https://...", area: false },
  { k: "objecoes", label: "Objeções e respostas (uma por linha)", ph: "já tenho -> pergunto se está satisfeito\ncaro -> foco no retorno", area: true },
  { k: "tom", label: "Tom de voz", ph: "Ex: descontraído e direto, sem formalidade", area: false },
  { k: "obs_extra", label: "Regras extras (opcional)", ph: "Ex: nunca falar em desconto", area: true },
];

const NICHOS = [
  { k: "agencia", label: "🎯 Agência / Marketing" },
  { k: "saas", label: "💻 Software / SaaS" },
  { k: "servico", label: "🛠 Serviço / Consultoria" },
  { k: "clinica", label: "🏥 Clínica / Saúde" },
];

export default function CerebroCliente({ inicial }: { inicial: Record<string, string> }) {
  const [v, setV] = useState<Record<string, string>>(inicial);
  const [msg, setMsg] = useState("");
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));

  async function aplicarTemplate(nicho: string) {
    const r = await fetch("/api/cerebro/template?nicho=" + nicho);
    const d = await r.json();
    setV((p) => ({ ...p, ...d }));
    setMsg("template aplicado — ajuste o que quiser e salve");
  }
  async function salvar() {
    setMsg("salvando…");
    await fetch("/api/cerebro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
    setMsg("salvo ✅");
    setTimeout(() => setMsg(""), 2500);
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/painel" style={{ color: "#6cc24a", textDecoration: "none" }}>← painel</Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>🧠 Cérebro da sua IA</h1>
      </header>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 13.5, color: "#9aa4bd", marginBottom: 10 }}>
          Comece por um modelo do seu ramo (opcional) e ajuste. Ou preencha do zero.
          <b> Dica:</b> se preferir, use o <Link href="/painel/entrevista" style={{ color: "#6cc24a" }}>chat de configuração</Link> — você conversa e a IA preenche isso sozinha.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {NICHOS.map((n) => (
            <button key={n.k} style={chip} onClick={() => aplicarTemplate(n.k)}>{n.label}</button>
          ))}
        </div>
      </div>

      {CAMPOS.map((c) => (
        <div key={c.k} style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: "#9aa4bd", display: "block", marginBottom: 4 }}>{c.label}</label>
          {c.area ? (
            <textarea style={inp} rows={3} placeholder={c.ph} value={v[c.k] || ""} onChange={(e) => set(c.k, e.target.value)} />
          ) : (
            <input style={inp} placeholder={c.ph} value={v[c.k] || ""} onChange={(e) => set(c.k, e.target.value)} />
          )}
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button style={btn} onClick={salvar}>💾 Salvar cérebro</button>
        <span style={{ color: "#6cc24a", fontSize: 14 }}>{msg}</span>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#141a2e", border: "1px solid #232b45", borderRadius: 12, padding: 16 };
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 14, fontFamily: "inherit" };
const btn: React.CSSProperties = { padding: "11px 20px", borderRadius: 10, border: "none", background: "#6cc24a", color: "#0b1020", fontWeight: 700, fontSize: 15, cursor: "pointer" };
const chip: React.CSSProperties = { padding: "7px 12px", borderRadius: 999, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 13, cursor: "pointer" };
