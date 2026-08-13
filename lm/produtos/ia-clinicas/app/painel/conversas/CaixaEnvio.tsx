"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconeMic, IconeParar, IconeClipe, IconeEnviar, IconeAlerta } from "../Icones";

// Caixa de envio do ATENDENTE: texto, AUDIO gravado no microfone (vira nota
// de voz no WhatsApp) e ARQUIVO (foto/PDF/documento) — tudo pela tela, sai
// pelo WhatsApp da clinica. Enviar assume a conversa (IA pausa sozinha).
export default function CaixaEnvio({
  clinicaId,
  telefone,
}: {
  clinicaId: string;
  telefone: string;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  // ---- gravacao de audio (MediaRecorder) ----
  const [gravando, setGravando] = useState(false);
  const [audioPreview, setAudioPreview] = useState<string | null>(null); // dataURL pra ouvir antes de enviar
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  async function comecarGravacao() {
    setErro("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      pedacosRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pedacosRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); // libera o microfone
        const blob = new Blob(pedacosRef.current, { type: rec.mimeType || "audio/webm" });
        const leitor = new FileReader();
        leitor.onloadend = () => setAudioPreview(String(leitor.result));
        leitor.readAsDataURL(blob);
      };
      gravadorRef.current = rec;
      rec.start();
      setGravando(true);
    } catch {
      setErro("não consegui acessar o microfone — confere a permissão do navegador");
    }
  }

  function pararGravacao() {
    gravadorRef.current?.stop();
    setGravando(false);
  }

  function descartarAudio() {
    setAudioPreview(null);
  }

  async function enviarAudio() {
    if (!audioPreview || enviando) return;
    await enviarMidia({ tipo: "audio", arquivo: audioPreview });
    setAudioPreview(null);
  }

  // resposta pode vir como TEXTO puro (ex: "Request Entity Too Large" da
  // Vercel) — parse seguro pra nunca estourar "Unexpected token" na cara do usuario
  async function lerResposta(res: Response): Promise<any> {
    const t = await res.text();
    try {
      return JSON.parse(t);
    } catch {
      return {
        erro:
          res.status === 413
            ? "arquivo grande demais (limite 3MB)"
            : `falha no envio (HTTP ${res.status})`,
      };
    }
  }

  // ---- arquivo (anexo) ----
  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) {
      setErro("arquivo grande demais (limite 3MB)");
      return;
    }
    const leitor = new FileReader();
    leitor.onloadend = () =>
      enviarMidia({
        tipo: f.type.startsWith("image/") ? "imagem" : "arquivo",
        arquivo: String(leitor.result),
        nome: f.name,
      });
    leitor.readAsDataURL(f);
  }

  async function enviarMidia(m: { tipo: string; arquivo: string; nome?: string }) {
    setErro("");
    setEnviando(true);
    try {
      const res = await fetch("/api/conversas/midia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, telefone, ...m }),
      });
      const j = await lerResposta(res);
      if (!res.ok) throw new Error(j?.erro || "não consegui enviar");
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || "erro ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setErro("");
    setEnviando(true);
    try {
      const res = await fetch("/api/conversas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, telefone, texto: t }),
      });
      const j = await lerResposta(res);
      if (!res.ok) throw new Error(j?.erro || "não consegui enviar");
      setTexto("");
      router.refresh(); // atualiza as bolhas sem recarregar a página
    } catch (e: any) {
      setErro(e?.message || "erro ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      {erro && (
        <div style={{ marginBottom: 8, padding: "8px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconeAlerta size={14} /> {erro}</span>
        </div>
      )}

      {/* preview do audio gravado: ouve antes de mandar */}
      {audioPreview && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap", padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={audioPreview} style={{ height: 36, flex: 1, minWidth: 200 }} />
          <button className="btn-primario" onClick={enviarAudio} disabled={enviando} style={{ padding: "8px 16px", fontSize: 13 }}>
            {enviando ? "Enviando..." : "Enviar áudio"}
          </button>
          <button className="btn-fantasma" onClick={descartarAudio} disabled={enviando} style={{ padding: "8px 12px", fontSize: 13, color: "var(--danger)" }}>
            descartar
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        {/* anexo */}
        <input ref={arquivoRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: "none" }} onChange={aoEscolherArquivo} />
        <button
          className="btn-fantasma"
          onClick={() => arquivoRef.current?.click()}
          disabled={enviando || gravando}
          title="Enviar arquivo (foto, PDF, documento — até 3MB)"
          style={{ padding: "11px 13px", lineHeight: 1, display: "grid", placeItems: "center" }}
        >
          <IconeClipe size={18} />
        </button>

        <textarea
          className="input"
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder="Escreve a mensagem pro paciente... (Enter envia)"
          style={{ marginTop: 0, flex: 1, resize: "vertical" }}
        />

        {/* gravar / parar */}
        <button
          className={gravando ? "btn-primario" : "btn-fantasma"}
          onClick={gravando ? pararGravacao : comecarGravacao}
          disabled={enviando}
          title={gravando ? "Parar a gravação" : "Gravar áudio pelo microfone"}
          style={{
            padding: "11px 13px",
            lineHeight: 1,
            display: "grid",
            placeItems: "center",
            ...(gravando ? { background: "var(--danger)", borderColor: "var(--danger)", animation: "pulse 1.2s infinite" } : {}),
          }}
        >
          {gravando ? <IconeParar size={18} /> : <IconeMic size={18} />}
        </button>

        <button
          className="btn-primario"
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          style={{ padding: "12px 18px", whiteSpace: "nowrap" }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>{enviando ? "Enviando..." : "Enviar"}{!enviando && <IconeEnviar size={15} />}</span>
        </button>
      </div>
      <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
        {gravando
          ? "Gravando... clica no quadrado pra parar e ouvir antes de enviar."
          : "Enviar pela tela assume a conversa (a IA pausa pra esse paciente). Quando terminar, é só religar a chave da IA ali em cima."}
      </div>
    </div>
  );
}
