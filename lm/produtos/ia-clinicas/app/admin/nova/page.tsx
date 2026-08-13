"use client";

import { useState } from "react";

// Cadastro de clinica NOVA + a conta de acesso dela (email + senha inicial).
// Salva via POST /api/admin/clinicas com { clinica: {...}, conta: { email, senha } }.

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-forte)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 14,
  marginTop: 4,
  boxSizing: "border-box",
};

const label: React.CSSProperties = {
  fontSize: 13,
  color: "var(--muted)",
  marginTop: 16,
  display: "block",
};

export default function NovaClinica() {
  const [form, setForm] = useState({
    nome: "",
    endereco: "",
    convenios: "",
    precos: "",
    faq: "",
    tom_de_voz: "informal e acolhedor",
    link_review: "",
  });
  const [conta, setConta] = useState({ email: "", senha: "" });
  const [salvo, setSalvo] = useState<{ email: string; senha: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const podeSalvar = !!form.nome && !!conta.email && !!conta.senha;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/clinicas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinica: { ...form },
          conta: { email: conta.email.trim(), senha: conta.senha },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.erro || data.error || "Nao consegui salvar. Tenta de novo.");
      } else {
        setSalvo({ email: conta.email.trim(), senha: conta.senha });
      }
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    }
    setSalvando(false);
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 32 }}>
      <a href="/admin" style={{ color: "var(--link)", fontSize: 14, textDecoration: "none" }}>
        ← voltar
      </a>
      <h1 style={{ fontSize: 24 }}>Nova clinica</h1>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>
        Cria a clinica e a conta de acesso dela de uma vez. A IA usa os dados da clinica pra atender
        os pacientes.
      </p>

      <label style={label}>Nome da clinica *</label>
      <input style={inputStyle} value={form.nome} onChange={(e) => set("nome", e.target.value)} />

      <label style={label}>Endereco</label>
      <input
        style={inputStyle}
        value={form.endereco}
        onChange={(e) => set("endereco", e.target.value)}
      />

      <label style={label}>Convenios aceitos</label>
      <input
        style={inputStyle}
        placeholder="Unimed, Bradesco, particular..."
        value={form.convenios}
        onChange={(e) => set("convenios", e.target.value)}
      />

      <label style={label}>Precos</label>
      <input
        style={inputStyle}
        placeholder="Consulta R$300, retorno gratis em 15 dias"
        value={form.precos}
        onChange={(e) => set("precos", e.target.value)}
      />

      <label style={label}>Informacoes / FAQ (a IA usa pra tirar duvidas)</label>
      <textarea
        style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
        placeholder="Horario de funcionamento, estacionamento, o que levar, etc"
        value={form.faq}
        onChange={(e) => set("faq", e.target.value)}
      />

      <label style={label}>Tom de voz da IA</label>
      <input
        style={inputStyle}
        value={form.tom_de_voz}
        onChange={(e) => set("tom_de_voz", e.target.value)}
      />

      <label style={label}>Link de avaliacao no Google (pos-consulta)</label>
      <input
        style={inputStyle}
        placeholder="https://g.page/r/..."
        value={form.link_review}
        onChange={(e) => set("link_review", e.target.value)}
      />

      {/* Conta de acesso da clinica */}
      <div
        style={{
          marginTop: 28,
          padding: 16,
          background: "var(--surface)",
          borderRadius: 10,
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Acesso da clinica</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
          Login que a clinica usa pra entrar no painel dela. Ela ve so a propria clinica.
        </div>
        <label style={label}>Email de acesso *</label>
        <input
          style={inputStyle}
          type="email"
          placeholder="clinica@exemplo.com"
          value={conta.email}
          onChange={(e) => setConta({ ...conta, email: e.target.value })}
        />
        <label style={label}>Senha inicial *</label>
        <input
          style={inputStyle}
          type="text"
          placeholder="senha que a clinica vai usar"
          value={conta.senha}
          onChange={(e) => setConta({ ...conta, senha: e.target.value })}
        />
      </div>

      <button
        onClick={salvar}
        disabled={!podeSalvar || salvando}
        style={{
          marginTop: 24,
          width: "100%",
          padding: 14,
          borderRadius: 8,
          border: "none",
          background: podeSalvar ? "var(--accent)" : "var(--border)",
          color: podeSalvar ? "var(--accent-contrast)" : "var(--muted)",
          fontWeight: 700,
          fontSize: 15,
          cursor: podeSalvar ? "pointer" : "default",
        }}
      >
        {salvando ? "Salvando..." : "Criar clinica + acesso"}
      </button>

      {erro && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "var(--danger-bg)",
            borderRadius: 8,
            color: "var(--danger)",
            fontSize: 14,
          }}
        >
          {erro}
        </div>
      )}

      {salvo && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: "var(--ok-bg)",
            borderRadius: 8,
            color: "var(--ok)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Clinica criada!</div>
          <div style={{ fontSize: 14, color: "var(--text)" }}>
            Passa esses dados pra clinica logar em <code>/login</code>:
          </div>
          <div
            style={{
              marginTop: 8,
              padding: 12,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 14,
              color: "var(--text)",
            }}
          >
            <div>
              <span style={{ color: "var(--muted)" }}>Email:</span> {salvo.email}
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ color: "var(--muted)" }}>Senha:</span> {salvo.senha}
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 14 }}>
            <a href="/admin" style={{ color: "var(--ok)" }}>
              Voltar ao painel do admin
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
