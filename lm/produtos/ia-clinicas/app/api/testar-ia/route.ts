import { NextRequest, NextResponse } from "next/server";
import { responder } from "@/lib/ia";
import { clinicaPermitida, sessaoAtual } from "@/lib/sessao";
import { listClinicas, mensagensDeTesteNaUltimaHora } from "@/lib/db";

// COTA do simulador: cada chamada consome credito real da API da Claude. Sem
// limite, uma conta comprometida (ou um script em loop) rodava a noite inteira
// e gerava conta de milhares de reais. 60 msgs/hora por clinica cobre qualquer
// teste honesto de sobra.
const COTA_POR_HORA = 60;

// POST /api/testar-ia  → simulador do painel: a clinica conversa com a
// propria IA sem precisar do WhatsApp real. Body: { clinicaId, texto, telefone? }.
//
// ISOLAMENTO: conta clinica sempre testa a propria (ignora clinicaId do body).
// Admin: usa o clinicaId enviado, ou cai na primeira clinica se nao vier (igual
// as paginas fazem) — assim o admin nao toma "acesso negado" sem ?clinica=.
//
// O telefone do teste e SEMPRE prefixado com "0000" — numero impossivel no
// E.164, entao a conversa de teste nunca colide com paciente real nem dispara
// envio pro WhatsApp (aqui a resposta volta so pra tela).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessao = await sessaoAtual();
  if (!sessao) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });

  let clinicaId = await clinicaPermitida(body.clinicaId ?? null);
  // admin sem clinicaId no body: cai na primeira clinica cadastrada
  if (!clinicaId && sessao.papel === "admin") {
    const todas = await listClinicas();
    clinicaId = todas[0]?.id ?? null;
  }
  if (!clinicaId) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const texto = String(body.texto || "").trim().slice(0, 1000);
  if (!texto) return NextResponse.json({ erro: "texto vazio" }, { status: 400 });

  // cota por clinica/hora (fail-open: erro na contagem nao bloqueia o teste)
  const usoNaHora = await mensagensDeTesteNaUltimaHora(clinicaId).catch(() => 0);
  if (usoNaHora >= COTA_POR_HORA) {
    return NextResponse.json(
      { erro: `limite de ${COTA_POR_HORA} mensagens de teste por hora atingido. Tenta de novo mais tarde.` },
      { status: 429 }
    );
  }

  const sufixo = String(body.telefone || "").replace(/\D/g, "").slice(0, 10) || "0";
  const telefone = `0000${sufixo}`;

  try {
    const { texto: resposta, passouPraHumano } = await responder({
      clinicaId,
      telefone,
      texto,
    });
    return NextResponse.json({ resposta, passouPraHumano, telefone });
  } catch (e: any) {
    console.error("[testar-ia] erro:", e.message);
    return NextResponse.json({ erro: "falha ao gerar resposta da IA" }, { status: 500 });
  }
}
