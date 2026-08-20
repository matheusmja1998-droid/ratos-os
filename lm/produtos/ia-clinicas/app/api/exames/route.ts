import { NextRequest, NextResponse } from "next/server";
import { getClinica, examesMarcadosPelaIA } from "@/lib/db";
import { feegowConectada, agendaExamesFeegow, listarExamesFeegow, nomesPacientesFeegow } from "@/lib/feegow";
import { clinicaPermitida } from "@/lib/sessao";

// GET /api/exames?clinica=ID&de=YYYY-MM-DD&ate=YYYY-MM-DD
//   -> agenda de EXAMES (exame = profissional_id 0), RAPIDO (sem nomes ainda).
// GET /api/exames?clinica=ID&nomes=304981,306995
//   -> resolve os nomes dos pacientes (em paralelo) — chamado depois pela tela.
// Isolamento: clinica so ve a dela. Feegow token nunca vai ao browser.
export async function GET(req: NextRequest) {
  const clinicaId = await clinicaPermitida(req.nextUrl.searchParams.get("clinica"));
  if (!clinicaId) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const clinica = await getClinica(clinicaId);
  const hojeBase = new Date().toISOString().slice(0, 10);
  const deBase = req.nextUrl.searchParams.get("de") || hojeBase;
  const ateBase = req.nextUrl.searchParams.get("ate") || deBase;

  // Exames marcados PELA IA (moram so no nosso banco). A recepcao lanca esses
  // manualmente no sistema da clinica — por isso eles PRECISAM aparecer aqui.
  const daIA = await examesMarcadosPelaIA(clinicaId, `${deBase}T00:00:00`, `${ateBase}T23:59:59`).catch(() => []);

  if (!feegowConectada(clinica)) {
    // sem integracao a aba continua util: mostra o que a IA marcou
    return NextResponse.json({ conectado: false, exames: [], catalogo: [], daIA });
  }

  // modo 2: resolver nomes de pacientes (segundo passo, sob demanda)
  const nomesParam = req.nextUrl.searchParams.get("nomes");
  if (nomesParam) {
    try {
      const nomes = await nomesPacientesFeegow(clinica.feegow_token, nomesParam.split(","));
      return NextResponse.json({ nomes });
    } catch {
      return NextResponse.json({ nomes: {} });
    }
  }

  // modo 1: agenda do dia — retorna rapido (so 2 chamadas: search + procedures)
  const de = deBase;
  const ate = ateBase;
  try {
    const [exames, catalogo] = await Promise.all([
      // filtra pela UNIDADE configurada (feegow_local_id) — BH agora, Betim depois
      agendaExamesFeegow(clinica.feegow_token, de, ate, clinica.feegow_local_id),
      listarExamesFeegow(clinica.feegow_token),
    ]);
    return NextResponse.json({
      conectado: true,
      exames,
      catalogo,
      daIA,
      unidadeNome: clinica.feegow_unidade_nome || "",
    });
  } catch (e: any) {
    console.warn("[api/exames] falhou:", e.message);
    return NextResponse.json({ conectado: true, exames: [], catalogo: [], daIA, erro: "falha ao ler o Feegow" });
  }
}
