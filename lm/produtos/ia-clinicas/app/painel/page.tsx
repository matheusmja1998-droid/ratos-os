import {
  getClinica,
  listClinicas,
  listInstancias,
  listProfissionais,
  agendaDaClinica,
  metricasClinica,
} from "@/lib/db";
import { hojeSP } from "@/lib/agenda";
import Link from "next/link";
import { sessaoAtual } from "@/lib/sessao";
import { clinicaPermitida } from "@/lib/sessao";
import { eventosDoMedico } from "@/lib/gcal";
import { eventosFeegow } from "@/lib/feegow";
import { eventosClinicorp } from "@/lib/clinicorp";
import { eventosKlingo } from "@/lib/klingo";
import AgendaView from "./AgendaView";

export const dynamic = "force-dynamic";

// soma N dias a uma data YYYY-MM-DD sem depender do fuso do servidor
function somaDias(dataISO: string, dias: number): string {
  const [y, mo, d] = dataISO.split("-").map(Number);
  const t = Date.UTC(y, mo - 1, d) + dias * 86400000;
  const dt = new Date(t);
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

// Contagem do trial de 14 dias (trial_inicio gravado no "Iniciar trial" do
// admin). null = clinica sem trial iniciado -> nao mostra faixa nenhuma.
function situacaoTrial(trialInicio?: string | null): { dias: number; acabou: boolean } | null {
  if (!trialInicio) return null;
  const inicio = new Date(trialInicio).getTime();
  if (isNaN(inicio)) return null;
  const restam = 14 - Math.floor((Date.now() - inicio) / 86400000);
  return { dias: Math.abs(restam), acabou: restam <= 0 };
}

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string; semana?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) {
    return <Aviso>Sessao invalida. Faca login de novo.</Aviso>;
  }

  const sp = await searchParams;
  const ehAdmin = sessao.papel === "admin";

  // ISOLAMENTO: clinicaPermitida trava a conta 'clinica' na propria clinica
  // (ignora ?clinica= da URL). Admin escolhe qual inspecionar via ?clinica=ID;
  // sem ?clinica=, cai na primeira cadastrada.
  let clinicaId = await clinicaPermitida(sp.clinica ?? null);
  if (ehAdmin && !clinicaId) {
    const todas = await listClinicas();
    clinicaId = todas[0]?.id ?? null;
    if (!clinicaId) {
      return (
        <Aviso>
          Nenhuma clinica cadastrada ainda.{" "}
          <Link href="/painel/clinica" style={{ color: "var(--link)" }}>
            criar a primeira
          </Link>
        </Aviso>
      );
    }
  }
  if (!clinicaId) {
    return <Aviso>Conta sem clinica. Fale com o administrador.</Aviso>;
  }

  const hoje = hojeSP();
  const amanha = somaDias(hoje, 1);

  // SEMANA DE CALENDARIO: a grade sempre vai de SEGUNDA a DOMINGO (como o
  // Google Calendar), com o dia de hoje destacado — antes comecava em "hoje"
  // e a segunda-feira caia no meio da grade, o que confundia a leitura.
  const [hy, hm, hd] = hoje.split("-").map(Number);
  const dow = new Date(Date.UTC(hy, hm - 1, hd)).getUTCDay(); // 0=domingo..6=sabado
  const segundaDaSemana = somaDias(hoje, -((dow + 6) % 7));

  // navegacao por semanas: ?semana=1 = proxima semana, -1 = anterior (max 26 pra frente)
  const semana = Math.max(-8, Math.min(26, parseInt(sp.semana || "0", 10) || 0));
  const inicioSemana = somaDias(segundaDaSemana, semana * 7);
  const ate = somaDias(inicioSemana, 7);

  // Busca tudo em paralelo, antes de renderizar (nada de async dentro do render).
  const de = inicioSemana + "T00:00:00";
  const ateFull = ate + "T23:59:59";
  const [clinica, insts, metricas, profissionais, agendaInterna] = await Promise.all([
    getClinica(clinicaId),
    listInstancias(clinicaId),
    metricasClinica(clinicaId, "2020-01-01T00:00:00"),
    listProfissionais(clinicaId),
    agendaDaClinica(clinicaId, de, ateFull),
  ]);

  if (!clinica) {
    return <Aviso>Clinica nao encontrada.</Aviso>;
  }

  // FONTE DA VERDADE = Google Calendar do medico (quando vinculado E respondendo).
  // Regra robusta:
  //  - Google RESPONDEU (array, mesmo vazio) -> usa os eventos do Google; a
  //    agenda interna desse medico entra so como FALLBACK das consultas que o
  //    Google nao devolveu (dedup por profissional_id+minuto de inicio).
  //  - Google FALHOU (null: timeout/erro) -> NAO apaga a agenda; cai 100% na
  //    interna daquele medico (assim uma falha do Google nao esvazia a tela).
  const conectados = profissionais.filter((p: any) => p.gcal_conectado === true || p.gcal_conectado === 1);
  const profsFeegow = profissionais.filter((p: any) => p.feegow_professional_id);
  const profsClinicorp = profissionais.filter((p: any) => p.clinicorp_professional_id);
  const profsKlingo = profissionais.filter((p: any) => p.klingo_professional_id);

  // VELOCIDADE: as 3 agendas externas (Google, Feegow, Clinicorp) NAO dependem
  // uma da outra — dispara tudo junto. Antes rodavam em sequencia e a tela
  // esperava a soma das 3 (a queixa de "navegacao travada"); agora espera so a
  // mais lenta. Cada bloco ja e best-effort: falha vira null e cai na interna.
  const [puxados, puxadosFg, puxadosCc, puxadosKg] = await Promise.all([
    Promise.all(
      conectados.map(async (p: any) => {
        const evs = await eventosDoMedico(p.id, de, ateFull, clinicaId!).catch(() => null);
        return { profId: p.id, profNome: p.nome, evs };
      })
    ),
    Promise.all(
      profsFeegow.map(async (p: any) => ({
        prof: p,
        evs: await eventosFeegow(p.id, de, ateFull, clinicaId!).catch(() => null),
      }))
    ),
    Promise.all(
      profsClinicorp.map(async (p: any) => ({
        prof: p,
        evs: await eventosClinicorp(p.id, de, ateFull, clinicaId!).catch(() => null),
      }))
    ),
    Promise.all(
      profsKlingo.map(async (p: any) => ({
        prof: p,
        evs: await eventosKlingo(p.id, de, ateFull, clinicaId!).catch(() => null),
      }))
    ),
  ]);

  const eventosGoogle: any[] = [];
  const respondeuGoogle = new Set<string>(); // medicos cujo Google respondeu (array)
  const chaveGoogle = new Set<string>(); // profId|inicio(minuto) ja vindos do Google
  for (const { profId, profNome, evs } of puxados) {
    if (evs == null) continue; // falhou -> nao marca como respondeu (cai na interna)
    respondeuGoogle.add(profId);
    for (const e of evs) {
      chaveGoogle.add(`${profId}|${e.inicio.slice(0, 16)}`);
      eventosGoogle.push({
        id: `gcal-${profId}-${e.inicio}`,
        inicio: e.inicio,
        fim: e.fim,
        profissional_id: profId,
        profissional_nome: profNome,
        paciente_nome: e.titulo,
        status: "confirmada",
        origem: "gcal",
      });
    }
  }

  // internas que entram: de medico nao-conectado, OU de medico conectado cujo
  // Google FALHOU (nao respondeu), OU consulta interna que o Google nao trouxe
  // (medico conectado que respondeu mas o espelho tinha falhado — fallback visivel).
  const internasVisiveis = agendaInterna.filter((c: any) => {
    // EXAME nao entra na agenda de MEDICOS: ele mora na aba "Agenda de exames".
    // O profissional na consulta de exame e so uma ancora interna (exame nao
    // tem medico) — mostrar aqui poluia a agenda do pneumologista com exame
    // que nao e dele (reclamacao real da Cibele, 21/08).
    if (c.guia_url || /exame|pletismografia|dlco|polissonografia|espirometria|prova (ventilatoria|de funcao)|latencia|caminhada|feno|ergoespirometria|broncoprovocacao|pemax|pimax/i.test(String(c.observacao || ""))) {
      return false;
    }
    if (!respondeuGoogle.has(c.profissional_id)) return true; // nao conectado ou Google falhou
    return !chaveGoogle.has(`${c.profissional_id}|${(c.inicio || "").slice(0, 16)}`);
  });

  // FEEGOW (agenda principal do cliente): agendamentos feitos LA aparecem aqui.
  // Dedup: agendamento que a gente mesmo espelhou (mesmo prof + mesmo minuto de
  // uma consulta interna) nao duplica — a interna ja mostra com dados completos.
  const minutosInternos = new Set(
    agendaInterna.map((c: any) => `${c.profissional_id}|${(c.inicio || "").slice(0, 16)}`)
  );
  const eventosFg: any[] = [];
  for (const { prof, evs } of puxadosFg) {
    for (const e of evs || []) {
      if (minutosInternos.has(`${prof.id}|${e.inicio.slice(0, 16)}`)) continue;
      eventosFg.push({
        id: `feegow-${prof.id}-${e.inicio}`,
        inicio: e.inicio,
        fim: e.fim,
        profissional_id: prof.id,
        profissional_nome: prof.nome,
        paciente_nome: e.titulo,
        status: "confirmada",
        origem: "feegow",
      });
    }
  }

  // CLINICORP (agenda principal de clinicas odontologicas): mesmo padrao do
  // Feegow — agendamentos feitos LA aparecem aqui, com dedup pelo minuto de uma
  // consulta interna que a gente ja espelhou.
  const eventosCc: any[] = [];
  for (const { prof, evs } of puxadosCc) {
    for (const e of evs || []) {
      if (minutosInternos.has(`${prof.id}|${e.inicio.slice(0, 16)}`)) continue;
      eventosCc.push({
        id: `clinicorp-${prof.id}-${e.inicio}`,
        inicio: e.inicio,
        fim: e.fim,
        profissional_id: prof.id,
        profissional_nome: prof.nome,
        paciente_nome: e.titulo,
        status: "confirmada",
        origem: "clinicorp",
      });
    }
  }

  // KLINGO: mesmo padrao (agendamentos feitos la aparecem aqui, com dedup)
  const eventosKg: any[] = [];
  for (const { prof, evs } of puxadosKg) {
    for (const e of evs || []) {
      if (minutosInternos.has(`${prof.id}|${e.inicio.slice(0, 16)}`)) continue;
      eventosKg.push({
        id: `klingo-${prof.id}-${e.inicio}`,
        inicio: e.inicio,
        fim: e.fim,
        profissional_id: prof.id,
        profissional_nome: prof.nome,
        paciente_nome: e.titulo,
        status: "confirmada",
        origem: "klingo",
      });
    }
  }

  const agenda = [...internasVisiveis, ...eventosGoogle, ...eventosFg, ...eventosCc, ...eventosKg].sort(
    (a: any, b: any) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0)
  );

  return (
    <main className="pagina">
      {/* Cabecalho da pagina */}
      <h1 style={{ fontSize: 26, margin: 0 }}>Agenda</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
        {clinica.nome}
        {ehAdmin && " (visao admin)"}
      </p>

      {/* CONTADOR DO TRIAL: a clinica ve quanto falta do teste de 14 dias */}
      {(() => {
        const t = situacaoTrial(clinica.trial_inicio);
        if (!t) return null;
        return (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              fontSize: 13.5,
              background: t.acabou ? "var(--danger-bg)" : "var(--accent-soft)",
              color: t.acabou ? "var(--danger)" : "var(--text)",
              border: `1px solid ${t.acabou ? "var(--danger)" : "var(--accent)"}`,
            }}
          >
            <strong style={{ fontSize: 15 }}>
              {t.acabou
                ? `Período de teste encerrado há ${t.dias} dia${t.dias === 1 ? "" : "s"}`
                : `Faltam ${t.dias} dia${t.dias === 1 ? "" : "s"} do seu teste grátis`}
            </strong>
            <span style={{ color: t.acabou ? "var(--danger)" : "var(--muted)" }}>
              {t.acabou
                ? "Fala com a gente pra continuar usando."
                : "Teste de 14 dias · aproveita pra deixar tudo configurado."}
            </span>
          </div>
        );
      })()}

      {/* setup incompleto: manda pro onboarding guiado */}
      {(profissionais.length === 0 || insts.length === 0) && (
        <div
          className="card"
          style={{ marginTop: 14, borderColor: "var(--accent)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 650 }}>Falta pouco pra tua IA atender</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
              Termina o setup guiado ({profissionais.length === 0 ? "cadastrar profissionais" : "conectar o WhatsApp"} e mais alguns passos).
            </div>
          </div>
          <Link href="/painel/comecar" className="btn-primario" style={{ padding: "10px 16px", textDecoration: "none", whiteSpace: "nowrap" }}>
            continuar setup →
          </Link>
        </div>
      )}

      {/* Metricas resumidas — o numero que vende */}
      <div className="grid-metricas">
        <div className="card">
          <div style={{ fontSize: 32, fontWeight: 700 }}>{metricas.total}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>consultas totais</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 32, fontWeight: 700 }}>{metricas.confirmadas}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>confirmadas</div>
        </div>
        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--accent)" }}>
            {metricas.noShowsEvitados}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>no-shows evitados</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 32, fontWeight: 700 }}>{metricas.reviewsPedidos}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>reviews pedidos</div>
        </div>
      </div>

      {/* Acoes */}
      <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
        <Link
          href={`/painel/conectar?clinica=${clinicaId}`}
          className="btn-primario"
          style={{ padding: "12px 18px" }}
        >
          Conectar WhatsApp
          <span style={{ fontWeight: 400, marginLeft: 8, opacity: 0.85 }}>
            ({insts.length} conectado{insts.length === 1 ? "" : "s"})
          </span>
        </Link>
      </div>

      {/* Visao de agenda: geral ou por medico, com navegacao por semanas */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 32, marginBottom: 4, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>
          {semana === 0 ? "Essa semana" : `Semana de ${inicioSemana.slice(8, 10)}/${inicioSemana.slice(5, 7)}`}
          <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 14, marginLeft: 8 }}>
            seg {inicioSemana.slice(8, 10)}/{inicioSemana.slice(5, 7)} — dom {somaDias(inicioSemana, 6).slice(8, 10)}/{somaDias(inicioSemana, 6).slice(5, 7)}
          </span>
        </h2>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <Link
            href={`/painel?semana=${semana - 1}${sp.clinica ? `&clinica=${clinicaId}` : ""}`}
            className="btn-fantasma"
            style={{ padding: "6px 12px", fontSize: 13, textDecoration: "none" }}
          >
            ← anterior
          </Link>
          {semana !== 0 && (
            <Link
              href={`/painel${sp.clinica ? `?clinica=${clinicaId}` : ""}`}
              className="btn-fantasma"
              style={{ padding: "6px 12px", fontSize: 13, textDecoration: "none", fontWeight: 700 }}
            >
              hoje
            </Link>
          )}
          <Link
            href={`/painel?semana=${semana + 1}${sp.clinica ? `&clinica=${clinicaId}` : ""}`}
            className="btn-fantasma"
            style={{ padding: "6px 12px", fontSize: 13, textDecoration: "none" }}
          >
            proxima →
          </Link>
        </div>
      </div>
      <AgendaView
        agenda={agenda as any}
        profissionais={profissionais as any}
        hoje={hoje}
        amanha={amanha}
        inicioSemana={inicioSemana}
        clinicaId={clinicaId}
      />
    </main>
  );
}
