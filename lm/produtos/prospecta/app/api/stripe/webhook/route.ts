export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { stripe, stripeConfigurado } from "@/lib/stripe";
import { atualizarConta, sb } from "@/lib/db";

// Webhook do Stripe: mantem plano/assinatura da conta em dia.
// Valida a assinatura do evento (STRIPE_WEBHOOK_SECRET). Fail-closed.
export async function POST(req: Request) {
  if (!stripeConfigurado()) return NextResponse.json({ ok: true }); // no-op sem chave
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const sig = req.headers.get("stripe-signature") || "";
  const body = await req.text();
  let evento: any;
  try {
    evento = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (e: any) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 400 });
  }

  async function contaPorCustomer(customerId: string) {
    const { data } = await sb.from("contas").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    return data?.id || null;
  }

  const obj = evento.data.object;
  try {
    if (evento.type === "checkout.session.completed") {
      const contaId = obj.client_reference_id || obj.subscription_data?.metadata?.conta_id;
      if (contaId) await atualizarConta(contaId, {
        stripe_customer_id: obj.customer, stripe_subscription_id: obj.subscription,
        plano: "ativo", assinatura_status: "active",
      });
    } else if (evento.type === "customer.subscription.updated" || evento.type === "customer.subscription.created") {
      const contaId = obj.metadata?.conta_id || (await contaPorCustomer(obj.customer));
      if (contaId) {
        const ativo = ["active", "trialing"].includes(obj.status);
        await atualizarConta(contaId, {
          assinatura_status: obj.status,
          plano: ativo ? "ativo" : obj.status === "past_due" ? "inadimplente" : "cancelado",
          stripe_subscription_id: obj.id,
        });
      }
    } else if (evento.type === "customer.subscription.deleted") {
      const contaId = obj.metadata?.conta_id || (await contaPorCustomer(obj.customer));
      if (contaId) await atualizarConta(contaId, { plano: "cancelado", assinatura_status: "canceled" });
    } else if (evento.type === "invoice.payment_failed") {
      const contaId = await contaPorCustomer(obj.customer);
      if (contaId) await atualizarConta(contaId, { plano: "inadimplente", assinatura_status: "past_due" });
    }
  } catch (e) {
    console.error("[stripe webhook]", e);
  }
  return NextResponse.json({ received: true });
}
