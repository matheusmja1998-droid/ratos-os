"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconeMais,
  IconeAgenda,
  IconeLapis,
  IconeX,
  IconeClipe,
  IconeConversas,
  IconeAlerta,
} from "./Icones";

// Visao de agenda ESTILO GOOGLE CALENDAR: grade semanal (7 dias x horas 07-20),
// eventos como blocos posicionados no horario certo. Filtro por medico roda no
// cliente (a agenda dos 7 dias ja veio do servidor). Datas sao strings
// wall-clock SP "YYYY-MM-DDTHH:mm:00" — fatiamos direto, nunca via Date().

type Consulta = {
  id: string;
  inicio: string;
  fim: string;
  status: string;
  profissional_id: string;
  profissional_nome?: string;
  paciente_nome?: string;
  telefone?: string;
  origem?: string;
  pagamento?: string | null;      // "particular" | "convenio"
  convenio_nome?: string | null;
  observacao?: string | null;
  guia_url?: string | null;       // guia do exame enviada pelo paciente
};

// motivos pre-definidos (a recepcao seleciona; vira auditoria no log)
const MOTIVOS_ALTERACAO = [
  "Pedido do paciente",
  "Remarcado pela clínica",
  "Profissional indisponível",
  "Encaixe de urgência",
  "Outro",
];
const MOTIVOS_CANCELAMENTO = [
  "Pedido do paciente",
  "Paciente não pode comparecer",
  "Cancelado pela clínica",
  "Falta / não respondeu",
  "Outro",
];

// texto amigavel da forma de pagamento (pro card da agenda)
function rotuloPagamento(c: { pagamento?: string | null; convenio_nome?: string | null }): string | null {
  if (!c.pagamento) return null;
  if (c.pagamento === "convenio")
    return c.convenio_nome ? `Convênio · ${c.convenio_nome}` : "Convênio";
  if (c.pagamento === "particular") return "Particular";
  return c.pagamento;
}

type Prof = { id: string; nome: string; especialidade?: string | null; gcal_conectado?: any };

// faixa de horas da grade (comercial)
const HORA_INI = 7;
const HORA_FIM = 20;
const PX_POR_HORA = 56; // altura de 1h na grade

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// cor do bloco por status (categorica, contraste nos 2 temas)
function statusCor(status: string) {
  return (
    ({
      agendada: "#ca8a04",
      confirmada: "#16a34a",
      cancelada: "#dc2626",
      realizada: "#2563eb",
      faltou: "#ea580c",
    } as Record<string, string>)[status] || "#6b7280"
  );
}

// minutos desde 00h de um "YYYY-MM-DDTHH:mm:00"
function minutosDoDia(iso: string): number {
  const h = Number(iso.slice(11, 13));
  const m = Number(iso.slice(14, 16));
  return h * 60 + m;
}

// Distribui eventos que colidem no horario em COLUNAS lado a lado (estilo Google
// Calendar). Sem isso, encaixes no mesmo minuto (ex: Dr. Silvio) ou 2 medicos no
// mesmo horario (visao "todos") ficavam empilhados um sobre o outro, escondendo
// consultas — o que a clinica leu como "a agenda de um medico invadindo a do
// outro". Retorna, por id de evento, { col, totalCols } do grupo de colisao.
function calcularColunas(
  eventos: { id: string; inicio: string; fim?: string }[]
): Map<string, { col: number; totalCols: number }> {
  const res = new Map<string, { col: number; totalCols: number }>();
  const ordenados = eventos
    .map((e) => ({
      id: e.id,
      ini: minutosDoDia(e.inicio),
      fim: e.fim ? minutosDoDia(e.fim) : minutosDoDia(e.inicio) + 30,
    }))
    .sort((a, b) => a.ini - b.ini || a.fim - b.fim);

  // varre em grupos de colisao: enquanto um evento comeca antes do fim maximo do
  // grupo atual, ele pertence ao mesmo grupo. Dentro do grupo, aloca colunas.
  let i = 0;
  while (i < ordenados.length) {
    const grupo = [ordenados[i]];
    let fimMax = ordenados[i].fim;
    let j = i + 1;
    while (j < ordenados.length && ordenados[j].ini < fimMax) {
      grupo.push(ordenados[j]);
      fimMax = Math.max(fimMax, ordenados[j].fim);
      j++;
    }
    // aloca cada evento do grupo na 1a coluna livre (que nao colida)
    const colsFim: number[] = []; // fim do ultimo evento em cada coluna
    for (const ev of grupo) {
      let col = colsFim.findIndex((f) => f <= ev.ini);
      if (col === -1) {
        col = colsFim.length;
        colsFim.push(ev.fim);
      } else {
        colsFim[col] = ev.fim;
      }
      res.set(ev.id, { col, totalCols: 0 }); // totalCols preenchido abaixo
    }
    const totalCols = colsFim.length;
    for (const ev of grupo) {
      const r = res.get(ev.id)!;
      r.totalCols = totalCols;
    }
    i = j;
  }
  return res;
}

function rotuloTopo(dataISO: string, hojeISO: string, amanhaISO: string) {
  const [y, mo, d] = dataISO.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return { dia: DIAS[dow], num: `${d} ${MESES[mo - 1]}`, hoje: dataISO === hojeISO, amanha: dataISO === amanhaISO };
}

// lista os 7 dias a partir de hoje (YYYY-MM-DD, em UTC puro pra nao pegar fuso)
function seteDias(hojeISO: string): string[] {
  const [y, mo, d] = hojeISO.split("-").map(Number);
  const base = Date.UTC(y, mo - 1, d);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(base + i * 86400000);
    const p = (n: number) => String(n).padStart(2, "0");
    out.push(`${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`);
  }
  return out;
}

export default function AgendaView({
  agenda,
  profissionais,
  hoje,
  amanha,
  inicioSemana,
  clinicaId,
}: {
  agenda: Consulta[];
  profissionais: Prof[];
  hoje: string;
  amanha: string;
  inicioSemana?: string; // primeiro dia da janela exibida (navegacao por semanas)
  clinicaId: string;
}) {
  const router = useRouter();
  const [profId, setProfId] = useState<string>("todos");
  const [aberta, setAberta] = useState<Consulta | null>(null); // consulta do modal
  const [novaAberta, setNovaAberta] = useState(false); // modal de marcacao manual
  // acao da recepcao sobre a consulta aberta (card flutuante com motivo)
  const [acao, setAcao] = useState<null | { modo: "alterar" | "cancelar" | "observacao"; consulta: Consulta }>(null);

  const baseDias = inicioSemana || hoje;
  const dias = useMemo(() => seteDias(baseDias), [baseDias]);

  // MOBILE: em tela estreita a grade de 7 colunas fica ilegivel — mostramos UM
  // dia por vez com pager ‹ dia ›. Desktop segue com a semana inteira.
  const [ehMobile, setEhMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const upd = () => setEhMobile(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  const [diaSel, setDiaSel] = useState(0);
  useEffect(() => {
    // ao trocar de semana, cai no dia de hoje (se estiver na janela) ou na segunda
    const i = dias.indexOf(hoje);
    setDiaSel(i >= 0 ? i : 0);
  }, [dias, hoje]);
  const diasVisiveis = ehMobile ? [dias[Math.min(diaSel, dias.length - 1)]] : dias;

  // Animacao de deslizar ao trocar de semana: compara a semana atual com a
  // ultima vista (sessionStorage) — foi pra FRENTE, a grade entra vindo da
  // direita; pra TRAS, vindo da esquerda. Primeira visita nao anima.
  const [desliza, setDesliza] = useState<"" | "desliza-frente" | "desliza-tras">("");
  useEffect(() => {
    try {
      const anterior = sessionStorage.getItem("agenda_ultima_semana");
      if (anterior && anterior !== baseDias) {
        setDesliza(baseDias > anterior ? "desliza-frente" : "desliza-tras");
      }
      sessionStorage.setItem("agenda_ultima_semana", baseDias);
    } catch {
      /* sessionStorage bloqueado: segue sem animacao */
    }
  }, [baseDias]);
  const horas = useMemo(
    () => Array.from({ length: HORA_FIM - HORA_INI + 1 }, (_, i) => HORA_INI + i),
    []
  );

  // filtra por medico e indexa por dia
  const porDia = useMemo(() => {
    const filtrada =
      profId === "todos" ? agenda : agenda.filter((c) => c.profissional_id === profId);
    const mapa = new Map<string, Consulta[]>();
    for (const c of filtrada) {
      const dia = c.inicio.slice(0, 10);
      if (!mapa.has(dia)) mapa.set(dia, []);
      mapa.get(dia)!.push(c);
    }
    return mapa;
  }, [agenda, profId]);

  const totalFiltrado = useMemo(() => {
    let n = 0;
    porDia.forEach((cs) => (n += cs.length));
    return n;
  }, [porDia]);

  const profSelecionado =
    profId !== "todos" ? profissionais.find((p) => p.id === profId) : null;

  const alturaGrade = (HORA_FIM - HORA_INI + 1) * PX_POR_HORA;
  const topoMin = HORA_INI * 60;

  return (
    <section>
      {/* Seletor de medico */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <label className="rotulo" style={{ margin: 0 }} htmlFor="filtro-medico">Agenda:</label>
        <select
          id="filtro-medico"
          className="input"
          value={profId}
          onChange={(e) => setProfId(e.target.value)}
          style={{ width: "auto", minWidth: 220, marginTop: 0 }}
        >
          <option value="todos">Todos os medicos (agenda geral)</option>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}{p.especialidade ? ` — ${p.especialidade}` : ""}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          {totalFiltrado} consulta{totalFiltrado === 1 ? "" : "s"} · na semana
        </span>
        <button
          className="btn-primario"
          onClick={() => setNovaAberta(true)}
          style={{ marginLeft: "auto", padding: "8px 14px", fontSize: 14 }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconeMais size={15} /> Marcar consulta</span>
        </button>
      </div>

      {/* aviso de vinculo do Google quando um medico esta selecionado */}
      {profSelecionado && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--muted)", fontSize: 13 }}>
          {(profSelecionado.gcal_conectado === true || profSelecionado.gcal_conectado === 1) ? (
            <><IconeAgenda /> Mostrando a agenda do <b style={{ color: "var(--text)" }}>{profSelecionado.nome}</b> direto do Google Calendar dele.</>
          ) : (
            <><IconeAgenda /> <b style={{ color: "var(--text)" }}>{profSelecionado.nome}</b> ainda nao conectou o Google Agenda. Conecte no cadastro do medico pra ver a agenda do Google aqui.</>
          )}
        </div>
      )}

      {/* pager de dia (SO mobile): ‹ Seg, 4 ago · hoje › */}
      {ehMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <button
            className="btn-fantasma"
            onClick={() => setDiaSel((d) => Math.max(0, d - 1))}
            disabled={diaSel === 0}
            style={{ padding: "8px 14px", fontSize: 16, lineHeight: 1 }}
            aria-label="dia anterior"
          >
            ‹
          </button>
          <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 15 }}>
            {(() => {
              const r = rotuloTopo(diasVisiveis[0], hoje, amanha);
              return (
                <span style={{ color: r.hoje ? "var(--accent)" : "var(--text)" }}>
                  {r.dia}, {r.num}
                  {r.hoje ? " · hoje" : r.amanha ? " · amanhã" : ""}
                </span>
              );
            })()}
          </div>
          <button
            className="btn-fantasma"
            onClick={() => setDiaSel((d) => Math.min(dias.length - 1, d + 1))}
            disabled={diaSel >= dias.length - 1}
            style={{ padding: "8px 14px", fontSize: 16, lineHeight: 1 }}
            aria-label="proximo dia"
          >
            ›
          </button>
        </div>
      )}

      {/* GRADE estilo Google Calendar (semana no desktop, 1 dia no mobile) */}
      <div className={`card ${desliza}`} key={baseDias} style={{ padding: 0, overflowX: "auto" }}>
        <div style={{ minWidth: ehMobile ? undefined : 720 }}>
          {/* cabecalho: coluna de hora + dias */}
          <div style={{ display: "grid", gridTemplateColumns: `48px repeat(${diasVisiveis.length}, 1fr)`, borderBottom: "1px solid var(--border)" }}>
            <div />
            {diasVisiveis.map((d) => {
              const r = rotuloTopo(d, hoje, amanha);
              return (
                <div key={d} style={{ textAlign: "center", padding: "8px 4px", borderLeft: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: r.hoje ? "var(--accent)" : "var(--muted)", fontWeight: 600 }}>
                    {r.dia}{r.hoje ? " · hoje" : r.amanha ? " · amanhã" : ""}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, color: r.hoje ? "var(--accent)" : "var(--text)" }}>{r.num}</div>
                </div>
              );
            })}
          </div>

          {/* corpo: coluna de horas + colunas de dia com blocos posicionados */}
          <div style={{ display: "grid", gridTemplateColumns: `48px repeat(${diasVisiveis.length}, 1fr)`, position: "relative" }}>
            {/* coluna das horas */}
            <div style={{ position: "relative", height: alturaGrade }}>
              {horas.map((h, i) => (
                <div key={h} style={{ position: "absolute", top: i * PX_POR_HORA - 7, right: 6, fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                  {String(h).padStart(2, "0")}h
                </div>
              ))}
            </div>

            {/* colunas dos dias */}
            {diasVisiveis.map((dia) => {
              const consultas = (porDia.get(dia) || []).slice().sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
              // LAYOUT ANTI-SOBREPOSICAO (estilo Google Calendar): eventos que
              // colidem no horario (ex: encaixes do Dr. Silvio, ou 2 medicos no
              // mesmo minuto na visao "todos") sao postos LADO A LADO em vez de
              // empilhados um sobre o outro (o que escondia consultas). Cada
              // evento recebe { col, totalCols } do seu grupo de colisao.
              const layout = calcularColunas(consultas);
              return (
                <div key={dia} style={{ position: "relative", height: alturaGrade, borderLeft: "1px solid var(--border)" }}>
                  {/* linhas de hora (fundo) */}
                  {horas.map((h, i) => (
                    <div key={h} style={{ position: "absolute", top: i * PX_POR_HORA, left: 0, right: 0, borderTop: "1px solid var(--border-soft, var(--border))", opacity: 0.5 }} />
                  ))}
                  {/* blocos de consulta */}
                  {consultas.map((c) => {
                    const ini = minutosDoDia(c.inicio);
                    const fimMin = c.fim ? minutosDoDia(c.fim) : ini + 30;
                    const top = ((ini - topoMin) / 60) * PX_POR_HORA;
                    const altura = Math.max(18, ((fimMin - ini) / 60) * PX_POR_HORA - 2);
                    // clampa dentro da faixa visivel
                    if (top + altura < 0 || top > alturaGrade) return null;
                    const cor = statusCor(c.status);
                    const cancelada = c.status === "cancelada";
                    // posicao horizontal pela coluna do grupo de colisao
                    const pos = layout.get(c.id) || { col: 0, totalCols: 1 };
                    const larguraPct = 100 / pos.totalCols;
                    const leftPct = larguraPct * pos.col;
                    return (
                      <div
                        key={c.id}
                        onClick={() => setAberta(c)}
                        title="clique pra ver os detalhes"
                        style={{
                          position: "absolute",
                          top: Math.max(0, top),
                          left: `calc(${leftPct}% + 3px)`,
                          width: `calc(${larguraPct}% - 6px)`,
                          height: altura,
                          background: cor,
                          color: "#fff",
                          borderRadius: 6,
                          padding: ehMobile ? "4px 8px" : "2px 6px",
                          fontSize: ehMobile ? 12.5 : 11,
                          lineHeight: 1.25,
                          overflow: "hidden",
                          opacity: cancelada ? 0.5 : 0.95,
                          textDecoration: cancelada ? "line-through" : "none",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.inicio.slice(11, 16)} {c.paciente_nome || c.telefone || "Paciente"}
                        </div>
                        {profId === "todos" && c.profissional_nome && altura > 30 && (
                          <div style={{ opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.profissional_nome}
                          </div>
                        )}
                        {c.pagamento && altura > 44 && (
                          <div style={{ opacity: 0.8, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.pagamento === "convenio" ? (c.convenio_nome || "Convênio") : "Particular"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {totalFiltrado === 0 && (
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
          Nenhuma consulta{profSelecionado ? ` para ${profSelecionado.nome}` : ""} nos proximos 7 dias.
        </div>
      )}

      {/* legenda de status */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
        {[["agendada", "Agendada"], ["confirmada", "Confirmada"], ["realizada", "Realizada"], ["cancelada", "Cancelada"]].map(([k, label]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: statusCor(k) }} />
            {label}
          </span>
        ))}
      </div>

      {/* Card de detalhes da consulta (abre ao clicar num bloco) */}
      {aberta && (
        <div
          onClick={() => setAberta(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 420, padding: 0, overflow: "hidden" }}
          >
            {/* faixa colorida com o status */}
            <div style={{ background: statusCor(aberta.status), color: "#fff", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>
                {aberta.status}
              </div>
              <button
                onClick={() => setAberta(null)}
                aria-label="fechar"
                style={{ background: "transparent", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 18 }}>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
                {aberta.paciente_nome || aberta.telefone || "Paciente"}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 16 }}>
                {rotuloTopo(aberta.inicio.slice(0, 10), hoje, amanha).dia}, {rotuloTopo(aberta.inicio.slice(0, 10), hoje, amanha).num} · {aberta.inicio.slice(11, 16)}–{aberta.fim?.slice(11, 16) || ""}
              </div>

              <Linha rotulo="Profissional" valor={aberta.profissional_nome || "—"} />
              {aberta.telefone && <Linha rotulo="Telefone" valor={formatTel(aberta.telefone)} />}
              {rotuloPagamento(aberta) && <Linha rotulo="Pagamento" valor={rotuloPagamento(aberta)!} />}
              <Linha rotulo="Origem" valor={aberta.origem === "gcal" ? "Google Calendar" : aberta.origem === "feegow" ? "Feegow" : "Agenda da clínica"} />

              {aberta.observacao && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--muted)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconeLapis size={14} /> {aberta.observacao}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                {aberta.telefone && (
                  <a
                    // SEMPRE leva a clinica junto: sem isso, o admin operando uma
                    // clinica via ?clinica= caia na PRIMEIRA clinica da lista ao
                    // abrir a conversa ("abriu outra conta" — bug real, 12/08).
                    // Pra conta de clinica o parametro e redundante mas valido.
                    href={`/painel/conversas?telefone=${aberta.telefone.replace(/\D/g, "")}&clinica=${clinicaId}`}
                    className="btn-fantasma"
                    style={{ display: "inline-block", padding: "8px 14px", fontSize: 13, textDecoration: "none" }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconeConversas /> ver conversa</span>
                  </a>
                )}
                {aberta.guia_url && (
                  <a
                    href={aberta.guia_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-fantasma"
                    style={{ display: "inline-block", padding: "8px 14px", fontSize: 13, textDecoration: "none" }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconeClipe size={15} /> ver guia do exame</span>
                  </a>
                )}
              </div>

              {/* acoes da recepcao (so consulta do sistema; evento externo se edita la) */}
              {aberta.origem !== "gcal" && aberta.origem !== "feegow" && aberta.status !== "cancelada" ? (
                <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                  <button className="btn-fantasma" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => setAcao({ modo: "observacao", consulta: aberta })}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconeLapis size={14} /> Observação</span>
                  </button>
                  <button className="btn-fantasma" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => setAcao({ modo: "alterar", consulta: aberta })}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconeLapis size={14} /> Alterar</span>
                  </button>
                  <button className="btn-fantasma" style={{ padding: "8px 12px", fontSize: 13, color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => setAcao({ modo: "cancelar", consulta: aberta })}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconeX size={14} /> Cancelar</span>
                  </button>
                </div>
              ) : aberta.origem === "gcal" || aberta.origem === "feegow" ? (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 12.5, color: "var(--muted)" }}>
                  Esse compromisso foi criado direto no {aberta.origem === "feegow" ? "Feegow" : "Google Calendar do médico"} — pra alterar, edite lá.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* card flutuante de acao (alterar/cancelar/observacao) com motivo */}
      {acao && (
        <ModalAcao
          modo={acao.modo}
          consulta={acao.consulta}
          hoje={hoje}
          onFechar={() => setAcao(null)}
          onFeito={() => {
            setAcao(null);
            setAberta(null);
            router.refresh(); // atualiza a agenda sem recarregar a pagina inteira
          }}
        />
      )}

      {/* Modal de marcacao MANUAL (recepcao marca na mao) */}
      {novaAberta && (
        <ModalNovaConsulta
          clinicaId={clinicaId}
          profissionais={profissionais}
          profSelecionadoId={profId !== "todos" ? profId : (profissionais[0]?.id ?? "")}
          hoje={hoje}
          onFechar={() => setNovaAberta(false)}
          onMarcada={() => {
            setNovaAberta(false);
            router.refresh(); // atualiza a agenda sem recarregar a pagina inteira
          }}
        />
      )}
    </section>
  );
}

// ---- Modal de marcacao manual ----
function ModalNovaConsulta({
  clinicaId,
  profissionais,
  profSelecionadoId,
  hoje,
  onFechar,
  onMarcada,
}: {
  clinicaId: string;
  profissionais: Prof[];
  profSelecionadoId: string;
  hoje: string;
  onFechar: () => void;
  onMarcada: () => void;
}) {
  const [profissionalId, setProfissionalId] = useState(profSelecionadoId);
  const [data, setData] = useState(hoje);
  const [hora, setHora] = useState("09:00");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [pagamento, setPagamento] = useState<"" | "particular" | "convenio">("");
  const [convenioNome, setConvenioNome] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function marcar() {
    setErro("");
    if (!profissionalId) return setErro("Escolha um profissional.");
    if (!nome.trim()) return setErro("Coloque o nome do paciente.");
    if (!/^\d{2}:\d{2}$/.test(hora)) return setErro("Horário inválido.");
    setSalvando(true);
    try {
      const res = await fetch("/api/consultas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinica_id: clinicaId,
          profissional_id: profissionalId,
          inicio: `${data}T${hora}:00`,
          nome_paciente: nome.trim(),
          telefone: telefone.trim() || undefined,
          pagamento: pagamento || undefined,
          convenio_nome: pagamento === "convenio" ? convenioNome.trim() || undefined : undefined,
          observacao: obs.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não consegui marcar");
      onMarcada();
    } catch (e: any) {
      setErro(e?.message || "erro ao marcar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      onClick={onFechar}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 440, padding: 22, display: "grid", gap: 12, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><IconeMais size={17} /> Marcar consulta</h3>
          <button onClick={onFechar} aria-label="fechar" style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1, color: "var(--muted)" }}>×</button>
        </div>

        {erro && (
          <div style={{ padding: 10, background: "var(--danger-bg)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>{erro}</div>
        )}

        <label style={{ display: "block" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Profissional</div>
          <select className="input" value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)} style={{ marginTop: 0 }}>
            {profissionais.length === 0 && <option value="">Nenhum profissional cadastrado</option>}
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}{p.especialidade ? ` — ${p.especialidade}` : ""}</option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Data</div>
            <input className="input" type="date" value={data} min={hoje} onChange={(e) => setData(e.target.value)} style={{ marginTop: 0 }} />
          </label>
          <label style={{ width: 120 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Hora</div>
            <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ marginTop: 0 }} />
          </label>
        </div>

        <label style={{ display: "block" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nome do paciente</div>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Maria Silva" style={{ marginTop: 0 }} />
        </label>

        <label style={{ display: "block" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Telefone (WhatsApp) <span style={{ color: "var(--muted)", fontWeight: 400 }}>— opcional</span></div>
          <input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Ex: 35999998888" style={{ marginTop: 0 }} />
        </label>

        <label style={{ display: "block" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Pagamento</div>
          <select className="input" value={pagamento} onChange={(e) => setPagamento(e.target.value as any)} style={{ marginTop: 0 }}>
            <option value="">Não informar</option>
            <option value="particular">Particular</option>
            <option value="convenio">Convênio</option>
          </select>
        </label>

        {pagamento === "convenio" && (
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Qual convênio</div>
            <input className="input" value={convenioNome} onChange={(e) => setConvenioNome(e.target.value)} placeholder="Ex: Unimed" style={{ marginTop: 0 }} />
          </label>
        )}

        <label style={{ display: "block" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Observação <span style={{ color: "var(--muted)", fontWeight: 400 }}>— opcional</span></div>
          <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: primeira consulta" style={{ marginTop: 0 }} />
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button className="btn-fantasma" onClick={onFechar} disabled={salvando} style={{ padding: "9px 16px" }}>Cancelar</button>
          <button className="btn-primario" onClick={marcar} disabled={salvando} style={{ padding: "9px 16px" }}>
            {salvando ? "Marcando..." : "Marcar consulta"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Card flutuante de acao da recepcao (alterar / cancelar / observacao) ----
// Flutua no meio da tela com fundo leve (nao cobre tudo). Alterar e cancelar
// exigem MOTIVO (vira auditoria no log). Se o horario novo colidir com outra
// consulta, o servidor recusa e o aviso aparece aqui na hora.
function ModalAcao({
  modo,
  consulta,
  hoje,
  onFechar,
  onFeito,
}: {
  modo: "alterar" | "cancelar" | "observacao";
  consulta: Consulta;
  hoje: string;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const motivos = modo === "cancelar" ? MOTIVOS_CANCELAMENTO : MOTIVOS_ALTERACAO;
  const [motivo, setMotivo] = useState("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [data, setData] = useState(consulta.inicio.slice(0, 10));
  const [hora, setHora] = useState(consulta.inicio.slice(11, 16));
  const [obs, setObs] = useState(consulta.observacao || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const titulo =
    modo === "alterar" ? "Alterar consulta" : modo === "cancelar" ? "Cancelar consulta" : "Observação";

  async function confirmar() {
    setErro("");
    const motivoFinal = motivo === "Outro" ? motivoOutro.trim() : motivo;
    if (modo !== "observacao" && !motivoFinal) {
      setErro(modo === "alterar" ? "Selecione o motivo da alteração." : "Selecione o motivo do cancelamento.");
      return;
    }
    setSalvando(true);
    try {
      const body: any = { id: consulta.id };
      if (modo === "alterar") {
        body.acao = "remarcar";
        body.inicio = `${data}T${hora}:00`;
        body.motivo = motivoFinal;
      } else if (modo === "cancelar") {
        body.acao = "cancelar";
        body.motivo = motivoFinal;
      } else {
        body.acao = "observacao";
        body.observacao = obs.trim();
      }
      const res = await fetch("/api/consultas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) throw new Error(j?.erro || "não deu certo");
      onFeito();
    } catch (e: any) {
      setErro(e?.message || "erro");
      setSalvando(false);
    }
  }

  return (
    <div
      onClick={onFechar}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "grid", placeItems: "center", padding: 20, zIndex: 70 }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 400, padding: 20, display: "grid", gap: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{titulo}</h3>
          <button onClick={onFechar} aria-label="fechar" style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1, color: "var(--muted)" }}>×</button>
        </div>

        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {consulta.paciente_nome || consulta.telefone || "Paciente"} · {consulta.inicio.slice(8, 10)}/{consulta.inicio.slice(5, 7)} às {consulta.inicio.slice(11, 16)}
        </div>

        {erro && (
          <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconeAlerta size={14} /> {erro}</span>
          </div>
        )}

        {modo !== "observacao" && (
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              {modo === "alterar" ? "Motivo da alteração" : "Motivo do cancelamento"}
            </div>
            <select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ marginTop: 0 }}>
              <option value="">Selecione...</option>
              {motivos.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        )}

        {motivo === "Outro" && modo !== "observacao" && (
          <input className="input" value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value)} placeholder="Escreve o motivo" style={{ marginTop: 0 }} />
        )}

        {modo === "alterar" && (
          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nova data</div>
              <input className="input" type="date" value={data} min={hoje} onChange={(e) => setData(e.target.value)} style={{ marginTop: 0 }} />
            </label>
            <label style={{ width: 110 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Hora</div>
              <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ marginTop: 0 }} />
            </label>
          </div>
        )}

        {modo === "observacao" && (
          <textarea className="input" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: paciente pediu pra avisar 1h antes" style={{ marginTop: 0 }} />
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2 }}>
          <button className="btn-fantasma" onClick={onFechar} disabled={salvando} style={{ padding: "9px 14px" }}>Voltar</button>
          <button
            className="btn-primario"
            onClick={confirmar}
            disabled={salvando}
            style={{ padding: "9px 16px", ...(modo === "cancelar" ? { background: "var(--danger)" } : {}) }}
          >
            {salvando ? "Salvando..." : modo === "alterar" ? "Confirmar alteração" : modo === "cancelar" ? "Confirmar cancelamento" : "Salvar observação"}
          </button>
        </div>
      </div>
    </div>
  );
}

// linha rotulo/valor do card de detalhes
function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
      <span style={{ color: "var(--muted)", fontSize: 13 }}>{rotulo}</span>
      <span style={{ fontSize: 14, fontWeight: 500, textAlign: "right" }}>{valor}</span>
    </div>
  );
}

// telefone E.164 -> "+55 (35) 99999-8888" (best-effort)
function formatTel(tel: string): string {
  const d = tel.replace(/\D/g, "");
  if (d.length >= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length >= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return tel;
}
