"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next") || "";
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setErro("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      // roteia pelo papel (admin -> /admin, clinica -> /painel)
      const destino = next || (data.papel === "admin" ? "/admin" : "/painel");
      router.push(destino);
      router.refresh();
    } else {
      setErro(data.erro || "Email ou senha incorretos.");
      setEntrando(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form onSubmit={entrar} className="card" style={{ width: "100%", maxWidth: 360, padding: 28 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/facilita-ai-logo.jpeg"
          alt="Facilita AI"
          style={{ display: "block", width: "100%", maxWidth: 260, height: "auto", margin: "0 auto 8px" }}
        />
        <p style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", marginTop: 0 }}>
          Entre com seu acesso
        </p>

        <label className="rotulo" style={{ marginTop: 18 }}>Email</label>
        <input
          type="email"
          autoFocus
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          style={{ padding: "11px 12px", fontSize: 15, marginTop: 6 }}
        />

        <label className="rotulo" style={{ marginTop: 14 }}>Senha</label>
        <input
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="input"
          style={{ padding: "11px 12px", fontSize: 15, marginTop: 6 }}
        />

        {erro && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{erro}</div>}
        <button
          type="submit"
          disabled={!email || !senha || entrando}
          className="btn-primario"
          style={{ width: "100%", marginTop: 18, padding: 12, fontWeight: 700, fontSize: 15 }}
        >
          {entrando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>carregando...</div>}>
      <LoginInner />
    </Suspense>
  );
}
