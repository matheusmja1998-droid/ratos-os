"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// Pagina de conexao do WhatsApp: mostra o QR ao vivo e atualiza sozinho.
// O QR do WhatsApp expira em ~20s, entao a gente recarrega a cada 15s.
function ConectarInner() {
  const params = useSearchParams();
  const clinica = params.get("clinica") || "";
  // MULTI-NUMERO: ?instancia=ID reconecta um numero especifico; ?novo=1 cria
  // mais um pra clinica (segundo aparelho: recepcao, financeiro...).
  const instanciaParam = params.get("instancia") || "";
  const querNovo = params.get("novo") === "1";
  const nomeNovo = params.get("nome") || "";

  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("carregando...");
  const [paircode, setPaircode] = useState<string | null>(null);
  const [recriada, setRecriada] = useState(false);
  const [nomeNumero, setNomeNumero] = useState<string | null>(null);
  // id da instancia que ESTA tela criou/abriu. Guardado num ref porque o poll
  // de 15s precisa ler o valor atual sem re-registrar o intervalo — sem isso,
  // cada renovacao do QR com ?novo=1 criaria OUTRA instancia (lixo na uazapi).
  const instanciaRef = useRef(instanciaParam);

  async function atualizar() {
    try {
      const p = new URLSearchParams({ clinica });
      if (instanciaRef.current) p.set("instancia", instanciaRef.current);
      else if (querNovo) {
        p.set("novo", "1");
        if (nomeNovo) p.set("nome", nomeNovo);
      }
      const res = await fetch(`/api/qr?${p.toString()}`);
      const data = await res.json();
      if (data.erro) {
        setStatus("erro: " + data.erro);
        return;
      }
      // a partir daqui o poll fala sempre com ESTA instancia
      if (data.instancia_id) instanciaRef.current = data.instancia_id;
      if (data.nome) setNomeNumero(data.nome);
      setStatus(data.status || "?");
      if (data.recriada) setRecriada(true); // a API recriou a instancia sozinha (token tinha morrido)
      setPaircode(data.paircode || null);
      if (data.qrcode) {
        const q = data.qrcode.startsWith("data:")
          ? data.qrcode
          : `data:image/png;base64,${data.qrcode}`;
        setQr(q);
      }
    } catch (e: any) {
      setStatus("erro de rede");
    }
  }

  useEffect(() => {
    atualizar();
    const t = setInterval(atualizar, 15000); // renova antes de expirar
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinica, instanciaParam, querNovo]);

  const conectado = status === "connected" || status === "open" || status === "conectado";

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 32, textAlign: "center" }}>
      <a
        href={`/painel/whatsapps${clinica ? `?clinica=${clinica}` : ""}`}
        style={{ color: "var(--link)", fontSize: 14, textDecoration: "none", display: "block", textAlign: "left" }}
      >
        ← voltar pros números
      </a>
      <h1 style={{ fontSize: 22 }}>
        {querNovo && !nomeNumero ? "Conectar outro número" : "Conectar WhatsApp"}
      </h1>
      {nomeNumero && (
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: -8, marginBottom: 8 }}>
          número: <b style={{ color: "var(--text)" }}>{nomeNumero}</b>
        </div>
      )}
      <p style={{ color: "var(--muted)", fontSize: 14 }}>
        Abre o WhatsApp no celular → Aparelhos conectados → Conectar aparelho → aponta pro QR abaixo.
        {querNovo && " Use um celular com um número DIFERENTE dos já conectados."}
      </p>

      {conectado ? (
        <>
          <div style={{ marginTop: 30, padding: 30, background: "var(--ok-bg)", borderRadius: 12, color: "var(--ok)", fontSize: 18, fontWeight: 600 }}>
            WhatsApp conectado!<br />
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>
              A IA ja esta atendendo nesse numero.
            </span>
          </div>
          <a
            href={`/painel/teste-whats${clinica ? `?clinica=${clinica}` : ""}`}
            style={{
              display: "inline-block",
              marginTop: 16,
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid var(--border-forte)",
              background: "var(--surface)",
              color: "var(--link)",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            testar o atendimento →
          </a>
        </>
      ) : (
        <>
          <div
            style={{
              marginTop: 24,
              background: "#fff",
              borderRadius: 12,
              padding: 16,
              display: "inline-block",
              minWidth: 280,
              minHeight: 280,
            }}
          >
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code" style={{ width: 260, height: 260 }} />
            ) : (
              <div style={{ color: "#666", paddingTop: 120 }}>gerando QR...</div>
            )}
          </div>
          {paircode && (
            <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
              ou use o codigo: <b style={{ color: "var(--text)", letterSpacing: 2 }}>{paircode}</b>
            </div>
          )}
          <div style={{ marginTop: 16, color: "var(--muted)", fontSize: 13 }}>
            status: <b>{status}</b> · o QR renova sozinho a cada 15s
          </div>
          {recriada && (
            <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 12 }}>
              a sessao anterior tinha expirado no servidor — recriei sozinho, so escanear o QR novo
            </div>
          )}
          <button
            onClick={atualizar}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid var(--border-forte)",
              background: "var(--surface)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            atualizar agora
          </button>
        </>
      )}
    </main>
  );
}

export default function Conectar() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>carregando...</div>}>
      <ConectarInner />
    </Suspense>
  );
}
