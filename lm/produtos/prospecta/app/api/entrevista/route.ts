export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { setConfig } from "@/lib/db";
import { turnoEntrevista } from "@/lib/entrevista";

// Recebe o historico da conversa e devolve o proximo turno. Ja SALVA no cerebro
// os campos que o entrevistador preencheu.
export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { historico } = await req.json().catch(() => ({ historico: [] }));

  const r = await turnoEntrevista(s.contaId, Array.isArray(historico) ? historico : []);
  if ("erro" in r) {
    if (r.erro === "sem_chave") return NextResponse.json({ erro: "conecte sua chave da Anthropic primeiro" }, { status: 422 });
    return NextResponse.json({ erro: "falha na IA: " + (r.detalhe || "") }, { status: 500 });
  }
  // persiste os campos preenchidos neste turno
  for (const [k, v] of Object.entries(r.campos)) await setConfig(s.contaId, k, v);
  return NextResponse.json(r);
}
