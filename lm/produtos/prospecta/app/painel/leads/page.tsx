import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import Operacional from "./Operacional";
export default async function Leads() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  return <Operacional />;
}
