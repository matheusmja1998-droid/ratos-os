import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import WhatsappCliente from "./WhatsappCliente";

export default async function Whatsapp() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  return <WhatsappCliente />;
}
