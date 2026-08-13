import { listInstancias, listClinicas, getClinica } from "@/lib/db";
import { sessaoAtual, clinicaPermitida } from "@/lib/sessao";
import Link from "next/link";
import BotaoDesconectar from "./BotaoDesconectar";
import BotaoRemover from "./BotaoRemover";
import SeletorFuncao from "./SeletorFuncao";

export const dynamic = "force-dynamic";

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <main className="pagina" style={{ maxWidth: 600 }}>
      <div style={{ marginTop: 40, padding: 40, border: "1px dashed var(--border-forte)", borderRadius: 12, textAlign: "center", color: "var(--muted)" }}>
        {children}
      </div>
    </main>
  );
}

const conectado = (s?: string) => s === "conectado" || s === "connected" || s === "open";

// formata numero E.164 -> "+55 (35) 99999-8888"
function fmtTel(t?: string): string {
  const d = (t || "").replace(/\D/g, "");
  if (d.length >= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  return t || "—";
}

export default async function WhatsApps({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return <Aviso>Sessao invalida. Faca login de novo.</Aviso>;
  const sp = await searchParams;

  let clinicaId = await clinicaPermitida(sp.clinica ?? null);
  if (sessao.papel === "admin" && !clinicaId) {
    const todas = await listClinicas();
    clinicaId = todas[0]?.id ?? null;
  }
  if (!clinicaId) return <Aviso>Acesso negado a essa clinica.</Aviso>;

  const [clinica, instancias] = await Promise.all([getClinica(clinicaId), listInstancias(clinicaId)]);
  if (!clinica) return <Aviso>Clinica nao encontrada.</Aviso>;

  const conectadas = instancias.filter((i: any) => conectado(i.status)).length;

  return (
    <main className="pagina">
      <h1 style={{ fontSize: 26, margin: 0 }}>Números de WhatsApp</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
        {clinica.nome} · <b style={{ color: "var(--text)" }}>{conectadas}</b> de {instancias.length} conectado{instancias.length === 1 ? "" : "s"}
      </p>

      {/* resumo */}
      <div className="grid-metricas" style={{ marginTop: 16 }}>
        <div className="card">
          <div style={{ fontSize: 32, fontWeight: 700 }}>{instancias.length}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>números cadastrados</div>
        </div>
        <div className="card" style={{ borderColor: conectadas > 0 ? "var(--ok)" : "var(--border)" }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: conectadas > 0 ? "var(--ok)" : "var(--text)" }}>{conectadas}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>conectados e atendendo</div>
        </div>
      </div>

      {/* acao: adicionar/conectar.
          `novo=1` so quando a clinica JA tem numero: ai o QR e de um aparelho
          NOVO (segundo whats). Sem numero nenhum, e o primeiro — a rota cria o
          "Principal" sozinha. Sem esse parametro, clicar aqui numa clinica que
          ja tinha um numero so reconectava o MESMO (nunca dava pra plugar o 2o). */}
      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Link
          href={`/painel/conectar?clinica=${clinicaId}${instancias.length > 0 ? "&novo=1" : ""}`}
          className="btn-primario"
          style={{ padding: "12px 18px" }}
        >
          + Conectar {instancias.length > 0 ? "outro número" : "um número"}
        </Link>
        {instancias.length > 0 && (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            cada número precisa de um celular com linha diferente
          </span>
        )}
      </div>

      {/* lista de números */}
      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>Números da clínica</h2>
      {instancias.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>
          Nenhum número conectado ainda. Clique em "Conectar um número" pra escanear o QR.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {instancias.map((i: any) => {
            const on = conectado(i.status);
            return (
              <div key={i.id} className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", flexWrap: "wrap" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: on ? "var(--ok)" : "var(--danger)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{i.nome || "Número"}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                    {i.numero ? fmtTel(i.numero) : "número ainda não identificado"}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: on ? "var(--ok)" : "var(--danger)", textTransform: "uppercase", letterSpacing: 0.3 }}>
                  {on ? "conectado" : "desconectado"}
                </span>
                <SeletorFuncao id={i.id} funcaoInicial={i.funcao || "atendimento"} />
                {/* &instancia=ID: o QR e DESTE numero. Sem isso a tela caia
                    sempre no primeiro da lista e reconectava o errado. */}
                <Link
                  href={`/painel/conectar?clinica=${clinicaId}&instancia=${i.id}`}
                  className="btn-fantasma"
                  style={{ padding: "6px 12px", fontSize: 13, textDecoration: "none", flexShrink: 0 }}
                >
                  {on ? "gerenciar" : "reconectar"}
                </Link>
                {on && <BotaoDesconectar id={i.id} />}
                <BotaoRemover id={i.id} rotulo={i.numero ? fmtTel(i.numero) : i.nome || "esse número"} />
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
