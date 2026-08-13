// Cobranca do Prospecta via Stripe. NO-OP sem as chaves (nao quebra nada ate
// o Matheus criar a conta e colar os secrets). Modelo: 1 assinatura com
// - preco BASE (R$100, inclui 1 WhatsApp)  -> STRIPE_PRICE_BASE
// - preco ADICIONAL por WhatsApp extra (R$20, quantidade) -> STRIPE_PRICE_WHATSAPP
import Stripe from "stripe";

const SECRET = process.env.STRIPE_SECRET_KEY || "";
export const stripeConfigurado = () => Boolean(SECRET);

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!SECRET) throw new Error("Stripe não configurado");
  if (!_stripe) _stripe = new Stripe(SECRET);
  return _stripe;
}

export const PRICE_BASE = process.env.STRIPE_PRICE_BASE || "";       // R$100/mes (inclui 1 whats)
export const PRICE_WHATSAPP = process.env.STRIPE_PRICE_WHATSAPP || ""; // R$20/mes por whats extra
export const APP_URL = process.env.APP_URL || "https://prospecta-one-tau.vercel.app";

// Cria a sessao de checkout (assinatura). whatsappsExtra = alem do 1 incluido.
export async function criarCheckout(conta: any, whatsappsExtra = 0) {
  const line_items: any[] = [{ price: PRICE_BASE, quantity: 1 }];
  if (whatsappsExtra > 0 && PRICE_WHATSAPP)
    line_items.push({ price: PRICE_WHATSAPP, quantity: whatsappsExtra });
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items,
    customer_email: conta.stripe_customer_id ? undefined : conta.email,
    customer: conta.stripe_customer_id || undefined,
    client_reference_id: conta.id,
    subscription_data: { metadata: { conta_id: conta.id } },
    success_url: `${APP_URL}/painel?assinatura=ok`,
    cancel_url: `${APP_URL}/painel/assinatura?cancelado=1`,
    allow_promotion_codes: true,
  });
  return session.url;
}

// Portal do cliente (gerenciar/cancelar assinatura, trocar cartao)
export async function criarPortal(conta: any) {
  if (!conta.stripe_customer_id) return null;
  const p = await stripe().billingPortal.sessions.create({
    customer: conta.stripe_customer_id,
    return_url: `${APP_URL}/painel`,
  });
  return p.url;
}
