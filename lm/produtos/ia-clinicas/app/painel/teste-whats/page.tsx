"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// Testar WhatsApp: a clinica ve a IA funcionando por dentro do painel.
// 1) status da conexao (a rota /api/qr ja diz o status e se auto-recupera)
// 2) simulador de conversa: digita como paciente, a IA responde na tela
//    (mesma lib responder() que atende no WhatsApp real, com agenda real)
type Msg = { de: "paciente" | "ia"; texto: string };

function TesteWhatsInner() {
  const params = useSearchParams();
  const clinica = params.get("clinica") || "";
  const [status, setStatus] = useState("verificando...");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [telefone, setTelefone] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);

  // telefone de teste aleatorio por conversa: o historico da IA nao mistura
  // com testes anteriores (a API prefixa com 0000, nunca vira numero real)
  function novaConversa() {
    setTelefone(String(Math.floor(Math.random() * 1e10)).padStart(10, "0"));
    setMsgs([]);
  }
  useEffect(() => {
    novaConversa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(`/api/qr?clinica=${clinica}`)
      .then((r) => r.json())
      .then((d) => setStatus(d.erro ? "erro" : d.status || "?"))
      .catch(() => setStatus("erro"));
  }, [clinica]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, enviando]);

  const conectado = ["connected", "open", "conectado"].includes(status);
  const verificando = status === "verificando...";
  const sufixoUrl = clinica ? `?clinica=${clinica}` : "";

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setTexto("");
    setMsgs((m) => [...m, { de: "paciente", texto: t }]);
    setEnviando(true);
    try {
      const res = await fetch("/api/testar-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicaId: clinica || undefined, texto: t, telefone }),
      });
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        { de: "ia", texto: data.resposta || `erro: ${data.erro || "sem resposta"}` },
      ]);
    } catch {
      setMsgs((m) => [...m, { de: "ia", texto: "erro de rede — tenta de novo" }]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 32 }}>
      <a
        href={`/painel${sufixoUrl}`}
        style={{ color: "var(--link)", fontSize: 14, textDecoration: "none" }}
      >
        ← voltar
      </a>
      <h1 style={{ fontSize: 22, marginTop: 8 }}>Testar atendimento</h1>

      {/* status da conexao */}
      <div
        style={{
          marginTop: 16,
          padding: "14px 18px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--sombra)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 14,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: conectado ? "var(--ok)" : verificando ? "var(--muted)" : "var(--danger)",
            display: "inline-block",
          }}
        />
        <span style={{ flex: 1, color: "var(--text)" }}>
          WhatsApp {conectado ? "conectado" : verificando ? "verificando..." : "desconectado"}
        </span>
        {!conectado && !verificando && (
          <a
            href={`/painel/conectar${sufixoUrl}`}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--ok-bg)",
              color: "var(--ok)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            reconectar
          </a>
        )}
      </div>

      {/* simulador de conversa */}
      <div
        style={{
          marginTop: 16,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--sombra)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Simulador — escreve como se fosse um paciente
          </span>
          <button
            onClick={novaConversa}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-forte)",
              background: "transparent",
              color: "var(--muted)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            nova conversa
          </button>
        </div>

        <div style={{ height: 380, overflowY: "auto", padding: 16, background: "var(--bg)" }}>
          {msgs.length === 0 && (
            <div
              style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", paddingTop: 140 }}
            >
              Manda um &quot;oi&quot; pra ver a IA atender
            </div>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: m.de === "paciente" ? "flex-end" : "flex-start",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  padding: "10px 14px",
                  borderRadius: 14,
                  fontSize: 14,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  background: m.de === "paciente" ? "var(--accent-soft)" : "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderBottomRightRadius: m.de === "paciente" ? 4 : 14,
                  borderBottomLeftRadius: m.de === "ia" ? 4 : 14,
                }}
              >
                {m.texto}
              </div>
            </div>
          ))}
          {enviando && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 14,
                  fontSize: 14,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                }}
              >
                digitando...
              </div>
            </div>
          )}
          <div ref={fimRef} />
        </div>

        <div
          style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Digite como paciente..."
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--border-forte)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            onClick={enviar}
            disabled={enviando || !texto.trim()}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: "var(--accent)",
              color: "var(--accent-contrast)",
              fontSize: 14,
              fontWeight: 600,
              opacity: enviando || !texto.trim() ? 0.5 : 1,
              cursor: enviando || !texto.trim() ? "default" : "pointer",
            }}
          >
            enviar
          </button>
        </div>
      </div>

      <p style={{ marginTop: 12, color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>
        O simulador usa a mesma IA e a agenda real da clinica: se marcar uma consulta aqui, ela
        aparece na agenda (telefone de teste começando com 0000). Usa &quot;nova conversa&quot;
        pra começar do zero.
      </p>
    </main>
  );
}

export default function TesteWhats() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>carregando...</div>}>
      <TesteWhatsInner />
    </Suspense>
  );
}
