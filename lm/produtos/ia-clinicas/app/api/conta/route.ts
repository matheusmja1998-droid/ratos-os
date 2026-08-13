import { NextRequest, NextResponse } from "next/server";
import { contaDaClinica, atualizarEmailConta, registrarLog } from "@/lib/db";
import { clinicaPermitida } from "@/lib/sessao";

// PATCH /api/conta — troca o E-MAIL de acesso da conta da clinica.
// Body: { clinica_id, email }
// ISOLAMENTO: so opera a conta da clinica que a sessao pode operar.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const email = String(body.email || "").toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erro: "e-mail inválido" }, { status: 400 });
  }

  const conta = await contaDaClinica(permitida);
  if (!conta) return NextResponse.json({ erro: "conta da clínica não encontrada" }, { status: 404 });
  if (conta.email === email) return NextResponse.json({ ok: true, email });

  try {
    await atualizarEmailConta(conta.id, email);
  } catch (e: any) {
    const msg = e?.message || "erro ao trocar o e-mail";
    return NextResponse.json({ erro: msg }, { status: /em uso/.test(msg) ? 409 : 500 });
  }

  await registrarLog(permitida, "sistema", `📧 E-mail de acesso alterado para ${email}`);
  return NextResponse.json({ ok: true, email });
}
