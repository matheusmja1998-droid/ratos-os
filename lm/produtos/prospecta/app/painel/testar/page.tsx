import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import { contaPorId } from "@/lib/db";
import TestarCliente from "./TestarCliente";
export default async function Testar() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  const conta = await contaPorId(s.contaId);
  return <TestarCliente temChave={Boolean(conta?.anthropic_key)} />;
}
