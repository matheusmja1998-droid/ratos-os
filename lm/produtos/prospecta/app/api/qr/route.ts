export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { sb, atualizarInstancia } from "@/lib/db";
import { criarInstancia, conectarInstancia, statusConectado, configurarWebhook } from "@/lib/uazapi";

// GET ?id=<instancia>  -> cria/conecta e devolve QR
export async function GET(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  const { data: inst } = await sb.from("instancias").select("*")
    .eq("conta_id", s.contaId).eq("id", id).maybeSingle();
  if (!inst) return NextResponse.json({ erro: "WhatsApp não encontrado" }, { status: 404 });

  let token = inst.uazapi_token as string;
  if (!token) {
    const nova = await criarInstancia(`Prospecta ${s.contaId.slice(0, 6)} - ${inst.nome}`);
    if (!nova.token) return NextResponse.json({ erro: `não criei instância: ${nova.erro}` }, { status: 502 });
    token = nova.token;
    await atualizarInstancia(inst.id, { uazapi_token: token });
    await configurarWebhook(token, s.contaId, inst.id);
  }

  let r = await conectarInstancia(token);
  if (r.tokenInvalido) {
    const nova = await criarInstancia(`Prospecta ${s.contaId.slice(0, 6)} - ${inst.nome}`);
    if (!nova.token) return NextResponse.json({ erro: "token morto e não recriei" }, { status: 502 });
    token = nova.token;
    await atualizarInstancia(inst.id, { uazapi_token: token });
    await configurarWebhook(token, s.contaId, inst.id);
    r = await conectarInstancia(token);
  }
  if (statusConectado(r.status)) {
    await atualizarInstancia(inst.id, { status: "conectado", numero: r.owner || inst.numero });
    await configurarWebhook(token, s.contaId, inst.id);
  }
  return NextResponse.json({ status: r.status, qrcode: r.qrcode || null, paircode: r.paircode || null });
}
