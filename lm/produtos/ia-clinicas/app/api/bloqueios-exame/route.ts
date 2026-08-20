import { NextRequest, NextResponse } from "next/server";
import { listBloqueiosExame, criarBloqueioExame, removerBloqueioExame, registrarLog } from "@/lib/db";
import { clinicaPermitida } from "@/lib/sessao";

// Bloqueios manuais de horario de EXAME. A API da Feegow nao expoe os
// bloqueios da Agenda de Equipamentos, entao a clinica cadastra aqui e a IA
// para de oferecer aquele horario. Isolamento: so a propria clinica.

export async function GET(req: NextRequest) {
  const clinicaId = await clinicaPermitida(req.nextUrl.searchParams.get("clinica"));
  if (!clinicaId) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  const hoje = new Date().toISOString().slice(0, 10);
  const bloqueios = await listBloqueiosExame(clinicaId, hoje).catch(() => []);
  return NextResponse.json({ bloqueios });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId || clinicaId !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  const data = String(body.data || "").slice(0, 10);
  const ini = String(body.hora_inicio || "").slice(0, 5);
  const fim = String(body.hora_fim || "").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(ini) || !/^\d{2}:\d{2}$/.test(fim)) {
    return NextResponse.json({ erro: "preencha a data e o horário (início e fim)" }, { status: 400 });
  }
  if (fim <= ini) return NextResponse.json({ erro: "o fim tem que ser depois do início" }, { status: 400 });

  await criarBloqueioExame({
    clinica_id: clinicaId,
    exame_id: body.exame_id ? String(body.exame_id) : null,
    data,
    hora_inicio: ini,
    hora_fim: fim,
    motivo: body.motivo ? String(body.motivo).slice(0, 120) : undefined,
  });
  await registrarLog(
    clinicaId,
    "sistema",
    `🚫 Horário de exame bloqueado: ${data.slice(8, 10)}/${data.slice(5, 7)} ${ini}-${fim}${body.motivo ? ` (${body.motivo})` : ""}`
  ).catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId || clinicaId !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  // so remove bloqueio DESSA clinica (isolamento)
  const meus = await listBloqueiosExame(clinicaId);
  if (!meus.some((b: any) => b.id === body.id)) {
    return NextResponse.json({ erro: "bloqueio não encontrado" }, { status: 404 });
  }
  await removerBloqueioExame(String(body.id));
  return NextResponse.json({ ok: true });
}
