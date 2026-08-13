"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Sair from "./Sair";
import {
  IconeCasa,
  IconeAgenda,
  IconeConversas,
  IconeWhatsApp,
  IconeRobo,
  IconeDashboard,
  IconeIntegracoes,
  IconeConfiguracoes,
  IconeKanban,
} from "./Icones";

// Menu lateral do painel da clinica. Preserva ?clinica=ID nos links quando o
// admin esta inspecionando uma clinica (conta clinica navega sem param — o
// isolamento real e server-side em lib/sessao.ts, isso aqui e so navegacao).
// Icones em SVG (currentColor): a mesma arte serve pro tema claro e escuro.
const ITENS = [
  { href: "/painel/comecar", rotulo: "Primeiros passos", Icone: IconeCasa },
  { href: "/painel", rotulo: "Agenda médicos", exato: true, Icone: IconeAgenda },
  { href: "/painel/exames", rotulo: "Agenda de exames", Icone: IconeAgenda },
  { href: "/painel/conversas", rotulo: "Conversas", Icone: IconeConversas },
  { href: "/painel/crm", rotulo: "CRM", Icone: IconeKanban },
  { href: "/painel/whatsapps", rotulo: "Números de WhatsApp", Icone: IconeWhatsApp },
  { href: "/painel/teste-whats", rotulo: "Testar WhatsApp", Icone: IconeRobo },
  { href: "/painel/dashboard", rotulo: "Dashboard", Icone: IconeDashboard },
  { href: "/painel/integracoes", rotulo: "Integrações", Icone: IconeIntegracoes },
  // Configuracoes fica por ULTIMO: central de setup da clinica (dados + profissionais)
  { href: "/painel/clinica", rotulo: "Configurações", Icone: IconeConfiguracoes },
];

export default function Sidebar({
  ehAdmin,
  clinicas = [],
}: {
  ehAdmin: boolean;
  clinicas?: { id: string; nome: string }[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const clinica = params.get("clinica");
  const sufixo = clinica ? `?clinica=${clinica}` : "";
  // admin sem ?clinica= na URL: assume a primeira (mesma regra do backend) —
  // mostrar isso explicito evita operar na clinica errada sem perceber
  const clinicaAtual = clinica || (ehAdmin ? clinicas[0]?.id : "") || "";
  // TODOS os links da sidebar carregam a clinica ativa (admin), pra navegacao
  // nunca "cair" na clinica default ao trocar de aba
  const sufAtivo = ehAdmin && clinicaAtual ? `?clinica=${clinicaAtual}` : sufixo;

  // BADGE VERMELHO em Conversas: quantas duvidas a IA abriu e ainda estao sem
  // resposta da equipe (a IA disse ao paciente "vou confirmar com o especialista")
  const [pendentes, setPendentes] = useState(0);
  useEffect(() => {
    let vivo = true;
    async function busca() {
      try {
        const q = clinicaAtual ? `?clinica=${clinicaAtual}` : "";
        const res = await fetch(`/api/duvidas${q}`);
        const j = await res.json();
        if (vivo) setPendentes(Number(j.total) || 0);
      } catch {
        /* silencioso */
      }
    }
    busca();
    const t = setInterval(busca, 15000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [clinicaAtual]);

  return (
    <aside className="sidebar">
      <div>
        {/* Duas versoes da logo: a colorida no tema claro, o wordmark BRANCO
            oficial no dark (CSS decide qual aparece — .sidebar-logo-dark) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/facilita-logo.png"
          alt="Facilita AI"
          className="sidebar-logo sidebar-logo-claro"
          style={{ display: "block", width: "100%", height: "auto", padding: "6px 8px" }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/facilita-logo-dark.png"
          alt="Facilita AI"
          className="sidebar-logo sidebar-logo-dark"
          style={{ display: "none", width: "100%", height: "auto", padding: "10px 12px" }}
        />
        {ehAdmin && (
          <Link href="/admin" className="sidebar-voltar">
            ← todas as clínicas
          </Link>
        )}
        {/* SELETOR DE CLINICA (admin): mostra e fixa em qual clinica voce esta
            operando. Trocar aqui recarrega a aba atual com ?clinica= — todas as
            acoes (Feegow, importar, editar) passam a valer pra clinica certa. */}
        {ehAdmin && clinicas.length > 0 && (
          <div style={{ padding: "6px 12px 0" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
              Operando na clínica
            </div>
            <select
              className="input"
              value={clinicaAtual}
              onChange={(e) => {
                const base = pathname || "/painel";
                // navegacao HARD (nao router.push) pra o Server Component RE-BUSCAR
                // os dados da clinica nova — com push, a pagina server ficava com
                // os dados da clinica anterior (bug: seletor Pulmonar, dados teste)
                window.location.href = `${base}?clinica=${e.target.value}`;
              }}
              style={{ marginTop: 0, width: "100%", fontSize: 13, padding: "7px 8px", fontWeight: 600 }}
            >
              {clinicas.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <nav className="sidebar-nav">
        {ITENS.map((item) => {
          const ativo = item.exato ? pathname === item.href : pathname.startsWith(item.href);
          const Icone = item.Icone;
          return (
            <Link
              key={item.href}
              href={item.href + sufAtivo}
              className={ativo ? "sidebar-item ativo" : "sidebar-item"}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <span style={{ display: "grid", placeItems: "center", flexShrink: 0, opacity: ativo ? 1 : 0.75 }}>
                <Icone />
              </span>
              <span style={{ flex: 1 }}>{item.rotulo}</span>
              {item.href === "/painel/conversas" && pendentes > 0 && (
                <span
                  title={`${pendentes} pergunta(s) esperando resposta da equipe`}
                  style={{
                    background: "var(--danger)",
                    color: "#fff",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 800,
                    minWidth: 19,
                    height: 19,
                    display: "grid",
                    placeItems: "center",
                    padding: "0 5px",
                  }}
                >
                  {pendentes}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-rodape">
        <Sair />
      </div>
    </aside>
  );
}
