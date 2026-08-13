import { getClinica, listClinicas } from "@/lib/db";
import { feegowConectada } from "@/lib/feegow";
import { sessaoAtual, clinicaPermitida } from "@/lib/sessao";
import { hojeSP } from "@/lib/agenda";
import Link from "next/link";
import ExamesView from "./ExamesView";

export const dynamic = "force-dynamic";

// Agenda de EXAMES (separada da agenda de medico). No 1o momento a Pulmonar so
// agenda exames — essa e a tela principal de acompanhamento. Vive no Feegow;
// aqui e so a visao. Isolamento via clinicaPermitida.
export default async function ExamesPage({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return <main className="pagina">Sessao invalida. Faca login de novo.</main>;

  const sp = await searchParams;
  let clinicaId = await clinicaPermitida(sp.clinica ?? null);
  if (sessao.papel === "admin" && !clinicaId) {
    const todas = await listClinicas();
    clinicaId = todas[0]?.id ?? null;
  }
  if (!clinicaId) return <main className="pagina">Acesso negado.</main>;

  const clinica = await getClinica(clinicaId);
  const conectado = feegowConectada(clinica);

  return (
    <main className="pagina">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Agenda de exames</h1>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{clinica?.nome}</span>
        {clinica?.feegow_unidade_nome && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--link)",
              background: "color-mix(in srgb, var(--link) 12%, transparent)",
              padding: "3px 12px",
              borderRadius: 999,
            }}
          >
            {clinica.feegow_unidade_nome}
          </span>
        )}
      </div>
      {!conectado ? (
        <div style={{ marginTop: 24, padding: 24, border: "1px dashed var(--border-forte)", borderRadius: 12, color: "var(--muted)" }}>
          A agenda de exames vem da integração com o sistema da clínica. Conecte em{" "}
          <Link href={`/painel/integracoes${sp.clinica ? `?clinica=${clinicaId}` : ""}`} style={{ color: "var(--link)" }}>
            Integrações
          </Link>{" "}
          pra ver os exames aqui.
        </div>
      ) : (
        <ExamesView clinicaId={clinicaId} hoje={hojeSP()} usaParam={Boolean(sp.clinica)} />
      )}
    </main>
  );
}
