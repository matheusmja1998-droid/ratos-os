import { NextRequest, NextResponse } from "next/server";
import { verificarWebhook, mapearStatus, assinaturaTemPrecoEsperado } from "@/lib/stripe";
import {
  clinicaPorStripeCustomer,
  clinicaPorStripeSubscription,
  atualizarAssinaturaClinica,
  getClinica,
} from "@/lib/db";
import { alertarErro } from "@/lib/alertas";

// POST /api/stripe/webhook — Stripe manda eventos aqui. PUBLICA (sem sessao),
// protegida pela ASSINATURA do Stripe (STRIPE_WEBHOOK_SECRET). Precisa estar
// na allowlist do middleware.
//
// Trata: checkout.session.completed, invoice.paid, invoice.payment_failed,
// customer.subscription.updated/deleted → atualiza assinatura_status da clinica.
//
// TODO (nota fiscal, futuro): em "invoice.paid", apos marcar 'ativa', seria o
// ponto de disparar a emissao de NF (ex: NFE.io / Focus NFe) usando os dados
// fiscais da clinica (cnpj, razao_social, endereco_fiscal). Nao emite nada ainda.
export async function POST(req: NextRequest) {
  const assinatura = req.headers.get("stripe-signature") || "";
  const payload = await req.text(); // corpo CRU (necessario pra validar a assinatura)

  const eventoOuNull = verificarWebhook(payload, assinatura);
  if (!eventoOuNull) {
    // assinatura invalida OU Stripe nao configurado → nao processa
    return NextResponse.json({ erro: "assinatura invalida" }, { status: 400 });
  }
  const evento = eventoOuNull; // nao-nulo daqui pra frente (fecha o narrowing na closure)

  try {
    const obj: any = evento.data.object;

    // Acha a clinica pelo VINCULO DO BANCO primeiro (fonte da verdade:
    // customer/subscription que a gente mesmo gravou no checkout). O
    // metadata.clinica_id do Stripe e dado externo/controlavel — so serve de
    // fallback quando ainda nao ha vinculo, E so se casar com o customer real.
    async function acharClinicaId(): Promise<string | null> {
      if (obj.customer) {
        const c = await clinicaPorStripeCustomer(obj.customer);
        if (c) return c.id;
      }
      const subId = obj.subscription || (evento.type.startsWith("customer.subscription") ? obj.id : null);
      if (subId) {
        const c = await clinicaPorStripeSubscription(subId);
        if (c) return c.id;
      }
      // fallback: metadata SO se a clinica existir E o customer do evento bater
      // com o customer gravado nela (evita ativar clinica arbitraria).
      if (obj.metadata?.clinica_id) {
        const c = await getClinica(obj.metadata.clinica_id);
        if (c && (!obj.customer || !c.stripe_customer_id || c.stripe_customer_id === obj.customer)) {
          return c.id;
        }
      }
      return null;
    }

    const clinicaId = await acharClinicaId();

    switch (evento.type) {
      case "checkout.session.completed": {
        // so ativa se a assinatura usar o nosso price (evita ativar por outro produto)
        const precoOk = await assinaturaTemPrecoEsperado(obj.subscription);
        if (clinicaId && precoOk) {
          await atualizarAssinaturaClinica(clinicaId, {
            assinatura_status: "ativa",
            stripe_customer_id: obj.customer || undefined,
            stripe_subscription_id: obj.subscription || undefined,
          });
        }
        break;
      }
      case "invoice.paid": {
        const precoOk = await assinaturaTemPrecoEsperado(obj.subscription);
        if (clinicaId && precoOk) await atualizarAssinaturaClinica(clinicaId, { assinatura_status: "ativa" });
        // TODO NF: emitir nota fiscal aqui no futuro (dados fiscais da clinica)
        break;
      }
      case "invoice.payment_failed": {
        if (clinicaId) await atualizarAssinaturaClinica(clinicaId, { assinatura_status: "inadimplente" });
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        if (clinicaId) {
          await atualizarAssinaturaClinica(clinicaId, {
            assinatura_status: mapearStatus(obj.status || "canceled"),
            stripe_subscription_id: obj.id || undefined,
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("[stripe webhook] erro:", e.message);
    // 200 mesmo em erro interno pra o Stripe nao ficar reenviando infinito —
    // MAS alerta de verdade (Telegram): um erro aqui pode deixar clinica
    // inadimplente marcada como ativa ate o proximo evento do Stripe.
    await alertarErro(`stripe webhook (${evento.type})`, e);
    return NextResponse.json({ received: true, erro: e.message });
  }
}
