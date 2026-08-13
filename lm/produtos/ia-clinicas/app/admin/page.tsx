import { listClinicas, listProfissionais, listInstancias, metricasClinica, usoTokensClinica } from "@/lib/db";
import { calcularCusto, reais } from "@/lib/custo";
import Link from "next/link";
import BotaoRemoverClinica from "./BotaoRemoverClinica";
import Sair from "../painel/Sair";
import BotaoCobranca from "./BotaoCobranca";
import BotaoIniciarTrial from "./BotaoIniciarTrial";

export const dynamic = "force-dynamic";

// Desde sempre: pega toda a base pra somar as metricas gerais.
const DESDE_SEMPRE = "2020-01-01T00:00:00";

// wpp conectado = instancia que nao esta desconectada/invalida
function whatsConectado(insts: any[]) {
  return insts.filter((i: any) => i.status === "conectado" || i.status === "connected").length;
}

// Situacao do trial de 14 dias a partir de trial_inicio (Iniciar trial).
// null = nunca iniciado (mostra o botao); senao mostra a contagem.
function situacaoTrial(trialInicio?: string | null): { texto: string; acabou: boolean } | null {
  if (!trialInicio) return null;
  const inicio = new Date(trialInicio).getTime();
  if (isNaN(inicio)) return null;
  const passados = Math.floor((Date.now() - inicio) / 86400000);
  const restam = 14 - passados;
  if (restam > 0) return { texto: `trial: ${restam} dia${restam === 1 ? "" : "s"} restante${restam === 1 ? "" : "s"}`, acabou: false };
  return { texto: `trial encerrado há ${Math.abs(restam)} dia${Math.abs(restam) === 1 ? "" : "s"}`, acabou: true };
}

// badge do status da assinatura (cores semanticas, funcionam nos 2 temas)
function BadgeAssinatura({ status }: { status?: string }) {
  const s = status || "trial";
  const mapa: Record<string, { txt: string; cor: string; bg: string }> = {
    ativa: { txt: "assinatura ativa", cor: "#16a34a", bg: "rgba(22,163,74,0.12)" },
    trial: { txt: "em teste", cor: "#ca8a04", bg: "rgba(202,138,4,0.12)" },
    inadimplente: { txt: "inadimplente", cor: "#dc2626", bg: "rgba(220,38,38,0.12)" },
    cancelada: { txt: "cancelada", cor: "#6b7280", bg: "rgba(107,114,128,0.12)" },
  };
  const e = mapa[s] || mapa.trial;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: e.cor,
        background: e.bg,
        padding: "3px 9px",
        borderRadius: 20,
        whiteSpace: "nowrap",
      }}
    >
      {e.txt}
    </span>
  );
}

export default async function Admin() {
  const clinicas = await listClinicas();

  // Busca os dados de cada clinica em paralelo (nada de async dentro do .map de render).
  const dados = await Promise.all(
    clinicas.map(async (c) => {
      const uso = await usoTokensClinica(c.id); // mes corrente
      return {
        clinica: c,
        profs: await listProfissionais(c.id),
        insts: await listInstancias(c.id),
        metricas: await metricasClinica(c.id, DESDE_SEMPRE),
        uso,
        custo: calcularCusto(uso), // custo de IA no mes
      };
    })
  );

  // Metricas gerais somando todas as clinicas.
  const geral = dados.reduce(
    (acc, d) => ({
      consultas: acc.consultas + d.metricas.total,
      noShows: acc.noShows + d.metricas.noShowsEvitados,
      reviews: acc.reviews + d.metricas.reviewsPedidos,
      custoBrl: acc.custoBrl + d.custo.brl,
    }),
    { consultas: 0, noShows: 0, reviews: 0, custoBrl: 0 }
  );

  const cards = [
    { rotulo: "Clinicas", valor: clinicas.length },
    { rotulo: "Consultas", valor: geral.consultas },
    { rotulo: "No-shows evitados", valor: geral.noShows },
    { rotulo: "Custo IA (mês)", valor: reais(geral.custoBrl) },
  ];

  return (
    <main className="pagina">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Painel do Admin</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/admin/dashboard" className="btn-fantasma" style={{ padding: "10px 18px", textDecoration: "none" }}>
            Visão do negócio
          </Link>
          <Link href="/admin/nova" className="btn-primario" style={{ padding: "10px 18px" }}>
            + Nova clinica
          </Link>
          <Sair />
        </div>
      </div>
      <p style={{ color: "var(--muted)", marginTop: 4 }}>
        Visao geral de todas as clinicas. Abra qualquer uma pra ver o painel dela.
      </p>

      {/* Metricas gerais */}
      <div className="grid-metricas" style={{ gap: 16 }}>
        {cards.map((card) => (
          <div key={card.rotulo} className="card">
            <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{card.valor}</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>{card.rotulo}</div>
          </div>
        ))}
      </div>

      {/* Estado vazio */}
      {clinicas.length === 0 && (
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
          Nenhuma clinica cadastrada ainda. Clique em{" "}
          <Link href="/admin/nova" style={{ color: "var(--accent)" }}>
            "+ Nova clinica"
          </Link>{" "}
          pra criar a primeira.
        </div>
      )}

      {/* Lista de clinicas */}
      {dados.map(({ clinica: c, profs, insts, metricas, uso, custo }) => (
        <div key={c.id} className="card" style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>{c.nome}</h2>
                <BadgeAssinatura status={c.assinatura_status} />
                {(() => {
                  const t = situacaoTrial(c.trial_inicio);
                  if (!t) return <BotaoIniciarTrial clinicaId={c.id} nome={c.nome} />;
                  return (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: t.acabou ? "#dc2626" : "#2563eb",
                        background: t.acabou ? "rgba(220,38,38,0.12)" : "rgba(37,99,235,0.12)",
                        padding: "3px 9px",
                        borderRadius: 20,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.texto}
                    </span>
                  );
                })()}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                {c.endereco || "sem endereco"} · {profs.length} profissional(is) ·{" "}
                {whatsConectado(insts)}/{insts.length} whats conectado(s)
              </div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
              <Link
                href={`/painel?clinica=${c.id}`}
                style={{ color: "var(--link)", textDecoration: "none", fontSize: 14 }}
              >
                abrir →
              </Link>
              <BotaoRemoverClinica id={c.id} nome={c.nome} />
            </span>
          </div>

          <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
            <Metrica rotulo="Consultas" valor={metricas.total} />
            <Metrica rotulo="Confirmadas" valor={metricas.confirmadas} cor="var(--accent)" />
            <Metrica rotulo="No-shows evitados" valor={metricas.noShowsEvitados} />
            <Metrica rotulo="Reviews pedidos" valor={metricas.reviewsPedidos} />
          </div>

          {/* CUSTO DE IA no mes (tokens reais) — pra saber a margem por clinica */}
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "color-mix(in srgb, var(--link) 8%, transparent)",
              borderRadius: 10,
              display: "flex",
              gap: 20,
              flexWrap: "wrap",
              alignItems: "baseline",
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              Custo IA no mês: {reais(custo.brl)}
            </span>
            <span style={{ color: "var(--muted)" }}>
              {uso.chamadas} respostas · {milhares(uso.input + uso.cacheRead + uso.cacheWrite)} tokens entrada ·{" "}
              {milhares(uso.output)} saída
            </span>
            {uso.chamadas === 0 && <span style={{ color: "var(--muted)" }}>sem uso este mês</span>}
          </div>

          {/* Cobranca da assinatura (Matheus cobra a clinica) */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <BotaoCobranca clinicaId={c.id} />
          </div>
        </div>
      ))}
    </main>
  );
}

// formata contagem de tokens: "756" abaixo de mil, "15,3k" acima (nunca "0k")
function milhares(n: number): string {
  if (n < 1000) return String(n);
  return (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k";
}

function Metrica({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || "var(--text)" }}>{valor}</div>
      <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{rotulo}</div>
    </div>
  );
}
