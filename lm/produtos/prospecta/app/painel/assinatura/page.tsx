import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import { contaPorId } from "@/lib/db";
import { stripeConfigurado } from "@/lib/stripe";
import AssinaturaCliente from "./AssinaturaCliente";

export default async function Assinatura() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  const conta = await contaPorId(s.contaId);
  return <AssinaturaCliente
    plano={conta?.plano}
    ativa={stripeConfigurado()}
    temAssinatura={Boolean(conta?.stripe_subscription_id)}
  />;
}
