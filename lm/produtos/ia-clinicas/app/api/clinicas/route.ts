import { NextRequest, NextResponse } from "next/server";
import {
  listClinicas,
  upsertClinica,
  upsertProfissional,
  addHorario,
  listProfissionais,
  listInstancias,
  upsertInstancia,
} from "@/lib/db";
import { sessaoAtual, clinicaPermitida } from "@/lib/sessao";

// GET /api/clinicas  → lista todas (SO ADMIN)
export async function GET() {
  const s = await sessaoAtual();
  if (!s || s.papel !== "admin") {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  const clinicas = await Promise.all(
    (await listClinicas()).map(async (c) => {
      // credencial da integracao NUNCA vai pro browser
      const { feegow_token, ...semSegredo } = c as any;
      return {
        ...semSegredo,
        profissionais: await listProfissionais(c.id),
        instancias: await listInstancias(c.id),
      };
    })
  );
  return NextResponse.json({ clinicas });
}

// POST /api/clinicas  → EDITA uma clinica existente (dados + profissionais).
// ISOLAMENTO: a conta clinica so edita a propria. Criar clinica NOVA e via
// /api/admin/clinicas (so admin). Aqui exigimos body.id de uma clinica que a
// sessao pode operar.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.id) {
    return NextResponse.json(
      { erro: "id da clinica obrigatorio (criar nova e via /api/admin/clinicas)" },
      { status: 400 }
    );
  }
  const permitida = await clinicaPermitida(body.id);
  if (!permitida || permitida !== body.id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  const clinica = await upsertClinica(body);

  if (Array.isArray(body.profissionais)) {
    for (const p of body.profissionais) {
      const prof = await upsertProfissional({ ...p, clinica_id: clinica.id });
      if (Array.isArray(p.horarios)) {
        for (const h of p.horarios) {
          await addHorario({ ...h, profissional_id: prof.id });
        }
      }
    }
  }

  if (Array.isArray(body.instancias)) {
    for (const i of body.instancias) {
      await upsertInstancia({ ...i, clinica_id: clinica.id });
    }
  }

  return NextResponse.json({ ok: true, clinica });
}
