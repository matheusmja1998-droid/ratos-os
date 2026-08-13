"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PainelCliente({ conta, metricas }: any) {
  const router = useRouter();
  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }
  const passos = [
    { feito: conta.temChave, txt: "Conectar sua chave da Anthropic (IA)", href: "/painel/config" },
    { feito: conta.temWhatsapp, txt: "Conectar seu WhatsApp", href: "/painel/whatsapp" },
    { feito: conta.temCerebro, txt: "Configurar sua IA — converse e ela se monta sozinha 💬", href: "/painel/entrevista" },
    { feito: false, txt: "Subir sua lista e ativar campanha", href: "/painel/leads" },
  ];
  const cards = [
    ["Disparos", metricas.disparos],
    ["Respostas", metricas.respostas],
    ["Reuniões", metricas.reunioes],
    ["Opt-outs", metricas.optouts],
  ];
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>⚡ Prospecta</h1>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#8b93a7" }}>
          {conta.email} · {conta.plano === "trial" ? `trial (${conta.diasTrial} dias)` : conta.plano}
        </span>
        <Link href="/painel/leads" style={{ color: "#6cc24a", fontSize: 13, textDecoration: "none", fontWeight: 600 }}>operação</Link>
        <Link href="/painel/cerebro" style={{ color: "#9aa4bd", fontSize: 13, textDecoration: "none" }}>cérebro</Link>
        <Link href="/painel/testar" style={{ color: "#9aa4bd", fontSize: 13, textDecoration: "none" }}>testar</Link>
        <Link href="/painel/whatsapp" style={{ color: "#9aa4bd", fontSize: 13, textDecoration: "none" }}>whatsapp</Link>
        <Link href="/painel/config" style={{ color: "#9aa4bd", fontSize: 13, textDecoration: "none" }}>config</Link>
        <Link href="/painel/assinatura" style={{ color: "#9aa4bd", fontSize: 13, textDecoration: "none" }}>assinatura</Link>
        <button onClick={sair} style={{ background: "none", border: "1px solid #2a3350", color: "#e8ecf5", padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>sair</button>
      </header>

      {conta.plano === "inadimplente" && (
        <div style={{ padding: "12px 16px", background: "#3a1414", border: "1px solid #6b2020", borderRadius: 12, marginBottom: 16, fontSize: 14 }}>
          ⚠️ Pagamento pendente. Os disparos estão pausados. <Link href="/painel/assinatura" style={{ color: "#ff9b6b" }}>regularizar →</Link>
        </div>
      )}
      {conta.plano === "trial" && conta.diasTrial <= 5 && (
        <div style={{ padding: "12px 16px", background: "#3a3014", border: "1px solid #6b5420", borderRadius: 12, marginBottom: 16, fontSize: 14 }}>
          ⏳ Seu trial acaba em {conta.diasTrial} dia(s). <Link href="/painel/assinatura" style={{ color: "#f0c674" }}>assinar pra não parar →</Link>
        </div>
      )}

      <div style={{ padding: "16px 18px", background: "#141a2e", border: "1px solid #232b45", borderRadius: 12, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>🚀 Primeiros passos</div>
        {passos.map((p: any, i: number) => (
          <Link key={i} href={p.href} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", textDecoration: "none", color: "#e8ecf5", borderTop: i ? "1px solid #232b45" : "none" }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 13, background: p.feito ? "#6cc24a" : "#2a3350", color: p.feito ? "#0b1020" : "#8b93a7" }}>{p.feito ? "✓" : i + 1}</span>
            <span style={{ color: p.feito ? "#8b93a7" : "#e8ecf5", textDecoration: p.feito ? "line-through" : "none" }}>{p.txt}</span>
            <span style={{ marginLeft: "auto", color: "#6cc24a", fontSize: 13 }}>{p.feito ? "" : "configurar →"}</span>
          </Link>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
        {cards.map(([r, n]: any) => (
          <div key={r} style={{ background: "#141a2e", border: "1px solid #232b45", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#6cc24a" }}>{n}</div>
            <div style={{ fontSize: 12, color: "#8b93a7" }}>{r}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
