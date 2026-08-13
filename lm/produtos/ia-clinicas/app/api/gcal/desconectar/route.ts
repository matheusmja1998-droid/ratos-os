import { NextRequest, NextResponse } from "next/server";
import { getProfissional, desvincularGoogleProfissional } from "@/lib/db";
import { clinicaPermitida } from "@/lib/sessao";

// POST /api/gcal/desconectar  → desvincula o Google Calendar de um medico.
// Body: { prof }. ISOLAMENTO: so quem pode operar a clinica do medico.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const profId = String(body.prof || "");
  if (!profId) return NextResponse.json({ erro: "falta prof" }, { status: 400 });

  const prof = await getProfissional(profId);
  if (!prof) return NextResponse.json({ erro: "profissional nao encontrado" }, { status: 404 });

  const permitida = await clinicaPermitida(prof.clinica_id);
  if (!permitida || permitida !== prof.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  await desvincularGoogleProfissional(profId);
  return NextResponse.json({ ok: true });
}
