import { NextRequest, NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { getClinica, contaDaClinica, atualizarAssinaturaClinica } from "@/lib/db";
import { stripeConfigurado, garantirCustomer, criarCheckoutAssinatura } from "@/lib/stripe";

// POST /api/stripe/checkout  { clinicaId }  → gera o link de cobranca da assinatura.
// SO ADMIN (o Matheus cobra a clinica). Sem Stripe configurado, responde gracioso.
export async function POST(req: NextRequest) {
  const sessao = await sessaoAtual();
  if (!sessao || sessao.papel !== "admin") {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  if (!stripeConfigurado()) {
    return NextResponse.json(
      { erro: "cobranca ainda nao configurada (falta STRIPE_SECRET_KEY)" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const clinica = await getClinica(body.clinicaId);
  if (!clinica) return NextResponse.json({ erro: "clinica nao encontrada" }, { status: 404 });

  try {
    // email da conta da clinica (se tiver) pra pre-preencher o checkout
    const conta = await contaDaClinica(clinica.id).catch(() => null);
    const customerId = await garantirCustomer({ clinica, email: conta?.email });

    // guarda o customer id na clinica (se acabou de criar)
    if (customerId !== clinica.stripe_customer_id) {
      await atualizarAssinaturaClinica(clinica.id, { stripe_customer_id: customerId });
    }

    const { url, erro } = await criarCheckoutAssinatura({ customerId, clinicaId: clinica.id });
    if (!url) return NextResponse.json({ erro: erro || "falha ao criar checkout" }, { status: 502 });
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}
