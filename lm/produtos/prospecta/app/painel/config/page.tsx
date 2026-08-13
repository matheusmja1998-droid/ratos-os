import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import { contaPorId } from "@/lib/db";
import ConfigCliente from "./ConfigCliente";

export default async function Config() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  const conta = await contaPorId(s.contaId);
  return <ConfigCliente temChave={Boolean(conta?.anthropic_key)} />;
}
