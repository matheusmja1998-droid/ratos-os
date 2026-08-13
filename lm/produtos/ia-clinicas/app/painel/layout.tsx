import { Suspense } from "react";
import { sessaoAtual } from "@/lib/sessao";
import { listClinicas } from "@/lib/db";
import Sidebar from "./Sidebar";

// Shell do painel da clinica: sidebar fixa a esquerda + conteudo.
// As paginas continuam responsaveis pelo proprio isolamento multi-tenant.
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sessao = await sessaoAtual();
  const ehAdmin = sessao?.papel === "admin";
  // admin: passa a lista de clinicas pro seletor visivel (evita operar na
  // clinica errada sem perceber — causa de bug de setup no cliente errado)
  const clinicas = ehAdmin
    ? (await listClinicas()).map((c: any) => ({ id: c.id, nome: c.nome }))
    : [];

  return (
    <div className="painel-shell">
      <Suspense fallback={<aside className="sidebar" />}>
        <Sidebar ehAdmin={!!ehAdmin} clinicas={clinicas} />
      </Suspense>
      <div className="painel-conteudo">{children}</div>
    </div>
  );
}
