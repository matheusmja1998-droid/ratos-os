import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import { contaPorId } from "@/lib/db";
import EntrevistaCliente from "./EntrevistaCliente";

export default async function Entrevista() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  const conta = await contaPorId(s.contaId);
  return <EntrevistaCliente temChave={Boolean(conta?.anthropic_key)} />;
}
