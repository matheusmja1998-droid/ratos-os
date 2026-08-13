"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Cadastro() {
  const router = useRouter();
  const [nome, setNome] = useState(""), [email, setEmail] = useState(""), [senha, setSenha] = useState("");
  const [erro, setErro] = useState(""), [carregando, setCarregando] = useState(false);

  async function criar() {
    setErro(""); setCarregando(true);
    const r = await fetch("/api/auth/cadastro", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha }),
    });
    const d = await r.json().catch(() => ({}));
    setCarregando(false);
    if (!r.ok) return setErro(d.erro || "erro ao criar conta");
    router.push("/painel");
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ margin: "0 0 4px", fontSize: 26 }}>⚡ Criar conta</h1>
        <p style={{ color: "#8b93a7", margin: "0 0 20px", fontSize: 14 }}>14 dias grátis. Sem cartão agora.</p>
        <input style={inp} placeholder="seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input style={inp} placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={inp} type="password" placeholder="senha (mín. 6)" value={senha}
          onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criar()} />
        <button style={btn} onClick={criar} disabled={carregando}>{carregando ? "criando…" : "Criar conta grátis"}</button>
        {erro && <div style={{ color: "#ff6b6b", fontSize: 13, marginTop: 10 }}>{erro}</div>}
        <p style={{ fontSize: 13, color: "#8b93a7", marginTop: 18 }}>
          já tem conta? <Link href="/login" style={{ color: "#6cc24a" }}>entrar</Link>
        </p>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 };
const card: React.CSSProperties = { width: "100%", maxWidth: 360, background: "#141a2e", border: "1px solid #232b45", borderRadius: 16, padding: 28 };
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 14px", marginBottom: 10, borderRadius: 10, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 15 };
const btn: React.CSSProperties = { width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#6cc24a", color: "#0b1020", fontWeight: 700, fontSize: 15, cursor: "pointer" };
