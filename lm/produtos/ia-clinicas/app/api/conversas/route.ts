import { NextRequest, NextResponse } from "next/server";
import { pausarIAPaciente, iaPausadaPaciente, salvarMensagem, instanciaDaClinica, limparConversa, salvarObservacoesPaciente, marcarConversaImportante, salvarCrmPaciente, apagarContato, registrarLog } from "@/lib/db";
import { enviarTexto } from "@/lib/uazapi";
import { clinicaPermitida } from "@/lib/sessao";

// POST /api/conversas — o ATENDENTE envia mensagem pro paciente direto pela
// tela (sai pelo WhatsApp da clinica). Enviar ASSUME a conversa automaticamente
// (pausa a IA pra ela nao falar por cima do humano).
// Body: { clinica_id, telefone, texto }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const telefone = String(body.telefone || "").replace(/\D/g, "");
  const texto = String(body.texto || "").trim().slice(0, 2000);
  if (!telefone) return NextResponse.json({ erro: "telefone invalido" }, { status: 400 });
  if (!texto) return NextResponse.json({ erro: "mensagem vazia" }, { status: 400 });

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

  // manda de verdade e SO ENTAO registra (nao gravar mensagem que nao saiu)
  const r = await enviarTexto(inst.uazapi_token, telefone, texto);
  if (!r.ok) {
    return NextResponse.json({ erro: `não consegui enviar: ${r.erro || "falha no WhatsApp"}` }, { status: 502 });
  }
  await salvarMensagem({
    clinica_id: permitida,
    instancia_id: inst.id,
    telefone,
    role: "assistant",
    conteudo: texto,
    origem: "humano", // marca quem digitou (a bolha mostra "atendente")
  });
  // enviar pela tela = humano assumiu (IA cala ate devolverem)
  await pausarIAPaciente(permitida, telefone, true);
  return NextResponse.json({ ok: true, pausada: true });
}

// PATCH /api/conversas — acoes rapidas sobre uma conversa. Body sempre com
// { clinica_id, telefone } mais UM dos campos abaixo:
//  - pausar: boolean       -> assume (true) ou devolve pra IA (false)
//  - importante: boolean   -> estrela da caixa de entrada
//  - crm: {etapa,tipo,...} -> move o card no quadro do CRM
// ISOLAMENTO: so opera na clinica da sessao (admin passa clinica_id).
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const telefone = String(body.telefone || "").replace(/\D/g, "");
  if (!telefone) return NextResponse.json({ erro: "telefone invalido" }, { status: 400 });

  if (typeof body.importante === "boolean") {
    await marcarConversaImportante(permitida, telefone, body.importante);
    return NextResponse.json({ ok: true, importante: body.importante });
  }

  if (body.crm && typeof body.crm === "object") {
    await salvarCrmPaciente(permitida, telefone, {
      etapa: body.crm.etapa,
      tipo: body.crm.tipo,
      notas: body.crm.notas,
      tags: body.crm.tags,
    });
    return NextResponse.json({ ok: true });
  }

  await pausarIAPaciente(permitida, telefone, Boolean(body.pausar));
  const pausada = await iaPausadaPaciente(permitida, telefone);
  return NextResponse.json({ ok: true, pausada });
}

// PUT /api/conversas — salva as OBSERVACOES da secretaria no card do paciente
// (lapis no resumo do atendimento). Body: { clinica_id, telefone, observacoes }
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const telefone = String(body.telefone || "").replace(/\D/g, "");
  if (!telefone) return NextResponse.json({ erro: "telefone invalido" }, { status: 400 });

  await salvarObservacoesPaciente(permitida, telefone, String(body.observacoes ?? ""));
  return NextResponse.json({ ok: true });
}

// DELETE /api/conversas — LIMPA o historico de um paciente (apaga as mensagens
// e reativa a IA). Pro proximo "oi" comecar do zero — util pra TESTAR com um
// numero que ja tem historico. Body: { clinica_id, telefone }
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const telefone = String(body.telefone || "").replace(/\D/g, "");
  if (!telefone) return NextResponse.json({ erro: "telefone invalido" }, { status: 400 });

  // apagarContato: true -> remove o CONTATO INTEIRO (mensagens, duvidas,
  // consultas e cadastro do paciente) em vez de so limpar o historico
  if (body.apagarContato === true) {
    await apagarContato(permitida, telefone);
    await registrarLog(permitida, "conversa", `🗑️ Contato apagado: ${telefone}`).catch(() => {});
    return NextResponse.json({ ok: true, contatoApagado: true });
  }

  const apagadas = await limparConversa(permitida, telefone);
  return NextResponse.json({ ok: true, apagadas });
}
