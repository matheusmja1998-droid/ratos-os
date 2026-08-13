export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { contaPorId, listarInstancias, criarInstanciaDB, atualizarInstancia, sb } from "@/lib/db";
import { statusInstanciaLive } from "@/lib/uazapi";

// GET: lista os WhatsApp da conta + limite do plano
export async function GET() {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const conta = await contaPorId(s.contaId);
  const insts = await listarInstancias(s.contaId);
  // status ao vivo (best-effort) so das que tem token
  for (const i of insts) {
    if (i.uazapi_token) {
      const live = await statusInstanciaLive(i.uazapi_token);
      if ((live.conectado ? "conectado" : "desconectado") !== i.status) {
        await atualizarInstancia(i.id, { status: live.conectado ? "conectado" : "desconectado" });
        i.status = live.conectado ? "conectado" : "desconectado";
      }
    }
  }
  return NextResponse.json({ instancias: insts, limite: conta?.whatsapps_limite ?? 1 });
}

// POST: adiciona um WhatsApp novo (respeita o limite do plano)
export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const conta = await contaPorId(s.contaId);
  const insts = await listarInstancias(s.contaId);
  if (insts.length >= (conta?.whatsapps_limite ?? 1))
    return NextResponse.json({ erro: `seu plano permite ${conta?.whatsapps_limite ?? 1} WhatsApp. Aumente na página de assinatura.` }, { status: 403 });
  const { nome } = await req.json().catch(() => ({}));
  const inst = await criarInstanciaDB(s.contaId, nome || `WhatsApp ${insts.length + 1}`);
  return NextResponse.json({ ok: true, instancia: inst });
}

// DELETE ?id=  remove um WhatsApp
export async function DELETE(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });
  await sb.from("instancias").delete().eq("conta_id", s.contaId).eq("id", id);
  return NextResponse.json({ ok: true });
}
