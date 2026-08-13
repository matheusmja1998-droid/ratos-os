import { NextRequest, NextResponse } from "next/server";
import { pausarIAPaciente, salvarMensagem, instanciaDaClinica } from "@/lib/db";
import { enviarMidia } from "@/lib/uazapi";
import { clinicaPermitida } from "@/lib/sessao";

// POST /api/conversas/midia — o ATENDENTE envia AUDIO gravado no painel ou um
// ARQUIVO (📎) pro paciente, pelo WhatsApp da clinica. Enviar assume a conversa
// (IA pausa), igual ao envio de texto.
// Body: { clinica_id, telefone, tipo: "audio"|"arquivo"|"imagem",
//         arquivo: dataURL base64, nome?: string }
//
// LIMITE: ~4MB de body na Vercel — o front comprime/limita antes de mandar.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const telefone = String(body.telefone || "").replace(/\D/g, "");
  const arquivo = String(body.arquivo || "");
  const nome = String(body.nome || "").slice(0, 120);
  const tipoIn = String(body.tipo || "");
  if (!telefone) return NextResponse.json({ erro: "telefone invalido" }, { status: 400 });
  if (!arquivo.startsWith("data:")) {
    return NextResponse.json({ erro: "arquivo invalido (esperado data-URL base64)" }, { status: 400 });
  }
  if (arquivo.length > 4_000_000) {
    return NextResponse.json({ erro: "arquivo grande demais (limite 3MB)" }, { status: 413 });
  }

  // mapeia pro tipo da uazapi. Imagem vai como foto; o resto como documento.
  const tipo: "audio" | "document" | "image" =
    tipoIn === "audio" ? "audio" : tipoIn === "imagem" ? "image" : "document";

  const inst = await instanciaDaClinica(permitida);
  if (!inst?.uazapi_token) {
    return NextResponse.json({ erro: "nenhum WhatsApp conectado nessa clínica" }, { status: 400 });
  }
  const conectada = inst.status === "conectado" || inst.status === "connected" || inst.status === "open";
  if (!conectada) {
    return NextResponse.json(
      { erro: "o WhatsApp da clínica está DESCONECTADO — conecte em Números de WhatsApp pra enviar" },
      { status: 409 }
    );
  }

  const r = await enviarMidia(inst.uazapi_token, telefone, {
    tipo,
    arquivo,
    nomeArquivo: nome || undefined,
  });
  if (!r.ok) {
    return NextResponse.json(
      { erro: `não consegui enviar: ${r.erro || "falha no WhatsApp"}` },
      { status: 502 }
    );
  }

  await salvarMensagem({
    clinica_id: permitida,
    instancia_id: inst.id,
    telefone,
    role: "assistant",
    conteudo:
      tipo === "audio"
        ? "[🎤 áudio enviado pelo atendente]"
        : tipo === "image"
          ? `[🖼️ imagem enviada pelo atendente${nome ? `: ${nome}` : ""}]`
          : `[📎 arquivo enviado pelo atendente${nome ? `: ${nome}` : ""}]`,
    origem: "humano",
  });
  // enviar pela tela = humano assumiu (IA cala ate devolverem)
  await pausarIAPaciente(permitida, telefone, true);
  return NextResponse.json({ ok: true, pausada: true });
}
