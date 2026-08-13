import { NextRequest, NextResponse } from "next/server";
import {
  listDuvidasPendentes,
  getDuvida,
  marcarDuvidaRespondida,
  salvarMensagem,
  instanciaDaClinica,
} from "@/lib/db";
import { responder } from "@/lib/ia";
import { enviarTexto } from "@/lib/uazapi";
import { clinicaPermitida } from "@/lib/sessao";

// DÚVIDAS pro especialista: a IA abre quando não sabe responder; a secretária
// resolve por aqui. A resposta SEMPRE vira aprendizado (entra no prompt da IA
// nos próximos atendimentos parecidos).
export const maxDuration = 60;

// GET /api/duvidas?clinica=ID[&telefone=...] → pendentes (pro badge e painel)
export async function GET(req: NextRequest) {
  const clinicaId = await clinicaPermitida(req.nextUrl.searchParams.get("clinica"));
  if (!clinicaId) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  const telefone = req.nextUrl.searchParams.get("telefone")?.replace(/\D/g, "") || undefined;
  try {
    const pendentes = await listDuvidasPendentes(clinicaId, telefone);
    return NextResponse.json({ total: pendentes.length, pendentes });
  } catch {
    // tabela ainda nao migrada: nao quebra o painel
    return NextResponse.json({ total: 0, pendentes: [] });
  }
}

// POST /api/duvidas — a secretária RESPONDE uma dúvida.
// Body: { clinica_id, id, resposta, modo: "ia" | "manual" }
//  - modo "manual": o texto da secretária vai EXATAMENTE como ela escreveu.
//  - modo "ia": a IA recebe a resposta oficial e formula a mensagem pro
//    paciente no tom da clínica.
// Nos dois casos a dúvida vira APRENDIZADO (a IA usa em casos parecidos).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const duvida = await getDuvida(String(body.id || ""));
  if (!duvida || duvida.clinica_id !== clinicaId) {
    return NextResponse.json({ erro: "dúvida não encontrada" }, { status: 404 });
  }
  if (duvida.status === "respondida") {
    return NextResponse.json({ erro: "essa dúvida já foi respondida" }, { status: 409 });
  }
  const resposta = String(body.resposta || "").trim().slice(0, 2000);
  if (!resposta) return NextResponse.json({ erro: "escreva a resposta" }, { status: 400 });
  const modo: "ia" | "manual" = body.modo === "manual" ? "manual" : "ia";

  const inst = await instanciaDaClinica(clinicaId);
  const conectada =
    inst?.uazapi_token &&
    (inst.status === "conectado" || inst.status === "connected" || inst.status === "open");
  if (!conectada) {
    return NextResponse.json(
      { erro: "o WhatsApp da clínica está desconectado — conecte pra enviar a resposta ao paciente" },
      { status: 409 }
    );
  }

  // registra o aprendizado ANTES de enviar (mesmo se o envio falhar, a
  // resposta oficial ja vale pros proximos casos)
  await marcarDuvidaRespondida(duvida.id, resposta, modo);

  if (modo === "manual") {
    const r = await enviarTexto(inst.uazapi_token, duvida.telefone, resposta);
    if (!r.ok) {
      return NextResponse.json({ erro: `salvei o aprendizado, mas o envio falhou: ${r.erro}` }, { status: 502 });
    }
    await salvarMensagem({
      clinica_id: clinicaId,
      instancia_id: inst.id,
      telefone: duvida.telefone,
      role: "assistant",
      conteudo: resposta,
      origem: "humano", // resposta escrita pela equipe, nao pela IA
    });
    return NextResponse.json({ ok: true, enviado: "manual" });
  }

  // modo IA: injeta a resposta oficial como nota interna e deixa a IA formular
  // a mensagem pro paciente no tom da clinica (o system prompt ja tem o estilo)
  const { texto } = await responder({
    clinicaId,
    telefone: duvida.telefone,
    texto: `[NOTA INTERNA DA EQUIPE — o paciente NAO enviou esta mensagem. A equipe respondeu a duvida pendente "${duvida.pergunta_ia}" com a resposta oficial: "${resposta}". Responda AGORA ao paciente com essa informacao, retomando de onde a conversa parou (voce tinha dito que ia confirmar com o especialista).]`,
  });
  if (texto) {
    const r = await enviarTexto(inst.uazapi_token, duvida.telefone, texto);
    if (!r.ok) {
      return NextResponse.json({ erro: `salvei o aprendizado, mas o envio falhou: ${r.erro}` }, { status: 502 });
    }
  }
  return NextResponse.json({ ok: true, enviado: "ia", mensagem: texto });
}
