import Link from "next/link";
import {
  listClinicas,
  listProfissionais,
  listInstancias,
  metricasClinica,
  listEventosAssinatura,
} from "@/lib/db";

export const dynamic = "force-dynamic";

// Visao do NEGOCIO (dono do app): trial, conversao, inadimplencia, MRR e
// perfil de quem fica. Preparado pra funcionar desde ja (sem trial rodando
// ainda) e ganhar precisao conforme assinatura_eventos acumula historico.

const TRIAL_DIAS = 14;

type Linha = {
  clinica: any;
  profs: number;
  insts: number;
  instsConectadas: number;
  uso14d: number; // consultas criadas nos ultimos 14 dias (engajamento)
};

function statusDe(c: any): string {
  return c.assinatura_status || "trial";
}

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// dias corridos desde o cadastro (usa Date direto: SQLite grava UTC e o
// serverless roda em UTC, entao a conta de DIAS nao desloca)
function diasDesde(criadoEm?: string): number {
  if (!criadoEm) return 0;
  const t = new Date(criadoEm).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

function dataBR(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const CORES: Record<string, string> = {
  trial: "#ca8a04",
  ativa: "#16a34a",
  inadimplente: "#dc2626",
  cancelada: "#6b7280",
};
const ROTULOS: Record<string, string> = {
  trial: "Em trial",
  ativa: "Ativas",
  inadimplente: "Inadimplentes",
  cancelada: "Canceladas",
};

export default async function AdminDashboard() {
  const clinicas = await listClinicas();
  const desde14d = new Date(Date.now() - TRIAL_DIAS * 86400000)
    .toISOString()
    .slice(0, 19);

  const [linhas, eventos] = await Promise.all([
    Promise.all(
      clinicas.map(async (c): Promise<Linha> => {
        const [profs, insts, m14] = await Promise.all([
          listProfissionais(c.id),
          listInstancias(c.id),
          metricasClinica(c.id, desde14d),
        ]);
        return {
          clinica: c,
          profs: profs.length,
          insts: insts.length,
          instsConectadas: insts.filter((i: any) => i.status === "conectado" || i.status === "connected").length,
          uso14d: m14.total,
        };
      })
    ),
    listEventosAssinatura(500),
  ]);

  const nomePorId = new Map(clinicas.map((c) => [c.id, c.nome]));

  // ---- consolidado por status ----
  const porStatus: Record<string, Linha[]> = { trial: [], ativa: [], inadimplente: [], cancelada: [] };
  for (const l of linhas) (porStatus[statusDe(l.clinica)] ||= []).push(l);

  const mrr = porStatus.ativa.reduce((s, l) => s + (l.clinica.plano_valor_centavos ?? 50000), 0);
  const mrrRisco = porStatus.inadimplente.reduce((s, l) => s + (l.clinica.plano_valor_centavos ?? 50000), 0);

  // ---- conversao trial -> ativa (do historico de eventos) ----
  const converteram = new Set(
    eventos.filter((e: any) => e.de_status === "trial" && e.para_status === "ativa").map((e: any) => e.clinica_id)
  );
  const desistiramDoTrial = new Set(
    eventos.filter((e: any) => e.de_status === "trial" && e.para_status === "cancelada").map((e: any) => e.clinica_id)
  );
  const trialsFinalizados = converteram.size + desistiramDoTrial.size;
  const taxaConversao = trialsFinalizados > 0 ? Math.round((converteram.size / trialsFinalizados) * 100) : null;

  // ---- pagamento em dia vs inadimplencia (base pagante = ativa + inadimplente) ----
  const basePagante = porStatus.ativa.length + porStatus.inadimplente.length;
  const pctEmDia = basePagante > 0 ? Math.round((porStatus.ativa.length / basePagante) * 100) : null;
  const pctInadimplencia = basePagante > 0 ? 100 - (pctEmDia as number) : null;

  // ---- ranking: quem mais caiu em inadimplencia (historico) ----
  const quedas = new Map<string, number>();
  for (const e of eventos) {
    if (e.para_status === "inadimplente") quedas.set(e.clinica_id, (quedas.get(e.clinica_id) || 0) + 1);
  }
  const rankingInadimplencia = Array.from(quedas.entries())
    .map(([id, vezes]) => ({ id, vezes, nome: nomePorId.get(id) || id }))
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, 8);

  // ---- perfil de quem fica (retencao por segmento) ----
  const faixaMedicos = (n: number) => (n <= 2 ? "1-2 medicos" : n <= 5 ? "3-5 medicos" : "6+ medicos");
  const faixaWhats = (n: number) => (n <= 1 ? "1 numero" : "2+ numeros");
  const segmenta = (rotulo: (l: Linha) => string) => {
    const grupos = new Map<string, { total: number; ativas: number }>();
    for (const l of linhas) {
      const k = rotulo(l);
      const g = grupos.get(k) || { total: 0, ativas: 0 };
      g.total++;
      if (statusDe(l.clinica) === "ativa") g.ativas++;
      grupos.set(k, g);
    }
    return Array.from(grupos.entries()).map(([k, g]) => ({
      rotulo: k,
      total: g.total,
      ativas: g.ativas,
      pct: g.total > 0 ? Math.round((g.ativas / g.total) * 100) : 0,
    }));
  };
  const ordemMedicos = ["1-2 medicos", "3-5 medicos", "6+ medicos"];
  const segMedicos = segmenta((l) => faixaMedicos(l.profs)).sort(
    (a, b) => ordemMedicos.indexOf(a.rotulo) - ordemMedicos.indexOf(b.rotulo)
  );
  const segWhats = segmenta((l) => faixaWhats(l.insts)).sort((a, b) => a.rotulo.localeCompare(b.rotulo));

  // ---- trials em andamento ----
  const trials = porStatus.trial
    .map((l) => {
      const dias = diasDesde(l.clinica.criado_em);
      return { ...l, diasRestantes: TRIAL_DIAS - dias, dias };
    })
    .sort((a, b) => a.diasRestantes - b.diasRestantes);

  // ---- inadimplentes com "desde quando" (ultimo evento) ----
  const inadimplentes = porStatus.inadimplente.map((l) => {
    const ev = eventos.find((e: any) => e.clinica_id === l.clinica.id && e.para_status === "inadimplente");
    return { ...l, desde: ev?.criado_em as string | undefined };
  });

  const totalStatus = clinicas.length || 1;

  return (
    <main className="pagina">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Visão do negócio</h1>
        <Link href="/admin" style={{ color: "var(--link)", textDecoration: "none", fontSize: 14 }}>
          ← painel do admin
        </Link>
      </div>
      <p style={{ color: "var(--muted)", marginTop: 4 }}>
        Trial, conversão, inadimplência e perfil de quem fica. Atualiza sozinho conforme o Stripe muda os status.
      </p>

      {/* ===== consolidado ===== */}
      <div className="grid-metricas" style={{ gap: 14, marginTop: 18 }}>
        <Card num={clinicas.length} rotulo="clínicas no total" />
        <Card num={porStatus.trial.length} rotulo="em trial" cor={CORES.trial} />
        <Card num={porStatus.ativa.length} rotulo="ativas (pagando)" cor={CORES.ativa} />
        <Card num={porStatus.inadimplente.length} rotulo="inadimplentes" cor={CORES.inadimplente} />
      </div>
      <div className="grid-metricas" style={{ gap: 14, marginTop: 14 }}>
        <div className="card">
          <div style={{ fontSize: 28, fontWeight: 700, color: CORES.ativa }}>{reais(mrr)}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>MRR (receita recorrente/mês)</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 28, fontWeight: 700, color: mrrRisco > 0 ? CORES.inadimplente : "var(--text)" }}>{reais(mrrRisco)}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>MRR em risco (inadimplência)</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 28, fontWeight: 700 }}>{taxaConversao === null ? "—" : `${taxaConversao}%`}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
            conversão trial → ativa {taxaConversao === null ? "(sem trials finalizados ainda)" : `(${converteram.size} de ${trialsFinalizados})`}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 28, fontWeight: 700, color: pctEmDia !== null && pctEmDia < 80 ? CORES.inadimplente : CORES.ativa }}>
            {pctEmDia === null ? "—" : `${pctEmDia}%`}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
            pagando em dia {pctInadimplencia !== null ? `· ${pctInadimplencia}% inadimplência` : "(sem base pagante ainda)"}
          </div>
        </div>
      </div>

      {/* ===== distribuicao por status (barra) ===== */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Distribuição das clínicas</h2>
        <div style={{ display: "flex", height: 18, borderRadius: 9, overflow: "hidden", background: "var(--surface-2, var(--border))" }}>
          {(["ativa", "trial", "inadimplente", "cancelada"] as const).map((s) =>
            porStatus[s].length > 0 ? (
              <div key={s} style={{ width: `${(porStatus[s].length / totalStatus) * 100}%`, background: CORES[s] }} title={`${ROTULOS[s]}: ${porStatus[s].length}`} />
            ) : null
          )}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          {(["ativa", "trial", "inadimplente", "cancelada"] as const).map((s) => (
            <span key={s} style={{ fontSize: 12.5, color: "var(--muted)" }}>
              <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: CORES[s], marginRight: 6 }} />
              {ROTULOS[s]}: <b style={{ color: "var(--text)" }}>{porStatus[s].length}</b>
            </span>
          ))}
        </div>
      </div>

      {/* ===== trials em andamento ===== */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>⏳ Trials em andamento ({trials.length})</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 12px" }}>
          Trial de {TRIAL_DIAS} dias. "Usando" = teve consulta no período; "parada" vale ligar antes que o trial morra.
        </p>
        {trials.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Nenhuma clínica em trial agora.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                  <th style={{ padding: "6px 8px" }}>Clínica</th>
                  <th style={{ padding: "6px 8px" }}>Dias restantes</th>
                  <th style={{ padding: "6px 8px" }}>Médicos</th>
                  <th style={{ padding: "6px 8px" }}>WhatsApps</th>
                  <th style={{ padding: "6px 8px" }}>Consultas (14d)</th>
                  <th style={{ padding: "6px 8px" }}>Uso</th>
                </tr>
              </thead>
              <tbody>
                {trials.map((t) => (
                  <tr key={t.clinica.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px" }}>
                      <Link href={`/painel?clinica=${t.clinica.id}`} style={{ color: "var(--link)", textDecoration: "none" }}>
                        {t.clinica.nome}
                      </Link>
                    </td>
                    <td style={{ padding: "8px", fontWeight: 700, color: t.diasRestantes <= 0 ? CORES.inadimplente : t.diasRestantes <= 4 ? CORES.trial : "var(--text)" }}>
                      {t.diasRestantes <= 0 ? "vencido" : `${t.diasRestantes}d`}
                    </td>
                    <td style={{ padding: "8px" }}>{t.profs}</td>
                    <td style={{ padding: "8px" }}>{t.instsConectadas}/{t.insts}</td>
                    <td style={{ padding: "8px" }}>{t.uso14d}</td>
                    <td style={{ padding: "8px" }}>{t.uso14d > 0 ? "usando" : "parada"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== inadimplentes ===== */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Inadimplentes ({inadimplentes.length})</h2>
        {inadimplentes.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Nenhuma clínica inadimplente.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                  <th style={{ padding: "6px 8px" }}>Clínica</th>
                  <th style={{ padding: "6px 8px" }}>Valor/mês</th>
                  <th style={{ padding: "6px 8px" }}>Desde</th>
                  <th style={{ padding: "6px 8px" }}>Consultas (14d)</th>
                </tr>
              </thead>
              <tbody>
                {inadimplentes.map((l) => (
                  <tr key={l.clinica.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px" }}>{l.clinica.nome}</td>
                    <td style={{ padding: "8px", fontWeight: 700 }}>{reais(l.clinica.plano_valor_centavos ?? 50000)}</td>
                    <td style={{ padding: "8px" }}>{l.desde ? dataBR(l.desde) : "—"}</td>
                    <td style={{ padding: "8px" }}>{l.uso14d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rankingInadimplencia.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Quem mais caiu em inadimplência (histórico)</div>
            {rankingInadimplencia.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "4px 0", color: "var(--muted)" }}>
                <span>{r.nome}</span>
                <b style={{ color: CORES.inadimplente }}>{r.vezes}x</b>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== perfil de quem fica ===== */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>Perfil de quem fica (retenção por segmento)</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 14px" }}>
          % de clínicas ATIVAS dentro de cada segmento. Vai ficando mais preciso conforme a base cresce.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          <SegmentoBloco titulo="Por tamanho (nº de médicos)" itens={segMedicos} />
          <SegmentoBloco titulo="Por nº de WhatsApps" itens={segWhats} />
        </div>
      </div>

      {/* ===== feed de eventos ===== */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Últimas mudanças de assinatura</h2>
        {eventos.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>
            Nenhuma transição registrada ainda. A partir de agora, toda mudança (trial → ativa, ativa → inadimplente...)
            fica registrada aqui automaticamente.
          </div>
        ) : (
          eventos.slice(0, 12).map((e: any) => (
            <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", fontSize: 13.5, borderTop: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted)", minWidth: 42 }}>{dataBR(e.criado_em)}</span>
              <span>{nomePorId.get(e.clinica_id) || "clínica removida"}</span>
              <span style={{ color: "var(--muted)" }}>
                {e.de_status || "novo"} → <b style={{ color: CORES[e.para_status] || "var(--text)" }}>{e.para_status}</b>
              </span>
            </div>
          ))
        )}
      </div>
    </main>
  );
}

function Card({ num, rotulo, cor }: { num: number; rotulo: string; cor?: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: 32, fontWeight: 700, color: cor || "var(--text)" }}>{num}</div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{rotulo}</div>
    </div>
  );
}

function SegmentoBloco({
  titulo,
  itens,
}: {
  titulo: string;
  itens: { rotulo: string; total: number; ativas: number; pct: number }[];
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{titulo}</div>
      {itens.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>sem clínicas ainda</div>
      ) : (
        itens.map((s) => (
          <div key={s.rotulo} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span>{s.rotulo} <span style={{ color: "var(--muted)" }}>({s.total} clínica{s.total === 1 ? "" : "s"})</span></span>
              <b>{s.pct}% ativas</b>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2, var(--border))", overflow: "hidden" }}>
              <div style={{ width: `${s.pct}%`, height: "100%", background: "#16a34a" }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
