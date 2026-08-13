import { clinicaPermitida, sessaoAtual } from "@/lib/sessao";
import { getClinica, listProfissionais, listHorarios, listInstancias, listClinicas, contaDaClinica } from "@/lib/db";
import ClinicaEditor from "./ClinicaEditor";

export const dynamic = "force-dynamic";

export default async function ClinicaPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; clinica?: string }>;
}) {
  const sp = await searchParams;
  const sessao = await sessaoAtual();
  if (!sessao) {
    return <main className="pagina">Sessao invalida. Faca login de novo.</main>;
  }

  // Resolve a clinica: conta clinica usa SEMPRE a propria (ignora o param);
  // admin usa ?clinica= (padrao do resto do sistema; ?id= aceito por compat)
  // ou cai na primeira. BUG CORRIGIDO: essa pagina lia so ?id=, mas a Sidebar
  // e o seletor usam ?clinica= — por isso Config abria a clinica errada.
  let clinicaId = await clinicaPermitida(sp.clinica ?? sp.id ?? null);
  if (sessao.papel === "admin" && !clinicaId) {
    const todas = await listClinicas();
    clinicaId = todas[0]?.id ?? null;
  }
  if (!clinicaId) {
    return <main className="pagina">Acesso negado a esta clínica.</main>;
  }
  const permitida = clinicaId;

  // Carregar dados server-side
  const [clinica, profissionais, instancias, horariosPorProf, conta] = await Promise.all([
    getClinica(clinicaId),
    listProfissionais(clinicaId),
    listInstancias(clinicaId),
    listProfissionais(clinicaId).then(async (profs) => {
      const map: any = {};
      for (const prof of profs || []) {
        map[prof.id] = await listHorarios(prof.id);
      }
      return map;
    }),
    contaDaClinica(clinicaId),
  ]);

  if (!clinica) {
    return <main className="pagina">Clínica não encontrada.</main>;
  }

  // NUNCA manda credencial de integracao pro browser (o editor e client).
  // O status dessas integracoes vem por rotas dedicadas que ja omitem o token.
  const { feegow_token, clinicorp_token, ...clinicaSemSegredo } = clinica as any;

  return (
    <ClinicaEditor
      clinicaId={clinicaId}
      clinica={clinicaSemSegredo}
      emailAcesso={conta?.email || ""}
      profissionaisInit={profissionais || []}
      instanciasInit={instancias || []}
      horariosPorProfInit={horariosPorProf}
    />
  );
}
