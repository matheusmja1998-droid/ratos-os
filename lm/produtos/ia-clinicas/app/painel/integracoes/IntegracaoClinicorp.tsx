"use client";

import { useEffect, useState } from "react";

// Card da integracao CLINICORP (agenda odontologica). Espelha o padrao do card
// Feegow: cola as credenciais (Usuario API + Token API + subscriber_id), valida,
// e mapeia cada profissional do Facilita pro dentista correspondente no
// Clinicorp. Com isso as duas agendas ficam unificadas.
//
// AUTH do Clinicorp: HTTP Basic (Usuario API = login, Token API = senha). Onde
// achar: Sistema Clinicorp > Gerenciar Assinatura > Acesso Externo e Integracoes.

type Opcao = { id: string; nome: string };
type Mapa = { id: string; nome: string; clinicorp_professional_id: string };

export default function IntegracaoClinicorp({ clinicaId }: { clinicaId: string }) {
  const [carregando, setCarregando] = useState(true);
  const [conectado, setConectado] = useState(false);
  // credenciais (o token nunca volta preenchido — so quando o usuario digita)
  const [apiUser, setApiUser] = useState("");
  const [token, setToken] = useState("");
  const [subscriberId, setSubscriberId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [mapa, setMapa] = useState<Mapa[]>([]);
  const [ccProfs, setCcProfs] = useState<Opcao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const res = await fetch(`/api/clinicorp?clinica=${clinicaId}`);
      const j = await res.json();
      setConectado(Boolean(j.conectado));
      setApiUser(j.api_user || "");
      setSubscriberId(j.subscriber_id || "");
      setBusinessId(j.business_id || "");
      setCcProfs(Array.isArray(j.profissionais) ? j.profissionais : []);
      setMapa(Array.isArray(j.mapeamento) ? j.mapeamento : []);
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
    if (!apiUser.trim() || (!token.trim() && !conectado)) {
      setErro("Preencha o usuário API e o token.");
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/clinicorp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinica_id: clinicaId,
          api_user: apiUser.trim(),
          token: token.trim(),
          subscriber_id: subscriberId.trim(),
          business_id: businessId.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      setToken("");
      setOkMsg(`Conectado! ${j.profissionais ?? 0} profissional(is) no Clinicorp. Agora mapeia abaixo.`);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "erro ao conectar");
    } finally {
      setSalvando(false);
    }
  }

  // importa TODOS os dentistas da conta Clinicorp pro Facilita (cria ja
  // vinculado com grade padrao; mesmo nome so vincula; mapeado e pulado)
  async function importarDentistas() {
    setErro("");
    setOkMsg("");
    setSalvando(true);
    try {
      const res = await fetch("/api/clinicorp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      setOkMsg(
        `Importação concluída: ${j.criados} criado(s), ${j.vinculados} vinculado(s) pelo nome, ${j.pulados} já existiam. Ajusta a duração e a grade de cada um em Configurações.`
      );
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "erro na importação");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarMapeamento() {
    setErro("");
    setOkMsg("");
    setSalvando(true);
    try {
      const res = await fetch("/api/clinicorp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, mapeamento: mapa }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não deu certo");
      setOkMsg("Mapeamento salvo! Agenda unificada ativa.");
    } catch (e: any) {
      setErro(e?.message || "erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function desconectar() {
    if (!confirm("Desconectar o Clinicorp? As agendas param de sincronizar.")) return;
    await fetch("/api/clinicorp", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinica_id: clinicaId }),
    });
    await carregar();
  }

  function mudaMapa(id: string, valor: string) {
    setMapa((atual) => atual.map((m) => (m.id === id ? { ...m, clinicorp_professional_id: valor } : m)));
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/clinicorp-logo.jpeg"
          alt="Clinicorp"
          style={{ width: 44, height: 44, borderRadius: 10, objectFit: "contain", background: "#fff", padding: 4, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Clinicorp</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Agenda odontológica unificada: marcou aqui, cai no Clinicorp · marcou no Clinicorp, bloqueia e aparece aqui.
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
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
            <b style={{ color: "var(--text)" }}>Como pegar:</b> no Clinicorp, vá em{" "}
            <b>Gerenciar Assinatura → Acesso Externo e Integrações</b>. Lá aparecem o{" "}
            <b>Usuário API</b> (o nome da conta, ex: <i>nomedaclinica</i> — NÃO é email nem a senha
            de nenhum painel) e o <b>Token API</b> (um código longo). É só copiar e colar aqui.
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              className="input"
              value={apiUser}
              onChange={(e) => setApiUser(e.target.value)}
              placeholder="Usuário API — ex: nomedaclinica (não é email)"
              style={{ marginTop: 0 }}
            />
            <input
              className="input"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token API — cole o código aqui"
              style={{ marginTop: 0 }}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                className="input"
                value={subscriberId}
                onChange={(e) => setSubscriberId(e.target.value)}
                placeholder="subscriber_id (opcional, igual ao usuário)"
                style={{ marginTop: 0, flex: 1, minWidth: 160 }}
              />
              <input
                className="input"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                placeholder="businessId (opcional)"
                style={{ marginTop: 0, flex: 1, minWidth: 160 }}
              />
            </div>
            <button className="btn-primario" onClick={conectar} disabled={salvando} style={{ padding: "10px 18px", justifySelf: "start" }}>
              {salvando ? "Validando..." : "Conectar"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
          {/* mapeamento de profissionais */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>Mapeamento de profissionais</div>
              <button
                className="btn-fantasma"
                onClick={importarDentistas}
                disabled={salvando}
                style={{ padding: "7px 14px", fontSize: 13 }}
                title="Cria no Facilita todos os dentistas da conta Clinicorp, já vinculados"
              >
                Importar dentistas do Clinicorp
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
              Diz quem é quem: cada profissional do Facilita ↔ o dentista correspondente no Clinicorp.
              Ou importa todos de uma vez no botão acima.
            </div>
            {mapa.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                Nenhum profissional cadastrado no Facilita ainda. Cadastra em Configurações primeiro.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {mapa.map((m) => (
                  <div key={m.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, minWidth: 140, flex: 1 }}>{m.nome}</div>
                    <select
                      className="input"
                      value={m.clinicorp_professional_id}
                      onChange={(e) => mudaMapa(m.id, e.target.value)}
                      style={{ marginTop: 0, width: "auto", minWidth: 200 }}
                    >
                      <option value="">— dentista no Clinicorp —</option>
                      {ccProfs.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
            <button className="btn-fantasma" onClick={desconectar} disabled={salvando} style={{ padding: "9px 16px", color: "var(--danger)", borderColor: "var(--danger)" }}>
              desconectar
            </button>
            <button className="btn-primario" onClick={salvarMapeamento} disabled={salvando} style={{ padding: "10px 20px" }}>
              {salvando ? "Salvando..." : "Salvar mapeamento"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
