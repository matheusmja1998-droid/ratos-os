// Historico de atendimento da IA por paciente.
// - Sem ?telefone=: lista os pacientes que conversaram (mais recentes primeiro).
// - Com ?telefone=: mostra a conversa inteira em bolhas (paciente x IA), estilo WhatsApp.
// Server Component: busca tudo antes de renderizar. Isolamento via clinicaPermitida.

import Link from "next/link";
import {
  listClinicas,
  getClinica,
  listarConversas,
  conversaCompleta,
  iaPausadaPaciente,
  getPacientePorTelefone,
  consultasDoPacientePorTelefone,
  metricasConversas,
  listInstancias,
  listDuvidasPendentes,
  instanciaDaClinica,
  telefonesSemContato,
  salvarContatoWhats,
  marcarConversaLida,
} from "@/lib/db";
import { buscarContato } from "@/lib/uazapi";
import { resumoDaConversa } from "@/lib/resumo";
import { agoraSP, hojeSP } from "@/lib/agenda";
import { sessaoAtual, clinicaPermitida } from "@/lib/sessao";
import BotaoAssumir from "./BotaoAssumir";
import CaixaEnvio from "./CaixaEnvio";
import ListaConversasClient from "./ListaConversas";
import Avatar from "./Avatar";
import EtapaCrm from "./EtapaCrm";
import { IconeSetaEsquerda, IconeConversas } from "../Icones";
import AtualizarAoVivo from "./AtualizarAoVivo";
import AvisoDesconectado from "./AvisoDesconectado";
import PainelDuvidas from "./PainelDuvidas";
import ObservacoesSecretaria from "./ObservacoesSecretaria";

export const dynamic = "force-dynamic";

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <main className="pagina">
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

// telefone E.164 sem "+" -> "+55 (35) 99999-8888" quando reconhece o padrao BR;
// senao devolve como veio (nao inventa formato).
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

// timestamp do banco -> "08/07 14:30" no fuso do Brasil.
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

// soma dias a "YYYY-MM-DD" (UTC puro, sem fuso do servidor)
function somaDias(dataISO: string, dias: number): string {
  const [y, mo, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d) + dias * 86400000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function Conversas({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string; telefone?: string; de?: string; ate?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return <Aviso>Sessao invalida. Faca login de novo.</Aviso>;

  const sp = await searchParams;
  const ehAdmin = sessao.papel === "admin";

  // ISOLAMENTO: clinica so ve as conversas dela; admin escolhe via ?clinica=.
  let pedida = sp.clinica ?? null;
  if (ehAdmin && !pedida) {
    const todas = await listClinicas();
    pedida = todas[0]?.id ?? null;
    if (!pedida) return <Aviso>Nenhuma clinica cadastrada ainda.</Aviso>;
  }
  const clinicaId = await clinicaPermitida(pedida);
  if (!clinicaId) return <Aviso>Acesso negado a essa clinica.</Aviso>;

  const clinica = await getClinica(clinicaId);
  if (!clinica) return <Aviso>Clinica nao encontrada.</Aviso>;

  // WhatsApp conectado? Sem ele, o que o atendente mandar pela tela NAO chega —
  // mostra o popup fechavel avisando (pedido da clinica 05/08).
  const instsCon = await listInstancias(clinicaId);
  const whatsConectado = instsCon.some(
    (i: any) => i.status === "conectado" || i.status === "connected" || i.status === "open"
  );

  // preserva ?clinica= nos links so quando o admin esta inspecionando
  const sufClinica = ehAdmin && sp.clinica ? `&clinica=${clinicaId}` : "";

  const telefone = sp.telefone?.replace(/\D/g, "") || null;

  return (
    <main className="pagina">
      {!whatsConectado && (
        <AvisoDesconectado clinicaId={clinicaId} usaParam={Boolean(ehAdmin && sp.clinica)} />
      )}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24, margin: 0, flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "grid", placeItems: "center", color: "var(--accent)" }}>
              <IconeConversas />
            </span>
            Conversas — {clinica.nome}
            {ehAdmin && (
              <span style={{ color: "var(--muted)", fontSize: 14, fontWeight: 400, marginLeft: 10 }}>
                (visao admin)
              </span>
            )}
          </h1>
          <AtualizarAoVivo />
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6, marginBottom: 0 }}>
          Todo atendimento que a IA fez no WhatsApp, por paciente. Atualiza sozinho a cada 7s.
        </p>
      </div>

      {telefone ? (
        <ConversaDetalhe
          clinicaId={clinicaId}
          telefone={telefone}
          voltarHref={`/painel/conversas?x=1${sufClinica}`}
          sufClinica={sufClinica}
        />
      ) : (
        <>
          <MetricasConversas clinicaId={clinicaId} sp={sp} sufClinica={sufClinica} />
          <ListaConversas clinicaId={clinicaId} sufClinica={sufClinica} />
        </>
      )}
    </main>
  );
}

// ---------- Metricas das conversas (com filtro de datas) ----------

async function MetricasConversas({
  clinicaId,
  sp,
  sufClinica,
}: {
  clinicaId: string;
  sp: { clinica?: string; de?: string; ate?: string };
  sufClinica: string;
}) {
  const hoje = hojeSP();
  // default: ultimos 7 dias (inclusivo)
  const de = DATA_RE.test(sp.de || "") ? (sp.de as string) : somaDias(hoje, -6);
  const ate = DATA_RE.test(sp.ate || "") ? (sp.ate as string) : hoje;

  const m = await metricasConversas(clinicaId, de, ate);

  const cards = [
    { rotulo: "Conversas iniciadas", valor: m.iniciadas, cor: "var(--accent)" },
    { rotulo: "Agendamentos marcados", valor: m.marcadas, cor: "#ca8a04" },
    { rotulo: "Confirmados", valor: m.confirmadas, cor: "#16a34a" },
    { rotulo: "Cancelados", valor: m.canceladas, cor: "#dc2626" },
  ];

  const presets = [
    { rotulo: "hoje", de: hoje, ate: hoje },
    { rotulo: "7 dias", de: somaDias(hoje, -6), ate: hoje },
    { rotulo: "30 dias", de: somaDias(hoje, -29), ate: hoje },
  ];

  return (
    <div style={{ marginBottom: 22 }}>
      {/* filtro de datas */}
      <form
        method="GET"
        action="/painel/conversas"
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}
      >
        {sp.clinica && <input type="hidden" name="clinica" value={clinicaId} />}
        <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Período:</span>
        <input className="input" type="date" name="de" defaultValue={de} max={hoje} style={{ marginTop: 0, width: "auto", padding: "7px 10px", fontSize: 13 }} />
        <span style={{ color: "var(--muted)", fontSize: 13 }}>até</span>
        <input className="input" type="date" name="ate" defaultValue={ate} max={hoje} style={{ marginTop: 0, width: "auto", padding: "7px 10px", fontSize: 13 }} />
        <button type="submit" className="btn-fantasma" style={{ padding: "7px 14px", fontSize: 13 }}>
          filtrar
        </button>
        <span style={{ display: "flex", gap: 6, marginLeft: 4 }}>
          {presets.map((p) => (
            <Link
              key={p.rotulo}
              href={`/painel/conversas?de=${p.de}&ate=${p.ate}${sufClinica}`}
              style={{
                fontSize: 12,
                padding: "5px 11px",
                borderRadius: 20,
                textDecoration: "none",
                border: "1px solid " + (de === p.de && ate === p.ate ? "var(--accent)" : "var(--border)"),
                background: de === p.de && ate === p.ate ? "var(--accent-soft)" : "var(--surface)",
                color: de === p.de && ate === p.ate ? "var(--accent)" : "var(--muted)",
                fontWeight: de === p.de && ate === p.ate ? 700 : 400,
              }}
            >
              {p.rotulo}
            </Link>
          ))}
        </span>
      </form>

      {/* cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {cards.map((c) => (
          <div key={c.rotulo} className="card" style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: c.cor, lineHeight: 1 }}>{c.valor}</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 6 }}>{c.rotulo}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Lista de pacientes (busca client-side por nome/telefone) ----------

async function ListaConversas({
  clinicaId,
  sufClinica,
}: {
  clinicaId: string;
  sufClinica: string;
}) {
  // VELOCIDADE: a busca de foto/nome na uazapi roda em SEGUNDO PLANO, sem
  // segurar a tela. Ela chama a rede (ate 12 contatos) e isso atrasava a lista
  // inteira. Sem await, as conversas aparecem na hora e as fotos entram no
  // proximo carregamento (o auto-refresh de 7s ja traz). Erro aqui morre no
  // catch e nunca vira 500.
  void sincronizarContatos(clinicaId).catch(() => {});

  const conversas = await listarConversas(clinicaId);
  // telefones com duvida PENDENTE (a IA esta esperando a equipe responder):
  // ganham o pontinho vermelho na lista
  let comDuvida: string[] = [];
  try {
    const pend = await listDuvidasPendentes(clinicaId);
    comDuvida = Array.from(new Set(pend.map((d: any) => String(d.telefone))));
  } catch {
    /* tabela ainda nao migrada */
  }
  return (
    <ListaConversasClient
      conversas={conversas}
      sufClinica={sufClinica}
      comDuvida={comDuvida}
      clinicaId={clinicaId}
    />
  );
}

// Puxa nome e foto de perfil do WhatsApp pros contatos que ainda nao temos.
// Trabalha em LOTE PEQUENO (o db limita a 12 por carga) e so pra quem tem
// cache vencido, entao abrir a tela nao vira uma rajada de chamadas. Tudo
// best-effort: WhatsApp desconectado ou uazapi fora do ar = a lista aparece
// normalmente com as iniciais no lugar da foto.
async function sincronizarContatos(clinicaId: string): Promise<void> {
  try {
    const inst = await instanciaDaClinica(clinicaId);
    if (!inst?.uazapi_token) return;
    const conectada =
      inst.status === "conectado" || inst.status === "connected" || inst.status === "open";
    if (!conectada) return; // desconectado: a uazapi recusaria toda chamada

    const pendentes = await telefonesSemContato(clinicaId);
    if (pendentes.length === 0) return;

    await Promise.all(
      pendentes.map(async (tel) => {
        const dados = await buscarContato(inst.uazapi_token, tel);
        // grava mesmo vazio: o carimbo evita tentar de novo a cada refresh
        await salvarContatoWhats(clinicaId, tel, dados);
      })
    );
  } catch {
    /* nunca derruba a lista por causa de foto de perfil */
  }
}

// ---------- Detalhe da conversa (bolhas) ----------

async function ConversaDetalhe({
  clinicaId,
  telefone,
  voltarHref,
  sufClinica,
}: {
  clinicaId: string;
  telefone: string;
  voltarHref: string;
  sufClinica: string;
}) {
  const [msgs, pausada, paciente, consultas] = await Promise.all([
    conversaCompleta(clinicaId, telefone),
    iaPausadaPaciente(clinicaId, telefone),
    getPacientePorTelefone(clinicaId, telefone),
    consultasDoPacientePorTelefone(clinicaId, telefone, 5),
  ]);
  // abriu a conversa = leu. Some da aba "Nao lidas" no proximo carregamento.
  await marcarConversaLida(clinicaId, telefone);
  // resumo da conversa (cache: so gera de novo se a conversa andou)
  const ultimaMsgEm = msgs.length > 0 ? msgs[msgs.length - 1].quando : undefined;
  const resumo = await resumoDaConversa(clinicaId, telefone, ultimaMsgEm);

  const agora = agoraSP();
  const proxima = consultas.filter((c: any) => c.inicio >= agora && c.status !== "cancelada").pop();
  const passadas = consultas.filter((c: any) => c !== proxima).slice(0, 3);

  return (
    <div>
      {/* cabecalho da conversa: quem e, de onde veio (WhatsApp) e os controles */}
      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
          padding: "12px 16px",
        }}
      >
        <Link
          href={voltarHref}
          className="btn-fantasma"
          style={{ padding: "6px 10px", fontSize: 13, fontWeight: 600, display: "grid", placeItems: "center" }}
          title="voltar pra lista"
          aria-label="voltar pra lista"
        >
          <IconeSetaEsquerda size={16} />
        </Link>
        <Avatar
          nome={paciente?.nome || paciente?.wa_nome || null}
          telefone={telefone}
          fotoUrl={paciente?.wa_foto_url}
          tamanho={40}
        />
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {paciente?.nome || paciente?.wa_nome || formatarTelefone(telefone)}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12.5 }}>{formatarTelefone(telefone)}</div>
        </div>
        {/* etapa do paciente no funil, editavel aqui mesmo */}
        <EtapaCrm
          clinicaId={clinicaId}
          telefone={telefone}
          etapaInicial={paciente?.crm_etapa || "novo"}
          sufClinica={sufClinica}
        />
        {/* assumir/devolver a conversa direto pela tela */}
        <BotaoAssumir clinicaId={clinicaId} telefone={telefone} pausadaInicial={pausada} />
      </div>

      {/* DUVIDAS pendentes: a IA nao soube e a secretaria responde por aqui */}
      <PainelDuvidas clinicaId={clinicaId} telefone={telefone} />

      {/* RESUMO pra secretaria bater o olho (sem precisar ler a conversa toda) */}
      <ResumoCard paciente={paciente} resumo={resumo} proxima={proxima} passadas={passadas} />
      <div style={{ marginTop: -6, marginBottom: 16 }}>
        <div className="card" style={{ paddingTop: 12, paddingBottom: 12 }}>
          <ObservacoesSecretaria clinicaId={clinicaId} telefone={telefone} inicial={paciente?.observacoes || ""} />
        </div>
      </div>

      {msgs.length === 0 ? (
        <Aviso>Nenhuma mensagem nessa conversa.</Aviso>
      ) : (
        // JANELA DE CONVERSA no formato WhatsApp: o PACIENTE fala do lado
        // esquerdo em bolha cinza; a CLINICA (IA ou atendente) do lado direito
        // em bolha verde — a mesma leitura que a recepcao ja tem no celular.
        <div className="chat-janela">
          {msgs.map((m, i) => {
            // role 'assistant' = quem responde pela clinica (IA ou atendente)
            const daClinica = m.role === "assistant";
            // origem 'humano' = atendente digitou pelo painel; vazio = IA
            // (todas as mensagens antigas contam como IA, que era o unico
            // caminho antes da migration 024).
            const doAtendente = daClinica && (m as any).origem === "humano";
            return (
              <div key={i} className={daClinica ? "chat-linha direita" : "chat-linha esquerda"}>
                <div className={daClinica ? "chat-bolha clinica" : "chat-bolha paciente"}>
                  {daClinica && (
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                        marginBottom: 3,
                        opacity: 0.75,
                        color: doAtendente ? "#a16207" : "var(--accent)",
                      }}
                    >
                      {doAtendente ? "atendente" : "IA"}
                    </div>
                  )}
                  {/* "|||" separa mensagens enviadas: no painel vira quebra
                      de linha (o paciente recebeu como mensagens diferentes) */}
                  <div className="chat-texto">{String(m.conteudo).split("|||").join("\n")}</div>
                  <div className="chat-hora">{quandoCurto(m.quando)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* atendente responde direto pela tela (sai pelo WhatsApp da clinica) */}
      <CaixaEnvio clinicaId={clinicaId} telefone={telefone} />
    </div>
  );
}

// ---------- Card de resumo (a secretaria bate o olho e ja sabe) ----------

function rotuloConsulta(c: any): string {
  const d = `${c.inicio.slice(8, 10)}/${c.inicio.slice(5, 7)} às ${c.inicio.slice(11, 16)}`;
  return `${d}${c.profissional_nome ? ` · ${c.profissional_nome}` : ""}`;
}

function pagamentoLabel(c: any): string | null {
  if (c.pagamento === "convenio") return c.convenio_nome ? `Convênio · ${c.convenio_nome}` : "Convênio";
  if (c.pagamento === "particular") return "Particular";
  return null;
}

const COR_STATUS: Record<string, string> = {
  agendada: "#ca8a04",
  confirmada: "#16a34a",
  cancelada: "#dc2626",
  realizada: "#2563eb",
};

function ResumoCard({
  paciente,
  resumo,
  proxima,
  passadas,
}: {
  paciente: any;
  resumo: string | null;
  proxima: any;
  passadas: any[];
}) {
  const pgto = proxima ? pagamentoLabel(proxima) : passadas.map(pagamentoLabel).find(Boolean) || null;
  if (!resumo && !proxima && passadas.length === 0 && !pgto) return null;

  return (
    <div className="card" style={{ marginBottom: 14, borderLeft: "4px solid var(--accent)" }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* resumo da IA */}
        <div style={{ flex: "2 1 280px", minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            Resumo do atendimento
          </div>
          {resumo ? (
            <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{resumo}</div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Ainda pouca conversa pra resumir.</div>
          )}
        </div>

        {/* dados rapidos */}
        <div style={{ flex: "1 1 220px", minWidth: 0, display: "grid", gap: 8, alignContent: "start" }}>
          {pgto && (
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "var(--muted)" }}>Pagamento: </span>
              <b>{pgto}</b>
            </div>
          )}
          {proxima && (
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "var(--muted)" }}>Próxima consulta: </span>
              <b>{rotuloConsulta(proxima)}</b>{" "}
              <span style={{ fontSize: 11, fontWeight: 700, color: COR_STATUS[proxima.status] || "var(--muted)" }}>
                ({proxima.status})
              </span>
            </div>
          )}
          {passadas.length > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Histórico:</div>
              {passadas.map((c: any) => (
                <div key={c.id}>
                  {rotuloConsulta(c)} <span style={{ color: COR_STATUS[c.status] || "inherit" }}>({c.status})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
