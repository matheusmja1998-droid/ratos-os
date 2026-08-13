"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Painel do GOOGLE CALENDAR dentro de Integracoes: a pessoa escolhe o medico e
// conecta a agenda dele AQUI (sem precisar ir em Configuracoes). Cada linha e um
// profissional com o status do vinculo + botao conectar (OAuth do Google) ou
// desconectar. O link /api/gcal/conectar?prof=ID redireciona pro consentimento
// do Google e volta ja vinculado.

type Prof = { id: string; nome: string; especialidade?: string | null; gcal_conectado?: boolean; gcal_email?: string | null };

export default function IntegracaoGoogleCalendar({
  clinicaId,
  profissionais,
}: {
  clinicaId: string;
  profissionais: Prof[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  async function desconectar(p: Prof) {
    if (!confirm(`Desconectar o Google Calendar de ${p.nome}? As consultas param de espelhar na agenda dele.`)) return;
    setErro("");
    setOcupado(p.id);
    try {
      const res = await fetch("/api/gcal/desconectar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prof: p.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.erro || "não consegui desconectar");
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || "erro ao desconectar");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
        Escolhe o médico e conecta a agenda do Google dele: as consultas marcadas pela IA aparecem
        na agenda do médico, e os eventos da agenda dele bloqueiam os horários aqui.
      </div>

      {erro && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>
          {erro}
        </div>
      )}

      {profissionais.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Nenhum profissional cadastrado ainda. Cadastra primeiro em Configurações → Profissionais.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {profissionais.map((p) => {
            const on = Boolean(p.gcal_conectado);
            return (
              <div
                key={p.id}
                style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: on ? "var(--ok)" : "var(--border-forte)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nome}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 2 }}>
                    {on
                      ? `agenda conectada${p.gcal_email ? ` · ${p.gcal_email}` : ""}`
                      : p.especialidade || "agenda não conectada"}
                  </div>
                </div>
                {on ? (
                  <button
                    onClick={() => desconectar(p)}
                    disabled={ocupado === p.id}
                    className="btn-fantasma"
                    style={{ padding: "7px 14px", fontSize: 13, color: "var(--danger)", borderColor: "var(--danger)" }}
                  >
                    {ocupado === p.id ? "..." : "desconectar"}
                  </button>
                ) : (
                  <a
                    href={`/api/gcal/conectar?prof=${p.id}`}
                    className="btn-primario"
                    style={{ padding: "8px 16px", fontSize: 13, textDecoration: "none" }}
                  >
                    Conectar agenda
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
