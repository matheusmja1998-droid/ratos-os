import { listClinicas, getClinica, listProfissionais } from "@/lib/db";
import { sessaoAtual, clinicaPermitida } from "@/lib/sessao";
import IntegracoesGrid from "./IntegracoesGrid";

export const dynamic = "force-dynamic";

// Aba de INTEGRACOES: vitrine estilo marketplace — tiles com a logo de cada
// sistema (Feegow, Clinicorp, Google Calendar); clica num tile e abre so a
// integracao selecionada. Google Calendar conecta POR MEDICO aqui dentro.

export default async function Integracoes({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return null;
  const sp = await searchParams;

  let clinicaId = await clinicaPermitida(sp.clinica ?? null);
  if (sessao.papel === "admin" && !clinicaId) {
    const todas = await listClinicas();
    clinicaId = todas[0]?.id ?? null;
  }
  if (!clinicaId) return null;
  const [clinica, profs] = await Promise.all([
    getClinica(clinicaId),
    listProfissionais(clinicaId),
  ]);
  if (!clinica) return null;

  // profissionais SANITIZADOS pro client (nunca manda o refresh token do Google)
  const profissionais = profs.map((p: any) => ({
    id: p.id,
    nome: p.nome,
    especialidade: p.especialidade ?? null,
    gcal_conectado: p.gcal_conectado === true || p.gcal_conectado === 1,
    gcal_email: p.gcal_email ?? null,
  }));

  // status de cada tile (calculado no servidor; nenhum segredo vai pro browser)
  const status = {
    feegow: Boolean(clinica.feegow_token),
    clinicorp: Boolean(
      clinica.clinicorp_api_user && clinica.clinicorp_token && clinica.clinicorp_subscriber_id
    ),
    klingo: Boolean(clinica.klingo_app_token),
    gcal: profissionais.some((p) => p.gcal_conectado),
  };

  return (
    <main className="pagina" style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 26, margin: 0 }}>Integrações</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
        {clinica.nome} · clica numa integração pra conectar ou gerenciar.
      </p>

      <IntegracoesGrid clinicaId={clinicaId} profissionais={profissionais} status={status} />
    </main>
  );
}
