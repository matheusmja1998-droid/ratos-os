"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { IconeBusca, IconeEstrela, IconeRobo, IconeAtendente } from "../Icones";

// Caixa de entrada: busca por nome/telefone + abas Todas / Nao lidas /
// Importantes. Tudo filtra no CLIENTE (a lista ja veio inteira do servidor),
// entao trocar de aba e instantaneo, sem ida ao banco.

type Conversa = {
  telefone: string;
  nome: string | null;
  fotoUrl?: string | null;
  ultimaMensagem: string;
  ultimoRole: string;
  quando: string;
  total: number;
  naoLida?: boolean;
  importante?: boolean;
  /** true = atendente humano assumiu a conversa; false = IA atendendo */
  humano?: boolean;
};

type Aba = "todas" | "nao_lidas" | "importantes";

function formatarTelefone(t: string): string {
  const d = t.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return t;
}

function quandoCurto(iso: string): string {
  if (!iso) return "";
  const s = String(iso);
  // timestamptz do Postgres chega em UTC (sufixo Z ou +00:00) — converte pro
  // fuso do Brasil senao o painel mostra 3h adiantado (e o DIA errado perto da
  // meia-noite; bug real reportado 11/08). sqlite dev grava hora local sem
  // fuso, ai mostra como esta.
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .format(d)
        .replace(",", "");
    }
  }
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return s.slice(0, 16);
  return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
}

// normaliza pra busca sem acento e sem caixa
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export default function ListaConversas({
  conversas,
  sufClinica,
  comDuvida = [],
  clinicaId,
}: {
  conversas: Conversa[];
  sufClinica: string;
  comDuvida?: string[]; // telefones com duvida pendente (badge "precisa de voce")
  clinicaId: string;
}) {
  const router = useRouter();
  const duvidaSet = new Set(comDuvida);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("todas");
  // estrelas alteradas nesta sessao (otimista: pinta na hora, salva atras)
  const [estrelas, setEstrelas] = useState<Record<string, boolean>>({});
  // IA ligada/desligada alterada nesta sessao (mesmo padrao otimista)
  const [iaLocal, setIaLocal] = useState<Record<string, boolean>>({});
  const [salvandoIa, setSalvandoIa] = useState<Record<string, boolean>>({});

  // true = atendente assumiu (IA pausada nessa conversa)
  const ehHumano = (c: Conversa) => iaLocal[c.telefone] ?? Boolean(c.humano);

  const ehImportante = (c: Conversa) =>
    estrelas[c.telefone] ?? Boolean(c.importante);

  const contagens = useMemo(
    () => ({
      todas: conversas.length,
      nao_lidas: conversas.filter((c) => c.naoLida).length,
      importantes: conversas.filter((c) => ehImportante(c)).length,
    }),
    [conversas, estrelas]
  );

  const visiveis = useMemo(() => {
    let lista = conversas;
    if (aba === "nao_lidas") lista = lista.filter((c) => c.naoLida);
    if (aba === "importantes") lista = lista.filter((c) => ehImportante(c));

    const q = busca.trim();
    if (!q) return lista;
    const qNome = norm(q);
    const qTel = q.replace(/\D/g, "");
    return lista.filter((c) => {
      const bateNome = c.nome ? norm(c.nome).includes(qNome) : false;
      const bateTel = qTel.length > 0 && c.telefone.includes(qTel);
      return bateNome || bateTel;
    });
  }, [busca, conversas, aba, estrelas]);

  // marca/desmarca a estrela. Otimista: a UI muda na hora e o servidor recebe
  // atras; se falhar, desfaz (a lista nunca fica mentindo).
  async function alternarEstrela(telefone: string, novo: boolean) {
    setEstrelas((e) => ({ ...e, [telefone]: novo }));
    try {
      const res = await fetch("/api/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, telefone, importante: novo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEstrelas((e) => ({ ...e, [telefone]: !novo }));
    }
  }

  // LIGA/DESLIGA a IA direto no card, sem abrir a conversa.
  // `pausar: true` = atendente assume (IA calada); `false` = devolve pra IA.
  // Existe porque a IA fica pausada pra sempre depois que alguem responde pelo
  // celular — e religar uma a uma, abrindo cada conversa, ninguem fazia.
  async function alternarIa(telefone: string, novoHumano: boolean) {
    setIaLocal((e) => ({ ...e, [telefone]: novoHumano }));
    setSalvandoIa((s) => ({ ...s, [telefone]: true }));
    try {
      const res = await fetch("/api/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, telefone, pausar: novoHumano }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error();
      const confirmado = j && typeof j.pausada === "boolean" ? j.pausada : novoHumano;
      setIaLocal((e) => ({ ...e, [telefone]: confirmado }));
      // Puxa o estado novo do servidor e SOLTA o override local: a partir dai o
      // card volta a refletir o banco. Se nao soltar, o refresh de 7s nunca
      // conseguiria mostrar mudanca feita por outra pessoa nessa conversa.
      router.refresh();
      setTimeout(() => {
        setIaLocal((e) => {
          const { [telefone]: _, ...resto } = e;
          return resto;
        });
      }, 1500);
    } catch {
      setIaLocal((e) => ({ ...e, [telefone]: !novoHumano })); // desfaz
    } finally {
      setSalvandoIa((s) => ({ ...s, [telefone]: false }));
    }
  }

  const ABAS: { id: Aba; rotulo: string }[] = [
    { id: "todas", rotulo: "Todas" },
    { id: "nao_lidas", rotulo: "Não lidas" },
    { id: "importantes", rotulo: "Importantes" },
  ];

  return (
    <div>
      {/* busca por nome ou telefone */}
      <div style={{ position: "relative", marginBottom: 12 }}>
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
          placeholder="Buscar por nome ou telefone..."
          style={{ marginTop: 0, paddingLeft: 36 }}
        />
      </div>

      {/* abas da caixa de entrada */}
      <div
        role="tablist"
        style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border)" }}
      >
        {ABAS.map((a) => {
          const ativa = aba === a.id;
          const n = contagens[a.id];
          return (
            <button
              key={a.id}
              role="tab"
              aria-selected={ativa}
              onClick={() => setAba(a.id)}
              style={{
                background: "none",
                border: "none",
                borderBottom: "2px solid " + (ativa ? "var(--accent)" : "transparent"),
                color: ativa ? "var(--accent)" : "var(--muted)",
                fontWeight: ativa ? 700 : 500,
                fontSize: 13.5,
                padding: "9px 14px",
                cursor: "pointer",
                marginBottom: -1,
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontFamily: "inherit",
              }}
            >
              {a.rotulo}
              {n > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 20,
                    padding: "1px 7px",
                    background: ativa ? "var(--accent-soft)" : "var(--bg)",
                    color: ativa ? "var(--accent)" : "var(--muted)",
                    border: "1px solid " + (ativa ? "transparent" : "var(--border)"),
                  }}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {visiveis.length === 0 ? (
        <div
          style={{
            padding: 36,
            border: "1px dashed var(--border-forte)",
            borderRadius: 12,
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          {busca
            ? `Nenhuma conversa com "${busca}".`
            : aba === "nao_lidas"
            ? "Nenhuma mensagem não lida. Tudo em dia."
            : aba === "importantes"
            ? "Nenhuma conversa marcada como importante ainda."
            : "Ainda nenhuma conversa registrada."}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {visiveis.map((c, i) => {
            const importante = ehImportante(c);
            const humano = ehHumano(c);
            return (
              <div
                key={c.telefone}
                style={{
                  display: "flex",
                  alignItems: "center",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  // barra colorida a esquerda + fundo leve marcam a nao lida
                  borderLeft: "3px solid " + (c.naoLida ? "var(--accent)" : "transparent"),
                  background: c.naoLida ? "var(--accent-soft)" : "transparent",
                }}
              >
                <Link
                  href={`/painel/conversas?telefone=${c.telefone}${sufClinica}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 8px 13px 15px",
                    textDecoration: "none",
                    color: "var(--text)",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Avatar nome={c.nome} telefone={c.telefone} fotoUrl={c.fotoUrl} tamanho={44} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: c.naoLida ? 700 : 600,
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* QUEM ESTA ATENDENDO (leitura, a esquerda junto do
                          nome): a recepcao bate o olho na coluna e ja sabe se a
                          conversa esta com a IA ou com uma pessoa. Quem LIGA e
                          DESLIGA e o switch la na direita, perto da estrela. */}
                      <span
                        title={
                          humano
                            ? "Um atendente assumiu essa conversa — a IA está pausada aqui"
                            : "A IA está atendendo essa conversa automaticamente"
                        }
                        style={{
                          background: humano ? "rgba(202,138,4,0.14)" : "rgba(37,99,235,0.12)",
                          color: humano ? "#a16207" : "var(--accent)",
                          border: `1px solid ${humano ? "rgba(202,138,4,0.35)" : "rgba(37,99,235,0.3)"}`,
                          borderRadius: 20,
                          fontSize: 10.5,
                          fontWeight: 800,
                          padding: "2px 8px",
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <span style={{ display: "grid", placeItems: "center" }}>
                          {humano ? <IconeAtendente size={12} /> : <IconeRobo size={12} />}
                        </span>
                        {humano ? "atendente" : "IA"}
                      </span>
                      {duvidaSet.has(c.telefone) && (
                        <span
                          title="A IA está esperando a equipe responder uma pergunta nessa conversa"
                          style={{
                            background: "var(--danger)",
                            color: "#fff",
                            borderRadius: 20,
                            fontSize: 10.5,
                            fontWeight: 800,
                            padding: "2px 8px",
                            flexShrink: 0,
                          }}
                        >
                          precisa de você
                        </span>
                      )}
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "100%",
                        }}
                      >
                        {c.nome || formatarTelefone(c.telefone)}
                      </span>
                      {c.nome && (
                        <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>
                          {formatarTelefone(c.telefone)}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        color: c.naoLida ? "var(--text)" : "var(--muted)",
                        fontSize: 13,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.ultimoRole === "assistant" ? "IA: " : ""}
                      {c.ultimaMensagem}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>{quandoCurto(c.quando)}</div>
                    <div style={{ marginTop: 3, display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      {c.naoLida ? (
                        <span
                          title="mensagem não lida"
                          style={{
                            background: "var(--accent)",
                            color: "var(--accent-contrast)",
                            borderRadius: 20,
                            fontSize: 10.5,
                            fontWeight: 800,
                            padding: "1px 7px",
                          }}
                        >
                          nova
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: 11 }}>
                          {c.total} msg{c.total === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
                {/* INTERRUPTOR DA IA — fora do Link: clicar liga/desliga sem
                    abrir a conversa. Azul "IA" = ela atende; ambar "atendente" =
                    alguem assumiu e a IA esta calada AQUI ate devolverem. */}
                <button
                  onClick={() => alternarIa(c.telefone, !humano)}
                  disabled={Boolean(salvandoIa[c.telefone])}
                  className="switch"
                  data-ligado={humano ? "false" : "true"}
                  aria-pressed={!humano}
                  aria-label={humano ? "Devolver essa conversa pra IA" : "Assumir essa conversa (pausa a IA)"}
                  title={
                    humano
                      ? "Um atendente assumiu — a IA está pausada aqui. Clique pra devolver pra IA."
                      : "A IA está atendendo essa conversa. Clique pra assumir (a IA para aqui)."
                  }
                  style={{ ["--alt" as any]: "20px", padding: "10px 4px 10px 10px", flexShrink: 0, gap: 7 }}
                >
                  {/* trilho menor que o da conversa (cabe na linha da lista).
                      A bolinha desliza pelo CSS via data-ligado; o translate
                      vai inline so porque o trilho aqui e mais estreito. */}
                  <span className="switch-trilho" style={{ width: 36 }}>
                    <span
                      className="switch-bolinha"
                      style={{ width: 14, height: 14, transform: humano ? "none" : "translateX(16px)" }}
                    />
                  </span>
                </button>
                {/* estrela FORA do Link: clicar marca importante sem abrir a conversa */}
                <button
                  onClick={() => alternarEstrela(c.telefone, !importante)}
                  title={importante ? "Desmarcar importante" : "Marcar como importante"}
                  aria-label={importante ? "Desmarcar importante" : "Marcar como importante"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "10px 14px 10px 8px",
                    color: importante ? "#eab308" : "var(--muted)",
                    opacity: importante ? 1 : 0.45,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <IconeEstrela size={17} cheia={importante} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
