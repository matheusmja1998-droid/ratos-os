import { NextRequest, NextResponse } from "next/server";
import { rodarSaudeTrials } from "@/lib/saude-trial";
import { alertarErro } from "@/lib/alertas";

// RAIO-X DO TRIAL pro Telegram DA LM (nao e o relatorio do dono da clinica).
// Roda por cron da Vercel em dia util de manha e tambem sob demanda:
//   /api/cron/saude-trial?secret=<CRON_SECRET>&dias=7&analise=1
export async function GET(req: NextRequest) {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) {
    console.error("[saude-trial] CRON_SECRET nao configurado — negando");
    return NextResponse.json({ erro: "servico mal configurado" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") || "";
  const query = req.nextUrl.searchParams.get("secret") || "";
  if (auth !== `Bearer ${esperado}` && query !== esperado)
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });

  try {
    const dias = Number(req.nextUrl.searchParams.get("dias")) || 7;
    const comAnalise = req.nextUrl.searchParams.get("analise") !== "0";
    const r = await rodarSaudeTrials({ dias, comAnalise });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    await alertarErro("saude-trial", e);
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
