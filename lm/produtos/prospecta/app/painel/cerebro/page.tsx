import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import { carregarCerebro } from "@/lib/cerebro";
import CerebroCliente from "./CerebroCliente";

export default async function Cerebro() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  const c = await carregarCerebro(s.contaId);
  return <CerebroCliente inicial={c} />;
}
