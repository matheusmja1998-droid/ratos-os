import Link from "next/link";
import {
  getClinica,
  listClinicas,
  listProfissionais,
  listInstancias,
  listHorarios,
  listarConversas,
} from "@/lib/db";
import { sessaoAtual, clinicaPermitida } from "@/lib/sessao";
import { IconeCheck } from "../Icones";

export const dynamic = "force-dynamic";

// Onboarding guiado: o passo a passo pra clinica nova sair do zero ate a IA
// atendendo, na ordem certa, com o que ja foi feito marcado. Auto-suficiente:
// a clinica se configura sozinha sem precisar de suporte.

type Passo = {
  titulo: string;
  descricao: string;
  feito: boolean;
  href: string;
  acao: string;
};

export default async function Comecar({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string }>;
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

  const [clinica, profs, insts, conversas] = await Promise.all([
    getClinica(clinicaId),
    listProfissionais(clinicaId),
    listInstancias(clinicaId),
    listarConversas(clinicaId),
  ]);
  if (!clinica) return null;

  // preserva ?clinica= nos links (admin operando uma clinica especifica)
  const suf = sessao.papel === "admin" && sp.clinica ? `?clinica=${clinicaId}` : "";

  // algum profissional com grade de horarios cadastrada?
  const horariosPorProf = await Promise.all(profs.map((p: any) => listHorarios(p.id)));
  const temHorarios = horariosPorProf.some((h) => h.length > 0);
  const whatsOn = insts.some((i: any) => i.status === "conectado" || i.status === "connected");

  const passos: Passo[] = [
    {
      titulo: "Preencher os dados da clínica",
      descricao: "Endereço, convênios, preços e FAQ. É daqui que a IA tira as respostas pros pacientes.",
      feito: Boolean(clinica.endereco || clinica.precos || clinica.faq),
      href: "/painel/clinica",
      acao: "preencher",
    },
    {
      titulo: "Cadastrar os profissionais",
      descricao: "Nome, especialidade e duração da consulta de cada médico/dentista.",
      feito: profs.length > 0,
      href: "/painel/clinica",
      acao: "cadastrar",
    },
    {
      titulo: "Definir os horários de atendimento",
      descricao: "A grade semanal de cada profissional. Sem isso a IA não tem horário pra oferecer.",
      feito: temHorarios,
      href: "/painel/clinica",
      acao: "definir",
    },
    {
      titulo: "Conectar o WhatsApp",
      descricao: "Escaneia o QR com o número da clínica e a IA começa a atender nele.",
      feito: whatsOn,
      href: "/painel/conectar",
      acao: "conectar",
    },
    {
      titulo: "Testar a IA",
      descricao: "Conversa com a tua própria IA no simulador (ou manda mensagem no número) pra ver ela agendando.",
      feito: conversas.length > 0,
      href: "/painel/teste-whats",
      acao: "testar",
    },
    {
      titulo: "WhatsApp do dono (relatório automático)",
      descricao: "Cadastra o número do dono pra receber toda semana o resumo: consultas marcadas, faltas evitadas.",
      feito: Boolean(clinica.telefone_dono),
      href: "/painel/clinica",
      acao: "cadastrar",
    },
  ];

  const feitos = passos.filter((p) => p.feito).length;
  const pct = Math.round((feitos / passos.length) * 100);
  const completo = feitos === passos.length;

  return (
    <main className="pagina" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 26, margin: 0 }}>Primeiros passos</h1>
      <p style={{ color: "var(--muted)", marginTop: 4 }}>
        {completo
          ? "Tudo pronto! Tua IA está atendendo."
          : `Siga a ordem abaixo e em ~10 minutos a IA está atendendo os pacientes da ${clinica.nome}.`}
      </p>

      {/* barra de progresso */}
      <div style={{ marginTop: 18, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 10, borderRadius: 5, background: "var(--border)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#16a34a", transition: "width .3s" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: completo ? "#16a34a" : "var(--muted)" }}>
          {feitos}/{passos.length}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {passos.map((p, i) => (
          <div
            key={p.titulo}
            className="card"
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              opacity: p.feito ? 0.75 : 1,
              borderColor: p.feito ? "var(--border)" : "var(--accent)",
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 14,
                background: p.feito ? "rgba(22,163,74,0.15)" : "var(--accent-soft)",
                color: p.feito ? "#16a34a" : "var(--accent)",
              }}
            >
              {p.feito ? <IconeCheck size={14} /> : i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 650, fontSize: 15, textDecoration: p.feito ? "line-through" : "none" }}>
                {p.titulo}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>{p.descricao}</div>
            </div>
            {!p.feito && (
              <Link
                href={p.href + suf}
                className="btn-primario"
                style={{ padding: "8px 14px", fontSize: 13, whiteSpace: "nowrap", textDecoration: "none" }}
              >
                {p.acao} →
              </Link>
            )}
          </div>
        ))}
      </div>

      {completo && (
        <div className="card" style={{ marginTop: 18, textAlign: "center", borderColor: "#16a34a" }}>
          <div style={{ fontSize: 15 }}>
            Setup completo! Acompanha os agendamentos na{" "}
            <Link href={"/painel" + suf} style={{ color: "var(--link)" }}>Agenda</Link> e o retorno no{" "}
            <Link href={"/painel/dashboard" + suf} style={{ color: "var(--link)" }}>Dashboard</Link>.
          </div>
        </div>
      )}
    </main>
  );
}
