// Dashboard do "numero que vende" — a pagina que sustenta a renovacao.
// Mostra o que a IA gerou pra clinica: no-shows evitados e o R$ recuperado
// (no-shows evitados x ticket medio, configuravel na propria tela, default 250).
// Server Component: busca tudo antes de renderizar. Graficos em SVG puro
// (sem lib externa — CSP bloqueia CDN).

import Link from "next/link";
import { listClinicas, getClinica, metricasClinica, metricasAvancadas } from "@/lib/db";
import { sessaoAtual, clinicaPermitida } from "@/lib/sessao";
import { hojeSP } from "@/lib/agenda";
import { GraficoSerie, Funil, Rosca, CORES } from "./Graficos";
import {
  IconeGraficoLinha,
  IconeSetaEsquerda,
  IconeDinheiro,
  IconeRelogio,
  IconeFunil,
  IconeProfissionais,
} from "../Icones";

export const dynamic = "force-dynamic";

const TICKET_PADRAO = 250;

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// subtrai N dias de uma data YYYY-MM-DD sem depender do fuso do servidor
function diasAtras(dataISO: string, dias: number): string {
  const [y, mo, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d) - dias * 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <main className="pagina" style={{ maxWidth: 600 }}>
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

// ---------- Graficos SVG (server-side, sem JS no cliente) ----------

// Cores de status usadas nos graficos/legendas. Sao cores "de dado" (categoricas),
// nao de UI — escolhidas pra ter contraste tanto no branco quanto no escuro.
// (as cores de UI — texto, borda, fundo — usam os tokens de tema.)
const CORES_STATUS = {
  realizadas: "#2563eb",
  confirmadas: "#16a34a",
  canceladas: "#dc2626",
  aguardando: "#ca8a04",
} as const;
const COR_LEMBRETE = "#2563eb";

// Donut: distribuicao das consultas por status
function Donut({ fatias }: { fatias: { rotulo: string; valor: number; cor: string }[] }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const R = 54;
  const C = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="consultas por status">
        <circle cx="75" cy="75" r={R} fill="none" stroke="var(--border)" strokeWidth="16" />
        {total > 0 &&
          fatias
            .filter((f) => f.valor > 0)
            .map((f) => {
              const frac = f.valor / total;
              const el = (
                <circle
                  key={f.rotulo}
                  cx="75"
                  cy="75"
                  r={R}
                  fill="none"
                  stroke={f.cor}
                  strokeWidth="16"
                  strokeDasharray={`${frac * C} ${C}`}
                  strokeDashoffset={-acumulado * C}
                  transform="rotate(-90 75 75)"
                />
              );
              acumulado += frac;
              return el;
            })}
        <text
          x="75"
          y="71"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="26"
          fontWeight="700"
          fontFamily="inherit"
        >
          {total}
        </text>
        <text x="75" y="90" textAnchor="middle" fill="var(--muted)" fontSize="11" fontFamily="inherit">
          consultas
        </text>
      </svg>
      <div style={{ display: "grid", gap: 8 }}>
        {fatias.map((f) => (
          <div key={f.rotulo} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: f.cor, display: "inline-block" }} />
            <span style={{ color: "var(--muted)" }}>{f.rotulo}</span>
            <strong style={{ marginLeft: "auto", paddingLeft: 16, color: "var(--text)" }}>{f.valor}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// Barras horizontais: o trabalho da regua (lembretes -> confirmacoes -> reviews)
function Barras({ itens }: { itens: { rotulo: string; valor: number; cor: string }[] }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              color: "var(--muted)",
              marginBottom: 4,
            }}
          >
            <span>{i.rotulo}</span>
            <strong style={{ color: "var(--text)" }}>{i.valor}</strong>
          </div>
          <svg width="100%" height="14" style={{ display: "block" }}>
            <rect x="0" y="0" width="100%" height="14" rx="7" fill="var(--border)" />
            <rect
              x="0"
              y="0"
              width={`${Math.round((i.valor / max) * 100)}%`}
              height="14"
              rx="7"
              fill={i.cor}
            />
          </svg>
        </div>
      ))}
    </div>
  );
}

// ---------- Pagina ----------

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string; dias?: string; ticket?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return <Aviso>Sessao invalida. Faca login de novo.</Aviso>;

  const sp = await searchParams;
  const ehAdmin = sessao.papel === "admin";

  // ISOLAMENTO via clinicaPermitida: conta clinica so ve a propria; se pedir
  // outra na URL, nega. Admin escolhe via ?clinica= (ou cai na primeira).
  let pedida = sp.clinica ?? null;
  if (ehAdmin && !pedida) {
    const todas = await listClinicas();
    pedida = todas[0]?.id ?? null;
    if (!pedida) return <Aviso>Nenhuma clinica cadastrada ainda.</Aviso>;
  }
  const clinicaId = await clinicaPermitida(pedida);
  if (!clinicaId) return <Aviso>Acesso negado a essa clinica.</Aviso>;

  // parser seguro: rejeita Infinity/NaN/negativo (senao "R$ NaN"/"R$ ∞"/data invalida
  // via ?ticket=Infinity ou ?dias=Infinity). Inteiro finito >=1, com teto.
  const intClamp = (v: string | undefined, padrao: number, teto: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, teto) : padrao;
  };

  // periodo: ?dias=30|90|365, ou tudo (default: 30). teto 10 anos.
  const diasParam = sp.dias === "tudo" ? null : intClamp(sp.dias, 30, 3650);
  const desde = diasParam ? diasAtras(hojeSP(), diasParam) + "T00:00:00" : "2020-01-01T00:00:00";

  // ticket medio configuravel na tela (?ticket=), default R$250. teto R$100mil.
  const ticket = intClamp(sp.ticket, TICKET_PADRAO, 100000);

  // janela em dias SP pras metricas avancadas (a serie do grafico e por dia)
  const ateDia = hojeSP();
  const deDia = diasAtras(ateDia, Math.min(diasParam ?? 365, 365) - 1);

  const [clinica, m, av] = await Promise.all([
    getClinica(clinicaId),
    metricasClinica(clinicaId, desde),
    metricasAvancadas(clinicaId, deDia, ateDia),
  ]);
  if (!clinica) return <Aviso>Clinica nao encontrada.</Aviso>;

  const recuperado = m.noShowsEvitados * ticket;

  // status "confirmada" cru (metricas.confirmadas inclui realizadas)
  const soConfirmadas = m.confirmadas - m.realizadas;
  const aguardando = Math.max(0, m.total - m.confirmadas - m.canceladas);

  const cardBase = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 20,
    boxShadow: "var(--sombra)",
  } as const;

  const qs = (dias: string) =>
    `/painel/dashboard?dias=${dias}&ticket=${ticket}` + (ehAdmin && sp.clinica ? `&clinica=${clinicaId}` : "");

  const periodoAtivo = sp.dias === "tudo" ? "tudo" : String(diasParam);
  const periodos = [
    { v: "30", rotulo: "30 dias" },
    { v: "90", rotulo: "90 dias" },
    { v: "365", rotulo: "1 ano" },
    { v: "tudo", rotulo: "tudo" },
  ];

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "grid", placeItems: "center", color: "var(--accent)" }}>
              <IconeGraficoLinha size={24} />
            </span>
            Resultados — {clinica.nome}
            {ehAdmin && (
              <span style={{ color: "var(--muted)", fontSize: 14, fontWeight: 400, marginLeft: 10 }}>
                (visao admin)
              </span>
            )}
          </h1>
          <Link
            href={ehAdmin && sp.clinica ? `/painel?clinica=${clinicaId}` : "/painel"}
            style={{
              color: "var(--link)",
              textDecoration: "none",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 4,
            }}
          >
            <IconeSetaEsquerda size={14} />
            voltar pro painel
          </Link>
        </div>

        {/* seletor de periodo */}
        <div style={{ display: "flex", gap: 6 }}>
          {periodos.map((p) => (
            <Link
              key={p.v}
              href={qs(p.v)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                textDecoration: "none",
                fontWeight: 600,
                color: periodoAtivo === p.v ? "var(--accent-contrast)" : "var(--muted)",
                background: periodoAtivo === p.v ? "var(--accent)" : "var(--surface)",
                border: "1px solid " + (periodoAtivo === p.v ? "var(--accent)" : "var(--border)"),
              }}
            >
              {p.rotulo}
            </Link>
          ))}
        </div>
      </div>

      {/* HERO — o numero que vende */}
      <div
        style={{
          marginTop: 24,
          borderRadius: 16,
          padding: "32px 28px",
          background: "var(--accent-soft)",
          border: "1px solid var(--accent)",
          boxShadow: "var(--sombra)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 24,
        }}
      >
        <div>
          <div
            style={{
              color: "var(--ok)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <IconeDinheiro size={15} />
            Receita protegida pela IA
          </div>
          <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.1, marginTop: 6, color: "var(--text)" }}>
            {brl(recuperado)}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 8 }}>
            {m.noShowsEvitados} no-show{m.noShowsEvitados === 1 ? "" : "s"} evitado
            {m.noShowsEvitados === 1 ? "" : "s"} × ticket medio de {brl(ticket)}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, fontWeight: 800, color: "var(--ok)" }}>{m.noShowsEvitados}</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>pacientes que confirmaram<br />presenca apos o lembrete</div>
        </div>

        {/* ticket configuravel — form GET puro, sem JS */}
        <form method="GET" action="/painel/dashboard" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {sp.dias && <input type="hidden" name="dias" value={sp.dias} />}
          {ehAdmin && sp.clinica && <input type="hidden" name="clinica" value={clinicaId} />}
          <label style={{ color: "var(--muted)", fontSize: 13 }} htmlFor="ticket">
            Ticket medio (R$)
          </label>
          <input
            id="ticket"
            name="ticket"
            type="number"
            min={1}
            defaultValue={ticket}
            style={{
              width: 90,
              background: "var(--surface)",
              border: "1px solid var(--border-forte)",
              borderRadius: 8,
              color: "var(--text)",
              padding: "8px 10px",
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            style={{
              background: "var(--accent)",
              color: "var(--accent-contrast)",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            atualizar
          </button>
        </form>
      </div>

      {/* Cards de metrica */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 20 }}>
        <div style={cardBase}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{m.total}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>consultas no periodo</div>
        </div>
        <div style={cardBase}>
          <div style={{ fontSize: 32, fontWeight: 700, color: CORES_STATUS.confirmadas }}>{m.confirmadas}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>confirmadas</div>
        </div>
        <div style={cardBase}>
          <div style={{ fontSize: 32, fontWeight: 700, color: CORES_STATUS.realizadas }}>{m.realizadas}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>realizadas</div>
        </div>
        <div style={cardBase}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{m.lembretesEnviados}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>lembretes enviados</div>
        </div>
        <div style={cardBase}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{m.reviewsPedidos}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>reviews pedidos</div>
        </div>
      </div>

      {/* Graficos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 20 }}>
        <div style={cardBase}>
          <h2 style={{ fontSize: 15, margin: "0 0 16px" }}>Consultas por status</h2>
          <Donut
            fatias={[
              { rotulo: "realizadas", valor: m.realizadas, cor: CORES_STATUS.realizadas },
              { rotulo: "confirmadas", valor: soConfirmadas, cor: CORES_STATUS.confirmadas },
              { rotulo: "aguardando confirmacao", valor: aguardando, cor: CORES_STATUS.aguardando },
              { rotulo: "canceladas", valor: m.canceladas, cor: CORES_STATUS.canceladas },
            ]}
          />
        </div>
        <div style={cardBase}>
          <h2 style={{ fontSize: 15, margin: "0 0 16px" }}>O trabalho da IA no periodo</h2>
          <Barras
            itens={[
              { rotulo: "lembretes D-1 enviados", valor: m.lembretesEnviados, cor: COR_LEMBRETE },
              { rotulo: "no-shows evitados (confirmou apos lembrete)", valor: m.noShowsEvitados, cor: CORES_STATUS.confirmadas },
              { rotulo: "pedidos de review no Google", valor: m.reviewsPedidos, cor: CORES_STATUS.aguardando },
            ]}
          />
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 16, marginBottom: 0 }}>
            No-show evitado = paciente que recebeu o lembrete D-1 e confirmou presenca.
            Cada um vale o ticket medio em receita que nao se perdeu.
          </p>
        </div>
      </div>

      {/* ---------- daqui pra baixo: metricas de funil, tempo e retorno ---------- */}

      {/* Taxas em destaque */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginTop: 20 }}>
        <div style={cardBase}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: 12.5 }}>
            <IconeFunil size={14} /> Taxa de conversão
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 6, color: CORES.agendadas }}>
            {av.taxaConversao}%
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
            de quem conversou saiu com consulta marcada
          </div>
        </div>
        <div style={cardBase}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: 12.5 }}>
            <IconeProfissionais size={14} /> Comparecimento
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 6, color: CORES.confirmadas }}>
            {av.taxaComparecimento}%
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
            dos que marcaram, apareceram
          </div>
        </div>
        <div style={cardBase}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: 12.5 }}>
            <IconeFunil size={14} /> Não comparecimento
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 6, color: CORES.canceladas }}>
            {av.taxaCancelamento}%
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
            das consultas do período foram canceladas
          </div>
        </div>
        <div style={cardBase}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: 12.5 }}>
            <IconeRelogio size={14} /> Tempo de resposta
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 6, color: CORES.conversas }}>
            {av.tempoRespostaMin === null ? "—" : `${av.tempoRespostaMin} min`}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
            média da IA pra responder o paciente
          </div>
        </div>
      </div>

      {/* Serie temporal com seletor de tipo de grafico */}
      <div style={{ ...cardBase, marginTop: 20 }}>
        <GraficoSerie serie={av.serie} />
      </div>

      {/* Funil + pessoas no CRM */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 20 }}>
        <div style={cardBase}>
          <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Funil de atendimento</h2>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 16px" }}>
            Contado por pessoa: de quem falou com a clínica, quantos chegaram até a cadeira.
          </p>
          <Funil
            ticket={ticket}
            etapas={[
              { rotulo: "Conversaram", valor: av.funil.conversas, cor: CORES.conversas },
              { rotulo: "Agendaram", valor: av.funil.agendaram, cor: CORES.agendadas },
              { rotulo: "Confirmaram", valor: av.funil.confirmaram, cor: CORES.aguardando },
              { rotulo: "Compareceram", valor: av.funil.compareceram, cor: CORES.confirmadas },
            ]}
          />
        </div>

        <div style={cardBase}>
          <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Contatos no CRM</h2>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 16px" }}>
            Onde está cada paciente no quadro. {av.pacientesNovos} contato
            {av.pacientesNovos === 1 ? "" : "s"} novo{av.pacientesNovos === 1 ? "" : "s"} no período.
          </p>
          <Rosca
            legenda="pacientes"
            fatias={[
              { rotulo: "Novo contato", valor: av.porEtapaCrm["novo"] || 0, cor: "#64748b" },
              { rotulo: "Em atendimento", valor: av.porEtapaCrm["atendimento"] || 0, cor: CORES.conversas },
              { rotulo: "Agendado", valor: av.porEtapaCrm["agendado"] || 0, cor: CORES.aguardando },
              { rotulo: "Cliente", valor: av.porEtapaCrm["cliente"] || 0, cor: CORES.confirmadas },
              { rotulo: "Perdido", valor: av.porEtapaCrm["perdido"] || 0, cor: CORES.canceladas },
            ]}
          />
        </div>
      </div>

      {/* Retorno sobre o investimento */}
      <div style={{ ...cardBase, marginTop: 20, marginBottom: 8 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Retorno sobre o investimento</h2>
        <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 18px" }}>
          Receita que a IA trouxe no período contra o que a clínica paga por ela.
        </p>
        <RetornoInvestimento
          compareceram={av.funil.compareceram}
          noShowsEvitados={m.noShowsEvitados}
          ticket={ticket}
          mensalidadeCentavos={clinica.plano_valor_centavos ?? 50000}
          dias={diasParam ?? 30}
        />
      </div>
    </main>
  );
}

// ---------- ROI ----------
// Receita gerada = consultas que ACONTECERAM x ticket medio. O custo e a
// mensalidade do periodo (proporcional aos dias). Numeros conservadores de
// proposito: contamos so quem de fato compareceu, nao o que foi marcado.
function RetornoInvestimento({
  compareceram,
  noShowsEvitados,
  ticket,
  mensalidadeCentavos,
  dias,
}: {
  compareceram: number;
  noShowsEvitados: number;
  ticket: number;
  mensalidadeCentavos: number;
  dias: number;
}) {
  const receita = compareceram * ticket;
  const protegida = noShowsEvitados * ticket;
  const custo = (mensalidadeCentavos / 100) * (dias / 30);
  const lucro = receita + protegida - custo;
  // "x vezes o que pagou" — so faz sentido com custo > 0
  const multiplo = custo > 0 ? Math.round(((receita + protegida) / custo) * 10) / 10 : null;

  const linhas = [
    { rotulo: "Receita das consultas realizadas", valor: receita, cor: "var(--ok)" },
    { rotulo: "Receita protegida (no-shows evitados)", valor: protegida, cor: "var(--ok)" },
    { rotulo: `Custo da Facilita no período (${Math.round(dias)} dias)`, valor: -custo, cor: "var(--danger)" },
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gap: 10 }}>
        {linhas.map((l) => (
          <div
            key={l.rotulo}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              fontSize: 13.5,
              paddingBottom: 8,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ color: "var(--muted)" }}>{l.rotulo}</span>
            <strong style={{ color: l.cor, whiteSpace: "nowrap" }}>
              {l.valor < 0 ? "− " : ""}
              {brl(Math.abs(l.valor))}
            </strong>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          background: lucro >= 0 ? "var(--ok-bg)" : "var(--danger-bg)",
          borderRadius: 12,
          padding: "16px 20px",
        }}
      >
        <div>
          <div style={{ color: "var(--muted)", fontSize: 12.5, fontWeight: 600 }}>Resultado no período</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: lucro >= 0 ? "var(--ok)" : "var(--danger)" }}>
            {lucro >= 0 ? "+" : "−"} {brl(Math.abs(lucro))}
          </div>
        </div>
        {multiplo !== null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: "var(--text)" }}>{multiplo}×</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5 }}>o que a clínica investiu</div>
          </div>
        )}
      </div>
    </div>
  );
}
