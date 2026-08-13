// Integracao Stripe — assinatura MENSAL recorrente em BRL (Matheus cobra a clinica).
//
// FILOSOFIA: sem STRIPE_SECRET_KEY no .env, TUDO aqui e no-op gracioso — as
// rotas respondem "cobranca nao configurada" e o app funciona 100% normal.
// So liga quando o Matheus colar as 3 chaves.
//
// .env:
//   STRIPE_SECRET_KEY      -> sk_test_... ou sk_live_... (painel Stripe > Developers > API keys)
//   STRIPE_PRICE_ID        -> price_... do produto recorrente mensal BRL (Stripe > Products)
//   STRIPE_WEBHOOK_SECRET  -> whsec_... (Stripe > Developers > Webhooks, ao criar o endpoint)
//   APP_URL                -> base do app pra redirect do checkout (ex https://ia-clinicas.vercel.app)

import Stripe from "stripe";

const SECRET = process.env.STRIPE_SECRET_KEY || "";
const PRICE_ID = process.env.STRIPE_PRICE_ID || "";
const APP_URL = process.env.APP_URL || "https://ia-clinicas.vercel.app";

export const stripeConfigurado = () => Boolean(SECRET);

let _stripe: Stripe | null = null;
function cliente(): Stripe {
  if (!SECRET) throw new Error("STRIPE_SECRET_KEY ausente");
  if (!_stripe) _stripe = new Stripe(SECRET);
  return _stripe;
}

// Cria (ou reusa) o customer do Stripe pra uma clinica.
export async function garantirCustomer(params: {
  clinica: any; // row da clinica (id, nome, stripe_customer_id, email opcional)
  email?: string;
}): Promise<string> {
  const { clinica, email } = params;
  if (clinica.stripe_customer_id) return clinica.stripe_customer_id;
  const cust = await cliente().customers.create({
    name: clinica.nome,
    email: email || undefined,
    metadata: { clinica_id: clinica.id },
  });
  return cust.id;
}

// Cria a checkout session de ASSINATURA (recorrente). Retorna a URL do checkout.
// price recorrente vem de STRIPE_PRICE_ID (o Matheus cria o produto/preco no painel).
export async function criarCheckoutAssinatura(params: {
  customerId: string;
  clinicaId: string;
}): Promise<{ url: string | null; erro?: string }> {
  if (!PRICE_ID) return { url: null, erro: "STRIPE_PRICE_ID nao configurado" };
  try {
    const session = await cliente().checkout.sessions.create({
      mode: "subscription",
      customer: params.customerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${APP_URL}/admin?cobranca=ok`,
      cancel_url: `${APP_URL}/admin?cobranca=cancelou`,
      metadata: { clinica_id: params.clinicaId },
      subscription_data: { metadata: { clinica_id: params.clinicaId } },
    });
    return { url: session.url };
  } catch (e: any) {
    return { url: null, erro: e.message };
  }
}

// Valida a assinatura do webhook e devolve o evento (ou null se invalido).
export function verificarWebhook(payload: string, assinatura: string): Stripe.Event | null {
  const whsec = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!SECRET || !whsec) return null;
  try {
    return cliente().webhooks.constructEvent(payload, assinatura, whsec);
  } catch {
    return null;
  }
}

// Confere que a assinatura usa o PRICE esperado (STRIPE_PRICE_ID). Evita
// ativar por um preco/produto diferente do nosso. Se STRIPE_PRICE_ID nao
// estiver configurado, nao bloqueia (retorna true).
export async function assinaturaTemPrecoEsperado(subscriptionId: string): Promise<boolean> {
  if (!PRICE_ID) return true;
  if (!subscriptionId) return true;
  try {
    const sub = await cliente().subscriptions.retrieve(subscriptionId);
    return sub.items.data.some((it) => it.price?.id === PRICE_ID);
  } catch {
    // se nao conseguir verificar, nao trava (o webhook ja veio assinado)
    return true;
  }
}

// mapeia o status do Stripe pro nosso enum simples
export function mapearStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "ativa";
    case "past_due":
    case "unpaid":
      return "inadimplente";
    case "canceled":
    case "incomplete_expired":
      return "cancelada";
    default:
      return "trial";
  }
}
