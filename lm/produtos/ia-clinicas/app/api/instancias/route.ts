import { NextRequest, NextResponse } from "next/server";
import { upsertInstancia, getInstancia, removerInstancia } from "@/lib/db";
import { criarInstancia, getQrCode, desconectarInstancia, deletarInstancia } from "@/lib/uazapi";
import { clinicaPermitida } from "@/lib/sessao";

// POST /api/instancias  → cria uma instancia uazapi nova e devolve pra conectar
// Body: { clinica_id, nome }. ISOLAMENTO: so na propria clinica.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const permitida = await clinicaPermitida(body.clinica_id);
  if (!permitida || permitida !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  const { token, demo, erro } = await criarInstancia(body.nome || "clinica");
  if (erro) return NextResponse.json({ ok: false, erro }, { status: 500 });

  const instancia = await upsertInstancia({
    clinica_id: body.clinica_id,
    nome: body.nome,
    numero: body.numero,
    uazapi_instance: body.nome,
    uazapi_token: token,
    status: "desconectado",
  });

  return NextResponse.json({ ok: true, instancia, demo });
}

// PATCH /api/instancias  → DESCONECTAR um numero (logout) OU trocar a FUNCAO.
// Body: { id, acao: "desconectar" } | { id, acao: "funcao", funcao: "atendimento"|"financeiro" }
// ISOLAMENTO: so opera instancia da clinica da sessao.
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (body.acao !== "desconectar" && body.acao !== "funcao") {
    return NextResponse.json({ erro: "acao invalida (desconectar|funcao)" }, { status: 400 });
  }
  const inst = await getInstancia(body.id);
  if (!inst) return NextResponse.json({ erro: "numero nao encontrado" }, { status: 404 });
  const permitida = await clinicaPermitida(inst.clinica_id);
  if (!permitida || permitida !== inst.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  // troca a FUNCAO do numero (a IA muda a postura conforme o canal)
  if (body.acao === "funcao") {
    const funcao = body.funcao === "financeiro" ? "financeiro" : "atendimento";
    const instancia = await upsertInstancia({ ...inst, funcao });
    return NextResponse.json({ ok: true, instancia });
  }

  // faz logout na uazapi (best-effort) e marca desconectado no banco de qualquer jeito
  await desconectarInstancia(inst.uazapi_token);
  const instancia = await upsertInstancia({ ...inst, status: "desconectado" });
  return NextResponse.json({ ok: true, instancia });
}

// DELETE /api/instancias  → REMOVE de vez um numero da lista da clinica.
// Body: { id }. Faz logout + delete na uazapi (libera o slot) e apaga o
// registro no banco. ISOLAMENTO: so opera instancia da clinica da sessao.
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ erro: "falta id" }, { status: 400 });

  const inst = await getInstancia(body.id);
  if (!inst) return NextResponse.json({ erro: "numero nao encontrado" }, { status: 404 });
  const permitida = await clinicaPermitida(inst.clinica_id);
  if (!permitida || permitida !== inst.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  // apaga no servidor uazapi (best-effort) e remove o registro do banco de qualquer jeito
  await deletarInstancia(inst.uazapi_token);
  await removerInstancia(inst.id);
  return NextResponse.json({ ok: true });
}

// GET /api/instancias?token=XXX  → QR code pra clinica escanear e conectar
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ erro: "falta ?token=" }, { status: 400 });
  const qr = await getQrCode(token);
  return NextResponse.json(qr);
}
