// Leitura de IMAGEM e PDF enviados na conversa do WhatsApp.
// Fluxo: webhook recebe a midia -> baixa (mesmo pipeline do audio) -> manda pro
// Claude (visao/documento) extrair o conteudo -> o texto extraido entra na
// conversa e a IA segue o atendimento (ex: validar guia de exame).
//
// Nunca lanca: { texto: null } em qualquer falha (webhook cai no fallback).

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELO } from "./claude";
import { baixarMidiaComUrl } from "./transcrever";
const MAX_MIDIA_BYTES = 8 * 1024 * 1024; // guia de exame e pequena; 8MB de teto

// Sobe a midia pro Storage do Supabase (bucket publico "guias") e devolve a
// URL PERMANENTE. Necessario porque: (1) a maioria dos payloads da uazapi nao
// traz URL direta (vem .enc ou so bytes via download), e (2) mesmo quando
// traz, e CDN do WhatsApp que EXPIRA — a atendente clicaria num link morto.
// Nome do arquivo leva token aleatorio (bucket publico = URL e o segredo).
async function subirGuiaStorage(buf: Buffer, tipo: string): Promise<string | null> {
  try {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!base || !key) return null;
    const ext = tipo === "jpeg" ? "jpg" : tipo; // pdf|jpg|png|webp
    const mime = tipo === "pdf" ? "application/pdf" : `image/${tipo}`;
    const rand = Math.random().toString(36).slice(2, 10);
    const caminho = `${new Date().toISOString().slice(0, 7)}/guia-${Date.now()}-${rand}.${ext}`;
    const res = await fetch(`${base}/storage/v1/object/guias/${caminho}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": mime },
      body: new Uint8Array(buf),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn("[lermidia] upload da guia falhou:", res.status);
      return null;
    }
    return `${base}/storage/v1/object/public/guias/${caminho}`;
  } catch (e: any) {
    console.warn("[lermidia] upload da guia falhou:", e.message);
    return null;
  }
}

// detecta o tipo real pelos bytes (nao confia em extensao/mime do payload)
function detectarTipo(buf: Buffer): "pdf" | "jpeg" | "png" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

const INSTRUCAO =
  "Voce le documentos e imagens enviados por pacientes de uma clinica no WhatsApp (geralmente guia/pedido medico de exame, carteirinha de convenio ou foto de documento). Extraia APENAS o conteudo util em portugues, direto: se for pedido/guia de exame, liste os procedimentos/exames solicitados (nomes exatos), o medico solicitante e o convenio se aparecerem; se for carteirinha, o convenio e o numero; se for outra coisa, descreva em 1-2 frases o que e. Sem introducao, sem opiniao.";

/**
 * Baixa e le a midia do webhook. Retorna o texto extraido + a URL do arquivo
 * (pra anexar como guia na consulta) + o tipo detectado.
 */
export async function lerMidia(
  body: any,
  instanceToken: string
): Promise<{ texto: string | null; url: string | null; tipo: string | null }> {
  try {
    const { buf, url } = await baixarMidiaComUrl(body, instanceToken);
    if (!buf || buf.length === 0 || buf.length > MAX_MIDIA_BYTES) {
      return { texto: null, url, tipo: null };
    }
    const tipo = detectarTipo(buf);
    if (!tipo) return { texto: null, url, tipo: null };

    const b64 = buf.toString("base64");
    const bloco: any =
      tipo === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image", source: { type: "base64", media_type: `image/${tipo}`, data: b64 } };

    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 600,
      system: INSTRUCAO,
      messages: [
        {
          role: "user",
          content: [bloco, { type: "text", text: "Extraia o conteudo util deste arquivo." }],
        },
      ],
    });
    const texto = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    // guarda a guia no NOSSO storage (URL permanente pro card da agenda);
    // se o upload falhar, cai na URL direta do payload (melhor que nada)
    const urlPermanente = (await subirGuiaStorage(buf, tipo)) || url;
    return { texto: texto || null, url: urlPermanente, tipo };
  } catch (e: any) {
    console.warn("[lermidia] falhou (fallback de texto):", e.message);
    return { texto: null, url: null, tipo: null };
  }
}
