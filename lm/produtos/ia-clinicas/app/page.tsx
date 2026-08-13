import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  redirect(s.papel === "admin" ? "/admin" : "/painel");
}
