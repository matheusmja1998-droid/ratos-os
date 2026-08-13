import Link from "next/link";
import { listClinicas, getClinica, listLogs } from "@/lib/db";
import { sessaoAtual, clinicaPermitida } from "@/lib/sessao";

export const dynamic = "force-dynamic";

// Log de atividades: tudo que aconteceu na operacao da clinica, em ordem —
// atendimento iniciado, consulta marcada/alterada/cancelada, atendente
// assumiu, presenca confirmada, lembretes e convites enviados pelas reguas.

const FILTROS: { chave: string; rotulo: string }[] = [
  { chave: "", rotulo: "Tudo" },
  { chave: "consulta", rotulo: "Consultas" },
  { chave: "conversa", rotulo: "Conversas" },
  { chave: "atendimento", rotulo: "Atendimentos" },
  { chave: "regua", rotulo: "Mensagens automáticas" },
];

// timestamp do banco -> "08/07 14:30"
function quandoCurto(iso: string): string {
  const m = String(iso || "").match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return String(iso).slice(0, 16);
  return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
}

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string; tipo?: string }>;
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

  const [clinica, logs] = await Promise.all([getClinica(clinicaId), listLogs(clinicaId, 300)]);
  if (!clinica) return null;

  const tipo = sp.tipo || "";
  const visiveis = tipo ? logs.filter((l: any) => l.tipo === tipo) : logs;
  const sufClinica = sessao.papel === "admin" && sp.clinica ? `&clinica=${clinicaId}` : "";

  return (
    <main className="pagina" style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Log de atividades</h1>
        <Link href="/painel/clinica" style={{ color: "var(--link)", textDecoration: "none", fontSize: 14 }}>
          ← configurações
        </Link>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
        {clinica.nome} · toda movimentação da operação, do mais recente pro mais antigo.
      </p>

      {/* filtros por tipo */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {FILTROS.map((f) => (
          <Link
            key={f.chave}
            href={`/painel/log?tipo=${f.chave}${sufClinica}`}
            style={{
              fontSize: 12.5,
              padding: "5px 12px",
              borderRadius: 20,
              textDecoration: "none",
              border: "1px solid " + (tipo === f.chave ? "var(--accent)" : "var(--border)"),
              background: tipo === f.chave ? "var(--accent-soft)" : "var(--surface)",
              color: tipo === f.chave ? "var(--accent)" : "var(--muted)",
              fontWeight: tipo === f.chave ? 700 : 400,
            }}
          >
            {f.rotulo}
          </Link>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <div style={{ marginTop: 30, padding: 36, border: "1px dashed var(--border-forte)", borderRadius: 12, textAlign: "center", color: "var(--muted)" }}>
          Nenhuma movimentação registrada ainda. A partir de agora, tudo que acontecer (consulta marcada,
          alterada, cancelada, atendente assumindo conversa...) aparece aqui.
        </div>
      ) : (
        <div className="card" style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
          {visiveis.map((l: any, i: number) => (
            <div
              key={l.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "baseline",
                padding: "11px 16px",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
                fontSize: 14,
              }}
            >
              <span style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {quandoCurto(l.criado_em)}
              </span>
              <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{l.descricao}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
