export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { getLead, salvarMensagem, atualizarLead, registrarEvento, sb } from "@/lib/db";
import { enviarTexto } from "@/lib/uazapi";

// atendente responde pela tela (pausa a IA)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { id } = await params;
  const lead = await getLead(s.contaId, id);
  if (!lead) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  const { texto } = await req.json().catch(() => ({}));
  if (!texto?.trim()) return NextResponse.json({ erro: "texto vazio" }, { status: 400 });

  const simulado = String(lead.telefone).startsWith("0000");
  let ok = true;
  if (!simulado) {
    // pega o token de alguma instancia conectada da conta
    const { data: inst } = await sb.from("instancias").select("uazapi_token")
      .eq("conta_id", s.contaId).eq("status", "conectado").limit(1).maybeSingle();
    const r = await enviarTexto(inst?.uazapi_token || "", lead.telefone, texto);
    ok = r.ok;
    if (!ok) return NextResponse.json({ erro: r.erro }, { status: 502 });
  }
  await salvarMensagem(s.contaId, id, "assistant", texto);
  if (!lead.ia_pausada) { await atualizarLead(s.contaId, id, { ia_pausada: 1 }); await registrarEvento(s.contaId, id, "handoff", "painel"); }
  return NextResponse.json({ ok: true });
}
