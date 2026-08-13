import { NextRequest, NextResponse } from "next/server";
import {
  upsertProfissional,
  removerProfissional,
  setHorarios,
  getProfissional,
} from "@/lib/db";
import { clinicaPermitida } from "@/lib/sessao";

// Guard de isolamento pra profissional EXISTENTE: carrega o profissional real
// e confirma que ele pertence a uma clinica que a sessao pode operar.
// CRITICO: nao confiar no body.clinica_id (o atacante controla). A verdade e
// o clinica_id gravado no proprio profissional (body.id).
async function donoPermitido(
  profId: string
): Promise<{ ok: true; prof: any } | { ok: false; status: number; erro: string }> {
  if (!profId) return { ok: false, status: 400, erro: "id do profissional obrigatorio" };
  const prof = await getProfissional(profId);
  if (!prof) return { ok: false, status: 404, erro: "profissional nao encontrado" };
  const permitida = await clinicaPermitida(prof.clinica_id);
  if (!permitida || permitida !== prof.clinica_id) {
    return { ok: false, status: 403, erro: "acesso negado" };
  }
  return { ok: true, prof };
}

// POST /api/profissionais — cria novo profissional (na propria clinica) com horarios padrao
export async function POST(req: NextRequest) {
  const body = await req.json();
  // criar: valida a clinica de destino (aqui body.clinica_id e o alvo mesmo)
  const permitida = await clinicaPermitida(body.clinica_id);
  if (!permitida || permitida !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  try {
    const prof = await upsertProfissional({
      clinica_id: body.clinica_id,
      nome: body.nome,
      especialidade: body.especialidade,
      duracao_min: body.duracao_min || 30,
      convenios: body.convenios ?? null,
      info: body.info ?? null,
    });

    // Horarios padrao: seg-sex 08-12 e 14-18
    const horarios = [1, 2, 3, 4, 5].flatMap((dia) => [
      { dia_semana: dia, hora_inicio: "08:00", hora_fim: "12:00" },
      { dia_semana: dia, hora_inicio: "14:00", hora_fim: "18:00" },
    ]);
    await setHorarios(prof.id, horarios);

    return NextResponse.json({ ok: true, prof });
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || "Erro ao criar profissional." }, { status: 500 });
  }
}

// PATCH /api/profissionais — atualiza profissional e seus horarios
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const g = await donoPermitido(body.id);
  if (!g.ok) return NextResponse.json({ erro: g.erro }, { status: g.status });

  try {
    const prof = await upsertProfissional({
      id: body.id,
      clinica_id: g.prof.clinica_id, // usa o clinica_id REAL, nao o do body
      nome: body.nome,
      especialidade: body.especialidade,
      duracao_min: body.duracao_min,
      ...(body.convenios !== undefined ? { convenios: body.convenios } : {}),
      ...(body.info !== undefined ? { info: body.info } : {}),
    });

    if (body.horarios && Array.isArray(body.horarios)) {
      await setHorarios(prof.id, body.horarios);
    }

    return NextResponse.json({ ok: true, prof });
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || "Erro ao atualizar." }, { status: 500 });
  }
}

// DELETE /api/profissionais — marca como inativo (soft delete)
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const g = await donoPermitido(body.id);
  if (!g.ok) return NextResponse.json({ erro: g.erro }, { status: g.status });

  try {
    await removerProfissional(body.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // erro de negocio (ex: tem consulta futura) volta como 409
    const msg = e?.message || "Erro ao remover.";
    const status = /consulta|futura|agendada|confirmada/i.test(msg) ? 409 : 500;
    return NextResponse.json({ erro: msg }, { status });
  }
}
