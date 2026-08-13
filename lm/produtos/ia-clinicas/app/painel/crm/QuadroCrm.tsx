"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import Avatar from "../conversas/Avatar";
import { IconeBusca, IconeRelogio, IconeFunil } from "../Icones";

// Quadro Kanban do CRM. Arrastar o card entre colunas grava a etapa nova
// (otimista: o card pula na hora e o servidor confirma atras; se falhar, o
// card volta pra coluna de origem).

type Card = {
  telefone: string;
  nome: string | null;
  fotoUrl: string | null;
  etapa: string;
  tipo: string;
  notas: string;
  tags: string;
  atualizadoEm: string | null;
  ultimaMensagem: string;
  ultimaEm: string | null;
  proximaConsulta: string | null;
};

type Etapa = { id: string; rotulo: string };

const COR_ETAPA: Record<string, string> = {
  novo: "#64748b",
  atendimento: "#2563eb",
  agendado: "#ca8a04",
  cliente: "#16a34a",
  perdido: "#dc2626",
};

function formatarTelefone(t: string): string {
  const d = t.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return t;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// "há 3 dias" / "hoje" — mede há quanto tempo o card não anda (lead parado)
function haQuantoTempo(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(String(iso).includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return "";
  const dias = Math.floor((Date.now() - t) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

function dataCurta(iso: string): string {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : String(iso).slice(0, 16);
}

export default function QuadroCrm({
  cards: cardsIniciais,
  etapas,
  clinicaId,
  sufClinica,
}: {
  cards: Card[];
  etapas: Etapa[];
  clinicaId: string;
  sufClinica: string;
}) {
  const [cards, setCards] = useState(cardsIniciais);
  const [busca, setBusca] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const kanbanRef = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState("");

  const visiveis = useMemo(() => {
    const q = busca.trim();
    if (!q) return cards;
    const qNome = norm(q);
    const qTel = q.replace(/\D/g, "");
    return cards.filter((c) => {
      const bateNome = c.nome ? norm(c.nome).includes(qNome) : false;
      const bateTel = qTel.length > 0 && c.telefone.includes(qTel);
      const bateTag = c.tags ? norm(c.tags).includes(qNome) : false;
      return bateNome || bateTel || bateTag;
    });
  }, [busca, cards]);

  const porEtapa = useMemo(() => {
    const mapa: Record<string, Card[]> = {};
    for (const e of etapas) mapa[e.id] = [];
    for (const c of visiveis) (mapa[c.etapa] ||= []).push(c);
    return mapa;
  }, [visiveis, etapas]);

  async function mover(telefone: string, destino: string) {
    const card = cards.find((c) => c.telefone === telefone);
    if (!card || card.etapa === destino) return;
    const origem = card.etapa;
    // otimista: pula de coluna na hora
    setCards((cs) =>
      cs.map((c) =>
        c.telefone === telefone
          ? { ...c, etapa: destino, atualizadoEm: new Date().toISOString(), tipo: destino === "cliente" ? "cliente" : c.tipo }
          : c
      )
    );
    setErro("");
    try {
      const res = await fetch("/api/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, telefone, crm: { etapa: destino } }),
      });
      if (!res.ok) throw new Error("não consegui salvar a mudança");
    } catch (e: any) {
      // desfaz: card volta pra coluna de origem (a tela nunca mente)
      setCards((cs) => cs.map((c) => (c.telefone === telefone ? { ...c, etapa: origem } : c)));
      setErro(e?.message || "erro ao mover o card");
    }
  }

  return (
    <div>
      {/* busca por nome, telefone ou etiqueta */}
      <div style={{ position: "relative", marginBottom: 16, maxWidth: 420 }}>
        <span
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted)",
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          <IconeBusca size={16} />
        </span>
        <input
          className="input"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar paciente por nome, telefone ou etiqueta..."
          style={{ marginTop: 0, paddingLeft: 36 }}
        />
      </div>

      {erro && (
        <div
          style={{
            marginBottom: 12,
            padding: "9px 13px",
            borderRadius: 8,
            background: "var(--danger-bg)",
            color: "var(--danger)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {erro}
        </div>
      )}

      {cards.length === 0 ? (
        <div
          style={{
            padding: 40,
            border: "1px dashed var(--border-forte)",
            borderRadius: 12,
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          Nenhum paciente no quadro ainda. Assim que alguém conversar no WhatsApp, o card aparece aqui.
        </div>
      ) : (
        <div
          className="kanban"
          ref={kanbanRef}
          onMouseDown={(ev) => {
            // ARRASTAR PRA NAVEGAR: segurando o botao em area vazia (fundo do
            // quadro ou da coluna), o mouse vira "mao" e arrasta o funil na
            // horizontal — sem precisar descer ate a barra de rolagem.
            // Clique em card/link/botao/input fica de fora (drag&drop de card
            // e cliques continuam funcionando normal).
            const el = ev.target as HTMLElement;
            if (el.closest(".kanban-card, a, button, input, select, textarea")) return;
            const cont = kanbanRef.current;
            if (!cont) return;
            ev.preventDefault(); // evita selecao de texto durante o pan
            const x0 = ev.clientX;
            const scroll0 = cont.scrollLeft;
            cont.classList.add("pan-ativo");
            const move = (e: MouseEvent) => {
              cont.scrollLeft = scroll0 - (e.clientX - x0);
            };
            const solta = () => {
              cont.classList.remove("pan-ativo");
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", solta);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", solta);
          }}
        >
          {etapas.map((e) => {
            const lista = porEtapa[e.id] || [];
            const cor = COR_ETAPA[e.id] || "var(--muted)";
            return (
              <div
                key={e.id}
                className={colunaAlvo === e.id ? "kanban-coluna alvo" : "kanban-coluna"}
                onDragOver={(ev) => {
                  ev.preventDefault(); // sem isso o navegador recusa o drop
                  setColunaAlvo(e.id);
                }}
                onDragLeave={() => setColunaAlvo((c) => (c === e.id ? null : c))}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const tel = ev.dataTransfer.getData("text/plain") || arrastando;
                  setColunaAlvo(null);
                  setArrastando(null);
                  if (tel) mover(tel, e.id);
                }}
              >
                <div className="kanban-topo">
                  <span
                    style={{ width: 8, height: 8, borderRadius: "50%", background: cor, flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, color: cor }}>{e.rotulo}</span>
                  <span
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 20,
                      padding: "1px 8px",
                      fontSize: 11,
                    }}
                  >
                    {lista.length}
                  </span>
                </div>

                {lista.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      textAlign: "center",
                      padding: "16px 8px",
                      border: "1px dashed var(--border)",
                      borderRadius: 8,
                    }}
                  >
                    vazio
                  </div>
                ) : (
                  lista.map((c) => (
                    <Link
                      key={c.telefone}
                      href={`/painel/conversas?telefone=${c.telefone}${sufClinica}`}
                      className={arrastando === c.telefone ? "kanban-card arrastando" : "kanban-card"}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData("text/plain", c.telefone);
                        ev.dataTransfer.effectAllowed = "move";
                        setArrastando(c.telefone);
                      }}
                      onDragEnd={() => {
                        setArrastando(null);
                        setColunaAlvo(null);
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                        <Avatar
                          nome={c.nome}
                          telefone={c.telefone}
                          fotoUrl={c.fotoUrl}
                          tamanho={32}
                          mostrarSelo={false}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 13.5,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {c.nome || formatarTelefone(c.telefone)}
                          </div>
                          <div style={{ color: "var(--muted)", fontSize: 11.5 }}>
                            {formatarTelefone(c.telefone)}
                          </div>
                        </div>
                      </div>

                      {c.ultimaMensagem && (
                        <div
                          style={{
                            color: "var(--muted)",
                            fontSize: 12,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginBottom: 7,
                          }}
                        >
                          {c.ultimaMensagem}
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            borderRadius: 20,
                            padding: "2px 8px",
                            color: c.tipo === "cliente" ? "var(--ok)" : "var(--muted)",
                            background: c.tipo === "cliente" ? "var(--ok-bg)" : "var(--bg)",
                            border: "1px solid " + (c.tipo === "cliente" ? "transparent" : "var(--border)"),
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <IconeFunil size={11} />
                          {c.tipo === "cliente" ? "cliente" : "lead"}
                        </span>
                        {c.proximaConsulta && (
                          <span
                            title="próxima consulta marcada"
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              borderRadius: 20,
                              padding: "2px 8px",
                              color: "#ca8a04",
                              background: "rgba(202,138,4,0.12)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <IconeRelogio size={11} />
                            {dataCurta(c.proximaConsulta)}
                          </span>
                        )}
                        <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 10.5 }}>
                          {haQuantoTempo(c.ultimaEm || c.atualizadoEm)}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
