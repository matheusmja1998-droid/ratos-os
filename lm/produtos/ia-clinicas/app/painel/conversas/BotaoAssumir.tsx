"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconeRobo, IconeAtendente, IconeLixeira } from "../Icones";

// Interruptor da conversa: um switch que liga/desliga a IA.
//  - LIGADO  = a IA atende esse paciente
//  - DESLIGADO = a recepcao assumiu (IA calada) e conduz pela tela/celular
// Substitui o par de botoes antigo: um toque so, estado visivel de longe.
export default function BotaoAssumir({
  clinicaId,
  telefone,
  pausadaInicial,
}: {
  clinicaId: string;
  telefone: string;
  pausadaInicial: boolean;
}) {
  const router = useRouter();
  const [pausada, setPausada] = useState(pausadaInicial);
  const [carregando, setCarregando] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [erro, setErro] = useState("");

  const iaAtiva = !pausada;

  // LIMPAR CONVERSA: apaga o historico desse paciente pra a IA comecar do zero.
  // Util pra TESTAR com um numero que ja falou com a clinica (senao a IA
  // continua de onde parou). Pede confirmacao — apaga o historico de verdade.
  async function limpar() {
    if (!confirm("Apagar o histórico dessa conversa? A IA vai tratar o próximo 'oi' como paciente novo. (útil pra testar)")) return;
    setErro("");
    setLimpando(true);
    try {
      const res = await fetch("/api/conversas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, telefone }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || "erro");
    } finally {
      setLimpando(false);
    }
  }

  // APAGA o contato inteiro (mensagens + consultas + cadastro) — some da lista
  async function apagarContato() {
    if (!confirm("APAGAR esse contato de vez?\n\nRemove as mensagens, as consultas e o cadastro do paciente. Não tem volta. (Pra só zerar a conversa, usa o Limpar.)")) return;
    setErro("");
    setLimpando(true);
    try {
      const res = await fetch("/api/conversas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, telefone, apagarContato: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      window.location.href = "/painel/conversas"; // volta pra lista (contato ja era)
    } catch (e: any) {
      setErro(e?.message || "erro");
      setLimpando(false);
    }
  }

  async function alternar() {
    setErro("");
    setCarregando(true);
    // otimista: o switch anda na hora, o servidor confirma logo atras
    const alvo = !pausada;
    setPausada(alvo);
    try {
      const res = await fetch("/api/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, telefone, pausar: alvo }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      setPausada(Boolean(j.pausada));
      router.refresh(); // sincroniza o resto da tela sem recarregar
    } catch (e: any) {
      setPausada(!alvo); // desfaz: nao pode dizer que a IA voltou se nao voltou
      setErro(e?.message || "erro");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {/* FAIXA DE QUEM ESTA ATENDENDO: o switch ja diz, mas a faixa colorida e
          o que a recepcao le de longe ao abrir a conversa pra acompanhar. */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 12px",
          borderRadius: 20,
          fontSize: 12.5,
          fontWeight: 700,
          whiteSpace: "nowrap",
          background: iaAtiva ? "rgba(37,99,235,0.12)" : "rgba(202,138,4,0.14)",
          color: iaAtiva ? "var(--accent)" : "#a16207",
          border: `1px solid ${iaAtiva ? "rgba(37,99,235,0.3)" : "rgba(202,138,4,0.35)"}`,
        }}
      >
        <span style={{ display: "grid", placeItems: "center" }}>
          {iaAtiva ? <IconeRobo size={15} /> : <IconeAtendente size={15} />}
        </span>
        {iaAtiva ? "Atendida pela IA" : "Atendida por um atendente"}
      </span>
      <button
        onClick={alternar}
        disabled={carregando}
        className="switch"
        data-ligado={iaAtiva ? "true" : "false"}
        title={iaAtiva ? "IA atendendo — clique pra assumir a conversa" : "Você no comando — clique pra devolver pra IA"}
        aria-pressed={iaAtiva}
      >
        <span className="switch-trilho">
          <span className="switch-bolinha" />
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <span style={{ display: "grid", placeItems: "center", color: iaAtiva ? "var(--ok)" : "#ca8a04" }}>
            {iaAtiva ? <IconeRobo size={16} /> : <IconeAtendente size={16} />}
          </span>
          {iaAtiva ? "IA atendendo" : "Você no comando"}
        </span>
      </button>

      <button
        onClick={limpar}
        disabled={limpando}
        className="btn-fantasma"
        title="Apaga o histórico pra a IA começar do zero (pra testar)"
        style={{
          padding: "7px 11px",
          fontSize: 13,
          whiteSpace: "nowrap",
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <IconeLixeira size={15} />
        {limpando ? "..." : "Limpar"}
      </button>
      <button
        onClick={apagarContato}
        disabled={limpando}
        className="btn-fantasma"
        title="Apaga o contato inteiro: mensagens, consultas e cadastro (irreversível)"
        style={{ padding: "7px 12px", fontSize: 13, whiteSpace: "nowrap", color: "var(--danger)", borderColor: "var(--danger)", display: "flex", alignItems: "center", gap: 6 }}
      >
        <IconeLixeira size={15} />
        {limpando ? "..." : "Apagar contato"}
      </button>
      {erro && <span style={{ color: "var(--danger)", fontSize: 12 }}>{erro}</span>}
    </div>
  );
}
