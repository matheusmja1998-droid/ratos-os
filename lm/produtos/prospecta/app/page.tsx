import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";

export default async function Home() {
  const s = await sessaoAtual();
  redirect(s ? "/painel" : "/login");
}
