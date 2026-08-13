// CRM — quadro Kanban dos pacientes.
// Cada pessoa que falou com a clinica vira um card, posicionado na etapa do
// funil em que esta. A IA move o card sozinha conforme o atendimento anda
// (respondeu -> Em atendimento, marcou -> Agendado, consulta aconteceu ->
// Cliente); a recepcao arrasta na mao quando quiser corrigir.
//
// Serve pra, no futuro, disparar mensagem segmentada: "todos os clientes",
// "todos os leads parados ha mais de X dias".
//
// Server Component: monta o quadro no servidor. Isolamento via clinicaPermitida.

import { listClinicas, getClinica, listarCrm, CRM_ETAPAS } from "@/lib/db";
import { sessaoAtual, clinicaPermitida } from "@/lib/sessao";
import QuadroCrm from "./QuadroCrm";

export const dynamic = "force-dynamic";

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <main className="pagina">
      <div
        style={{
          marginTop: 40,
          padding: 40,
          border: "1px dashed var(--border-forte)",
          borderRadius: 12,
          textAlign: "center",
          color: "var(--muted)",
        }}
      >
        {children}
      </div>
    </main>
  );
}

export default async function Crm({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return <Aviso>Sessao invalida. Faca login de novo.</Aviso>;

  const sp = await searchParams;
  const ehAdmin = sessao.papel === "admin";

  let pedida = sp.clinica ?? null;
  if (ehAdmin && !pedida) {
    const todas = await listClinicas();
    pedida = todas[0]?.id ?? null;
    if (!pedida) return <Aviso>Nenhuma clinica cadastrada ainda.</Aviso>;
  }
  const clinicaId = await clinicaPermitida(pedida);
  if (!clinicaId) return <Aviso>Acesso negado a essa clinica.</Aviso>;

  const clinica = await getClinica(clinicaId);
  if (!clinica) return <Aviso>Clinica nao encontrada.</Aviso>;

  const cards = await listarCrm(clinicaId);
  const sufClinica = ehAdmin && sp.clinica ? `&clinica=${clinicaId}` : "";

  return (
    <main className="pagina">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>CRM — {clinica.nome}</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6, marginBottom: 0 }}>
          Cada paciente que conversou vira um card. A IA move sozinha conforme o atendimento anda;
          arraste pra corrigir. Clique no card pra abrir a conversa.
        </p>
      </div>

      <QuadroCrm
        cards={cards}
        etapas={CRM_ETAPAS.map((e) => ({ id: e.id, rotulo: e.rotulo }))}
        clinicaId={clinicaId}
        sufClinica={sufClinica}
      />
    </main>
  );
}
