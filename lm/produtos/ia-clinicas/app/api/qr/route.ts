import { NextRequest, NextResponse } from "next/server";
import { listInstancias, listClinicas, getClinica, upsertInstancia } from "@/lib/db";
import { conectarComRecuperacao, criarInstancia } from "@/lib/uazapi";
import { clinicaPermitida, sessaoAtual } from "@/lib/sessao";

// GET /api/qr?clinica=ID[&instancia=ID][&novo=1[&nome=Recepcao]]
//   → chama a uazapi pra gerar/atualizar o QR ao vivo, com AUTO-RECUPERACAO:
//     se o token da instancia morreu (servidor apagou a instancia), recria
//     sozinho, salva o token novo no banco e gera o QR.
//
// MULTI-NUMERO (a clinica pode ter varios WhatsApps: recepcao, financeiro...):
//   - `instancia=ID` → gera o QR DAQUELE numero (reconectar um especifico)
//   - `novo=1`       → cria um numero NOVO e devolve o QR dele
//   - sem nada       → primeiro numero da clinica (ou cria o "Principal" se
//                      a clinica ainda nao tem nenhum)
// Sem o parametro `instancia`, a rota caia SEMPRE no insts[0] — por isso
// "Conectar um numero" numa clinica que ja tinha um so reconectava o mesmo,
// e nunca dava pra plugar o segundo aparelho.
//
// Retorna { qrcode, paircode, status, recriada, instancia_id, nome }.
// ISOLAMENTO: clinica so pega o QR da dela; admin usa ?clinica= ou a primeira.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  let clinicaId = await clinicaPermitida(q.get("clinica"));
  if (!clinicaId) {
    const sessao = await sessaoAtual();
    if (sessao?.papel === "admin") {
      const todas = await listClinicas();
      clinicaId = todas[0]?.id ?? null;
    }
  }
  if (!clinicaId) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const insts = await listInstancias(clinicaId);
  const pedida = q.get("instancia");
  const querNovo = q.get("novo") === "1";

  let inst = pedida
    // ISOLAMENTO: so aceita id que pertence A ESTA clinica (o filtro e na
    // lista da clinica, entao id de outra clinica simplesmente nao casa)
    ? insts.find((i: any) => i.id === pedida)
    : querNovo
    ? undefined // forca o caminho de criacao abaixo
    : insts[0];

  if (pedida && !inst) {
    return NextResponse.json({ erro: "numero nao encontrado nessa clinica" }, { status: 404 });
  }

  // Cria a instancia quando: a clinica ainda nao tem nenhuma (auto-setup do
  // onboarding) OU o usuario pediu explicitamente um numero NOVO.
  if (!inst) {
    const clinica = await getClinica(clinicaId);
    // nome vindo da tela ("Recepcao", "Financeiro"); senao numera na sequencia
    const rotulo =
      (q.get("nome") || "").trim().slice(0, 30) ||
      (insts.length === 0 ? "Principal" : `Número ${insts.length + 1}`);
    // o nome NA UAZAPI precisa ser unico por servidor (a instancia e global la),
    // por isso vai prefixado com a clinica + sufixo quando ja existe outro
    const nomeUazapi = `${(clinica?.nome || "clinica").slice(0, 30)} - ${rotulo}`;
    const nova = await criarInstancia(nomeUazapi);
    if (!nova.token) {
      return NextResponse.json(
        { erro: `nao consegui criar a instancia na uazapi: ${nova.erro || "sem token"}` },
        { status: 502 }
      );
    }
    inst = await upsertInstancia({
      clinica_id: clinicaId,
      nome: rotulo,
      uazapi_instance: nomeUazapi,
      uazapi_token: nova.token,
      status: "desconectado",
    });
  }

  const r = await conectarComRecuperacao(inst);

  if (r.status === "demo")
    return NextResponse.json({ demo: true, status: "demo", qrcode: null });
  if (r.erro && !r.qrcode && r.status === "erro")
    return NextResponse.json({ erro: r.erro, status: r.status }, { status: 502 });

  return NextResponse.json({
    qrcode: r.qrcode || null,
    paircode: r.paircode || null,
    status: r.status,
    recriada: r.recriada || false,
    // a tela guarda esse id: sem ele, o poll de 15s com ?novo=1 criaria uma
    // instancia NOVA a cada renovacao do QR (lixo na uazapi e no banco)
    instancia_id: inst.id,
    nome: inst.nome || null,
  });
}
