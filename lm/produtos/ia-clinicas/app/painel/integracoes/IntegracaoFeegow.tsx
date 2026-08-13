"use client";

import { useEffect, useState } from "react";

// Card da integracao FEEGOW: cola o token (gerado pelo usuario master na
// interface do Feegow), valida, e mapeia cada profissional do Facilita pro
// profissional correspondente no Feegow. Com isso as duas agendas ficam
// unificadas: marcou aqui → cai no Feegow; marcou no Feegow → bloqueia e
// aparece aqui.

type Opcao = { id: string; nome: string };
type Mapa = {
  id: string;
  nome: string;
  feegow_professional_id: string;
  feegow_especialidade_id: string;
  feegow_procedimento_id: string;
};

export default function IntegracaoFeegow({ clinicaId }: { clinicaId: string }) {
  const [carregando, setCarregando] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [token, setToken] = useState("");
  const [localId, setLocalId] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [mapa, setMapa] = useState<Mapa[]>([]);
  const [fg, setFg] = useState<{ profissionais: Opcao[]; especialidades: Opcao[]; procedimentos: Opcao[]; motivos: Opcao[] }>({
    profissionais: [],
    especialidades: [],
    procedimentos: [],
    motivos: [],
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const res = await fetch(`/api/integracoes/feegow?clinica=${clinicaId}`);
      const j = await res.json();
      setConectado(Boolean(j.conectado));
      setLocalId(j.local_id || "");
      setMotivoId(j.motivo_id || "");
      setMapa(j.mapeamento || []);
      setFg(j.feegow || { profissionais: [], especialidades: [], procedimentos: [], motivos: [] });
    } catch {
      /* mostra estado desconectado */
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId]);

  async function conectar() {
    setErro("");
    setOkMsg("");
    if (!token.trim()) {
      setErro("Cole o token da API da Feegow.");
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/integracoes/feegow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, token: token.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      setToken("");
      setOkMsg("Conectado! Agora mapeia os profissionais abaixo.");
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "erro ao conectar");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarConfig() {
    setErro("");
    setOkMsg("");
    setSalvando(true);
    try {
      const res = await fetch("/api/integracoes/feegow", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinica_id: clinicaId,
          local_id: localId,
          motivo_id: motivoId,
          mapeamento: mapa,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      setOkMsg("Configuração salva! Agenda unificada ativa.");
    } catch (e: any) {
      setErro(e?.message || "erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function importarProfissionais() {
    setErro("");
    setOkMsg("");
    setSalvando(true);
    try {
      const res = await fetch("/api/integracoes/feegow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      setOkMsg(
        `Importação concluída: ${j.criados} criado(s), ${j.vinculados} vinculado(s) pelo nome, ${j.pulados} já existiam. Ajusta a duração, os convênios e a grade de cada um em Configurações.`
      );
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "erro na importação");
    } finally {
      setSalvando(false);
    }
  }

  async function desconectar() {
    if (!confirm("Desconectar a Feegow? As agendas param de sincronizar.")) return;
    await fetch("/api/integracoes/feegow", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinica_id: clinicaId }),
    });
    await carregar();
  }

  function mudaMapa(id: string, campo: keyof Mapa, valor: string) {
    setMapa((atual) => atual.map((m) => (m.id === id ? { ...m, [campo]: valor } : m)));
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/feegow-logo.jpeg"
          alt="Feegow"
          style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Feegow Clinic</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Agenda unificada: marcou aqui, cai no Feegow · marcou no Feegow, bloqueia e aparece aqui.
          </div>
        </div>
        {conectado ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ok)", background: "rgba(22,163,74,0.12)", padding: "4px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>
            ● conectada
          </span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", padding: "4px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>
            desconectada
          </span>
        )}
      </div>

      {erro && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>
          {erro}
        </div>
      )}
      {okMsg && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(22,163,74,0.1)", color: "var(--ok)", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
          {okMsg}
        </div>
      )}

      {carregando ? (
        <div style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>carregando...</div>
      ) : !conectado ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
            <b style={{ color: "var(--text)" }}>Como pegar o token:</b> no Feegow, o usuário <b>master</b> libera o
            token de API pela interface (Configurações → Integrações/API). Copia e cola aqui:
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              className="input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="x-access-token da Feegow"
              style={{ marginTop: 0, flex: 1, minWidth: 260 }}
            />
            <button className="btn-primario" onClick={conectar} disabled={salvando} style={{ padding: "10px 18px" }}>
              {salvando ? "Validando..." : "Conectar"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
          {/* config geral */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Unidade (local_id)</div>
              <input
                className="input"
                value={localId}
                onChange={(e) => setLocalId(e.target.value)}
                placeholder="Ex: 1"
                style={{ marginTop: 0 }}
              />
            </label>
            <label style={{ flex: 2, minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Motivo padrão (cancelar/remarcar)</div>
              <select className="input" value={motivoId} onChange={(e) => setMotivoId(e.target.value)} style={{ marginTop: 0 }}>
                <option value="">Selecione...</option>
                {fg.motivos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </label>
          </div>

          {/* mapeamento de profissionais */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>Mapeamento de profissionais</div>
              <button
                className="btn-fantasma"
                onClick={importarProfissionais}
                disabled={salvando}
                style={{ padding: "7px 14px", fontSize: 13 }}
                title="Cria no Facilita todos os profissionais da conta Feegow, já vinculados"
              >
                Importar profissionais da Feegow
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
              Diz quem é quem: cada profissional do Facilita ↔ o correspondente no Feegow (+ especialidade e
              procedimento usados ao criar o agendamento lá). Ou importa todos de uma vez no botão acima.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {mapa.map((m) => (
                <div key={m.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, minWidth: 140, flex: 1 }}>{m.nome}</div>
                  <select
                    className="input"
                    value={m.feegow_professional_id}
                    onChange={(e) => mudaMapa(m.id, "feegow_professional_id", e.target.value)}
                    style={{ marginTop: 0, width: "auto", minWidth: 170 }}
                  >
                    <option value="">— profissional no Feegow —</option>
                    {fg.profissionais.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    value={m.feegow_especialidade_id}
                    onChange={(e) => mudaMapa(m.id, "feegow_especialidade_id", e.target.value)}
                    style={{ marginTop: 0, width: "auto", minWidth: 150 }}
                  >
                    <option value="">— especialidade —</option>
                    {fg.especialidades.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    value={m.feegow_procedimento_id}
                    onChange={(e) => mudaMapa(m.id, "feegow_procedimento_id", e.target.value)}
                    style={{ marginTop: 0, width: "auto", minWidth: 150 }}
                  >
                    <option value="">— procedimento —</option>
                    {fg.procedimentos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
            <button className="btn-fantasma" onClick={desconectar} disabled={salvando} style={{ padding: "9px 16px", color: "var(--danger)", borderColor: "var(--danger)" }}>
              desconectar
            </button>
            <button className="btn-primario" onClick={salvarConfig} disabled={salvando} style={{ padding: "10px 20px" }}>
              {salvando ? "Salvando..." : "Salvar configuração"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
