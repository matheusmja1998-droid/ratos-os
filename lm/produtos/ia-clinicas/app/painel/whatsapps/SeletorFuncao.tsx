"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Seletor da FUNÇÃO de cada número de WhatsApp: Atendimento ou Financeiro.
// A IA recebe o canal junto com cada mensagem e muda a postura de acordo
// (no financeiro fala de pagamento/valores; no atendimento agenda normal).
const FUNCOES = [
  { valor: "atendimento", rotulo: "Atendimento" },
  { valor: "financeiro", rotulo: "Financeiro" },
];

export default function SeletorFuncao({ id, funcaoInicial }: { id: string; funcaoInicial: string }) {
  const router = useRouter();
  const [funcao, setFuncao] = useState(funcaoInicial || "atendimento");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function trocar(nova: string) {
    const anterior = funcao;
    setFuncao(nova);
    setErro("");
    setSalvando(true);
    try {
      const res = await fetch("/api/instancias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao: "funcao", funcao: nova }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      router.refresh();
    } catch (e: any) {
      setFuncao(anterior);
      setErro(e?.message || "erro");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <select
        className="input"
        value={funcao}
        disabled={salvando}
        onChange={(e) => trocar(e.target.value)}
        title="Pra que serve esse número — a IA ajusta a conversa conforme o canal"
        style={{ marginTop: 0, width: "auto", padding: "6px 8px", fontSize: 13, fontWeight: 600 }}
      >
        {FUNCOES.map((f) => (
          <option key={f.valor} value={f.valor}>
            {f.rotulo}
          </option>
        ))}
      </select>
      {erro && <span style={{ color: "var(--danger)", fontSize: 12 }}>{erro}</span>}
    </span>
  );
}
