import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import { contaPorId, metricas } from "@/lib/db";
import PainelCliente from "./PainelCliente";

export default async function Painel() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  const conta = await contaPorId(s.contaId);
  const insts = await import("@/lib/db").then((d) => d.listarInstancias(s.contaId));
  const temWhatsapp = insts.some((i: any) => i.status === "conectado");
  const cer = await import("@/lib/cerebro").then((d) => d.carregarCerebro(s.contaId));
  const temCerebro = Boolean(cer.produto_desc || cer.objetivo);
  const m = await metricas(s.contaId);
  const diasTrial = conta?.trial_ate
    ? Math.max(0, Math.ceil((new Date(conta.trial_ate).getTime() - Date.now()) / 86400000))
    : null;
  return <PainelCliente
    conta={{ nome: conta?.nome, email: conta?.email, plano: conta?.plano, diasTrial, temChave: Boolean(conta?.anthropic_key), temWhatsapp, temCerebro }}
    metricas={m} />;
}
