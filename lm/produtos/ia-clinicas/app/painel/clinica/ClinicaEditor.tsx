"use client";

import { useState } from "react";
import MateriaisSecao from "./MateriaisSecao";
import TomDeVozEditor from "./TomDeVozEditor";
import { IconeClinica, IconeTomVoz, IconeProfissionais, IconeMateriais, IconeLogArquivo, IconeConfiguracoes } from "../Icones";
import { IconeWhatsApp, IconeLixeira } from "../Icones";

const DIAS_SEMANA = [
  { num: 1, nome: "Segunda" },
  { num: 2, nome: "Terça" },
  { num: 3, nome: "Quarta" },
  { num: 4, nome: "Quinta" },
  { num: 5, nome: "Sexta" },
  { num: 6, nome: "Sábado" },
  { num: 0, nome: "Domingo" },
];

export default function ClinicaEditor({
  clinicaId,
  clinica,
  emailAcesso,
  profissionaisInit,
  instanciasInit,
  horariosPorProfInit,
}: {
  clinicaId: string;
  clinica: any;
  emailAcesso?: string;
  profissionaisInit: any[];
  instanciasInit: any[];
  horariosPorProfInit: any;
}) {
  const [profissionais, setProfissionais] = useState(profissionaisInit);
  const [instancias, setInstancias] = useState(instanciasInit);
  const [horariosPorProf, setHorariosPorProf] = useState(horariosPorProfInit);
  const [erro, setErro] = useState("");

  // Dados da clinica (o que foi preenchido no onboarding) — editaveis aqui.
  // dadosIniciais e ESTADO (nao const): depois de um save com sucesso ele vira
  // o snapshot salvo — senao a barra "alteracoes nao salvas" continuava acesa
  // apos salvar e convidava a clicar em "Descartar" (que parecia perder tudo).
  const [dadosIniciais, setDadosIniciais] = useState({
    nome: clinica.nome || "",
    endereco: clinica.endereco || "",
    convenios: clinica.convenios || "",
    precos: clinica.precos || "",
    faq: clinica.faq || "",
    tom_de_voz: clinica.tom_de_voz || "informal e acolhedor",
    link_review: clinica.link_review || "",
    telefone_dono: clinica.telefone_dono || "",
    recall_meses: String(clinica.recall_meses ?? 0),
    oferta_horarios: clinica.oferta_horarios || "curta",
    msg_estilo: Number(clinica.msg_estilo ?? 3),
    nome_ia: clinica.nome_ia || "",
    guia_exame_url: clinica.guia_exame_url || "",
    guia_exame_convenio: clinica.guia_exame_convenio || "",
    email_acesso: emailAcesso || "",
  });
  const [dados, setDados] = useState(dadosIniciais);
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [salvouDados, setSalvouDados] = useState(false);
  // true quando algum campo dos dados foi mexido e ainda nao salvou (mostra a barra do rodape)
  const dadosAlterados = JSON.stringify(dados) !== JSON.stringify(dadosIniciais);

  async function salvarDadosClinica() {
    setErro("");
    setSalvouDados(false);
    if (!dados.nome.trim()) {
      setErro("O nome da clínica não pode ficar vazio.");
      return;
    }
    setSalvandoDados(true);
    try {
      const { email_acesso, ...dadosClinica } = dados;
      const res = await fetch("/api/clinicas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clinicaId, ...dadosClinica }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "Erro ao salvar.");
      // e-mail de acesso mudou? Atualiza a conta de login tambem
      if (email_acesso.trim() && email_acesso.trim().toLowerCase() !== (emailAcesso || "").toLowerCase()) {
        const re = await fetch("/api/conta", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clinica_id: clinicaId, email: email_acesso.trim() }),
        });
        const je = await re.json();
        if (!re.ok) throw new Error(je?.erro || "Erro ao trocar o e-mail de acesso.");
      }
      setSalvouDados(true);
      setDadosIniciais(dados); // baseline novo: a barra de "nao salvo" apaga
      setTimeout(() => setSalvouDados(false), 3000);
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar os dados da clínica.");
    } finally {
      setSalvandoDados(false);
    }
  }

  // Modal de edição de profissional
  const [editandoProf, setEditandoProf] = useState<any | null>(null);
  const [horariosProfModal, setHorariosProfModal] = useState<any[]>([]);
  const [salvandoProf, setSalvandoProf] = useState(false);

  // Novo profissional
  const [novoProf, setNovoProf] = useState({ nome: "", especialidade: "", duracao_min: 30 });
  const [adicionandoProf, setAdicionandoProf] = useState(false);

  // Novo WhatsApp
  const [adicionandoWpp, setAdicionandoWpp] = useState(false);

  async function abrirEdicaoProf(prof: any) {
    setEditandoProf(prof);
    setHorariosProfModal(horariosPorProf[prof.id] || []);
  }

  async function salvarProf() {
    if (!editandoProf?.nome) {
      setErro("Nome do profissional é obrigatório.");
      return;
    }
    try {
      setSalvandoProf(true);
      const res = await fetch("/api/profissionais", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editandoProf.id,
          clinica_id: clinicaId,
          nome: editandoProf.nome,
          especialidade: editandoProf.especialidade,
          duracao_min: editandoProf.duracao_min,
          convenios: editandoProf.convenios ?? "",
          info: editandoProf.info ?? "",
          horarios: horariosProfModal,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErro(data.erro || "Erro ao salvar.");
      } else {
        setEditandoProf(null);
        setHorariosProfModal([]);
        setErro("");
        // Recarrega os dados
        window.location.reload();
      }
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar.");
    } finally {
      setSalvandoProf(false);
    }
  }

  async function deletarProf(profId: string) {
    if (!confirm("Remover este profissional?")) return;
    try {
      const res = await fetch("/api/profissionais", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profId, clinica_id: clinicaId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErro(data.erro || "Erro ao remover.");
      } else {
        window.location.reload();
      }
    } catch (e: any) {
      setErro(e?.message || "Erro ao remover.");
    }
  }

  async function adicionarNovoProf() {
    if (!novoProf.nome) {
      setErro("Nome do profissional é obrigatório.");
      return;
    }
    try {
      setAdicionandoProf(true);
      const res = await fetch("/api/profissionais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinica_id: clinicaId,
          nome: novoProf.nome,
          especialidade: novoProf.especialidade,
          duracao_min: novoProf.duracao_min,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErro(data.erro || "Erro ao adicionar.");
      } else {
        setNovoProf({ nome: "", especialidade: "", duracao_min: 30 });
        window.location.reload();
      }
    } catch (e: any) {
      setErro(e?.message || "Erro ao adicionar.");
    } finally {
      setAdicionandoProf(false);
    }
  }

  async function adicionarInstancia() {
    try {
      setAdicionandoWpp(true);
      const res = await fetch("/api/instancias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErro(data.erro || "Erro ao criar número.");
      } else {
        window.location.reload();
      }
    } catch (e: any) {
      setErro(e?.message || "Erro ao criar número.");
    } finally {
      setAdicionandoWpp(false);
    }
  }

  // remove de vez um numero de WhatsApp (logout + delete na uazapi + apaga do banco)
  const [removendoWpp, setRemovendoWpp] = useState<string | null>(null);
  async function removerInstancia(inst: any) {
    const rotulo = inst.numero || inst.uazapi_instance || "este número";
    if (!confirm(`Remover ${rotulo}? A IA para de atender nesse WhatsApp e o número sai da lista.`)) return;
    try {
      setRemovendoWpp(inst.id);
      setErro("");
      const res = await fetch("/api/instancias", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inst.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || "Erro ao remover número.");
      } else {
        // tira da lista na hora (sem reload — mais rapido e nao perde outras edicoes)
        setInstancias((atual) => atual.filter((i) => i.id !== inst.id));
      }
    } catch (e: any) {
      setErro(e?.message || "Erro ao remover número.");
    } finally {
      setRemovendoWpp(null);
    }
  }

  const TOPICOS = [
    { id: "dados", rotulo: "Dados da clínica" },
    { id: "tom-de-voz", rotulo: "Tom de voz" },
    { id: "materiais", rotulo: "Materiais da IA" },
    { id: "log", rotulo: "Log" },
    { id: "profissionais", rotulo: "Profissionais" },
    { id: "whatsapps", rotulo: "WhatsApp" },
  ];

  return (
    <main className="pagina">
      {/* INDICE LATERAL: clica e a pagina desce suave ate a secao (so telona) */}
      <nav className="indice-config" aria-label="Tópicos da configuração">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
          Nessa página
        </div>
        {TOPICOS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="indice-config-item">
            {t.rotulo}
          </a>
        ))}
      </nav>
      <h1 style={{ fontSize: 26, margin: 0, display: "flex", alignItems: "center", gap: 10 }}><span style={{ color: "var(--accent)", display: "grid", placeItems: "center" }}><IconeConfiguracoes /></span>Configurações</h1>
      <p style={{ color: "var(--muted)", marginTop: 4 }}>
        Dados da clínica, profissionais e números de WhatsApp — tudo do setup em um lugar.
      </p>

      {erro && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "var(--danger-bg)",
            borderRadius: 8,
            color: "var(--danger)",
          }}
        >
          {erro}
        </div>
      )}

      {/* ========== DADOS DA CLINICA (onboarding) ========== */}
      <div style={{ marginTop: 32 }}>
        <h2 id="dados" style={{ fontSize: 18, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, scrollMarginTop: 20 }}><span style={{ color: "var(--accent)", display: "grid", placeItems: "center" }}><IconeClinica /></span>Dados da clínica</h2>
        <div className="card" style={{ display: "grid", gap: 14 }}>
          <Campo rotulo="Nome da clínica">
            <input
              className="input"
              value={dados.nome}
              onChange={(e) => setDados({ ...dados, nome: e.target.value })}
              placeholder="Ex: Clínica ComTato"
            />
          </Campo>
          <Campo rotulo="Endereço">
            <input
              className="input"
              value={dados.endereco}
              onChange={(e) => setDados({ ...dados, endereco: e.target.value })}
              placeholder="Rua, número, bairro, cidade"
            />
          </Campo>
          <Campo rotulo="Convênios aceitos" dica="Separe por vírgula. A IA usa isso pra saber o que aceita.">
            <input
              className="input"
              value={dados.convenios}
              onChange={(e) => setDados({ ...dados, convenios: e.target.value })}
              placeholder="Ex: Unimed, Bradesco Saúde, particular"
            />
          </Campo>
          <Campo rotulo="Preços" dica="Texto livre. Ex: Consulta R$300, retorno grátis em 15 dias.">
            <textarea
              className="input"
              rows={2}
              value={dados.precos}
              onChange={(e) => setDados({ ...dados, precos: e.target.value })}
              placeholder="Consulta R$300, retorno grátis 15 dias"
            />
          </Campo>
          <Campo rotulo="Informações úteis / FAQ" dica="Tudo que a IA precisa saber pra responder o paciente.">
            <textarea
              className="input"
              rows={4}
              value={dados.faq}
              onChange={(e) => setDados({ ...dados, faq: e.target.value })}
              placeholder="Horário de funcionamento, estacionamento, o que levar, etc."
            />
          </Campo>
          <div id="tom-de-voz" style={{ scrollMarginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Tom de voz da IA</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
              Clica nos estilos (fica verde quando selecionado) e vê no exemplo ao lado como a IA
              vai falar. Tudo vira instrução direta: &quot;sem emojis&quot; = zero emoji, de verdade.
            </div>
            <TomDeVozEditor
              tom={dados.tom_de_voz}
              nivel={dados.msg_estilo}
              onTom={(t) => setDados({ ...dados, tom_de_voz: t })}
              onNivel={(n) => setDados({ ...dados, msg_estilo: n })}
            />
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                Instruções do tom (edita à vontade — os cliques acima reescrevem esse campo):
              </div>
              <input
                className="input"
                value={dados.tom_de_voz}
                onChange={(e) => setDados({ ...dados, tom_de_voz: e.target.value })}
                placeholder="ex: informal, acolhedor, sem emojis, curto"
                style={{ marginTop: 0 }}
              />
            </div>
          </div>

          <Campo rotulo="Nome da atendente virtual (IA)" dica={'A IA se apresenta com esse nome: "me chamo Larissa". Vazio = sem nome.'}>
            <input
              className="input"
              value={dados.nome_ia}
              onChange={(e) => setDados({ ...dados, nome_ia: e.target.value })}
              placeholder="ex: Larissa"
            />
          </Campo>
          <Campo
            rotulo="Guia de exames automática"
            dica="Quando a IA marcar consulta desse convênio, o sistema envia o arquivo da guia (PDF) direto no WhatsApp do paciente. Deixe vazio pra desligar."
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                className="input"
                value={dados.guia_exame_convenio}
                onChange={(e) => setDados({ ...dados, guia_exame_convenio: e.target.value })}
                placeholder="Convênio que dispara (ex: Uniodonto)"
                style={{ marginTop: 0, flex: "1 1 180px" }}
              />
              <input
                className="input"
                value={dados.guia_exame_url}
                onChange={(e) => setDados({ ...dados, guia_exame_url: e.target.value })}
                placeholder="URL do PDF da guia (https://...)"
                style={{ marginTop: 0, flex: "2 1 260px" }}
              />
            </div>
          </Campo>
          <Campo rotulo="Link do Google Reviews" dica="A IA manda esse link pra pedir avaliação depois da consulta.">
            <input
              className="input"
              value={dados.link_review}
              onChange={(e) => setDados({ ...dados, link_review: e.target.value })}
              placeholder="https://g.page/..."
            />
          </Campo>
          <Campo rotulo="WhatsApp do dono" dica="Recebe o relatório automático da IA (consultas marcadas, faltas evitadas). Com DDD, ex: 35999998888.">
            <input
              className="input"
              value={dados.telefone_dono}
              onChange={(e) => setDados({ ...dados, telefone_dono: e.target.value })}
              placeholder="35999998888"
            />
          </Campo>
          <Campo rotulo="Recall de retorno" dica="A IA chama sozinha o paciente pra remarcar depois desse tempo da última consulta.">
            <select
              className="input"
              value={dados.recall_meses}
              onChange={(e) => setDados({ ...dados, recall_meses: e.target.value })}
            >
              <option value="0">Desligado</option>
              <option value="3">Após 3 meses</option>
              <option value="6">Após 6 meses</option>
              <option value="12">Após 12 meses</option>
            </select>
          </Campo>
          <Campo rotulo="Oferta de horários" dica="Curta = dia mais próximo + 3 horários (menos cancelamento). Completa = lista vários dias.">
            <select
              className="input"
              value={dados.oferta_horarios}
              onChange={(e) => setDados({ ...dados, oferta_horarios: e.target.value })}
            >
              <option value="curta">Curta (recomendado)</option>
              <option value="completa">Completa</option>
            </select>
          </Campo>
          <Campo rotulo="E-mail de acesso ao painel" dica="O e-mail usado no login desta clínica. Trocar aqui muda o login (a senha continua a mesma).">
            <input
              className="input"
              type="email"
              value={dados.email_acesso}
              onChange={(e) => setDados({ ...dados, email_acesso: e.target.value })}
              placeholder="clinica@exemplo.com.br"
            />
          </Campo>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="btn-primario"
              style={{ padding: "10px 18px" }}
              onClick={salvarDadosClinica}
              disabled={salvandoDados}
            >
              {salvandoDados ? "Salvando..." : "Salvar dados da clínica"}
            </button>
            {salvouDados && <span style={{ color: "var(--ok)", fontSize: 14 }}>Salvo!</span>}
          </div>
        </div>
      </div>

      {/* ========== MATERIAIS DA IA ========== */}
      <div id="materiais" style={{ scrollMarginTop: 20 }}>
        <MateriaisSecao clinicaId={clinicaId} />
      </div>

      {/* ========== LOG DE ATIVIDADES ========== */}
      <div style={{ marginTop: 32 }}>
        <h2 id="log" style={{ fontSize: 18, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, scrollMarginTop: 20 }}><span style={{ color: "var(--accent)", display: "grid", placeItems: "center" }}><IconeLogArquivo /></span>Log</h2>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Log de atividades</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
              Toda movimentação da operação: atendimentos iniciados, consultas marcadas, alteradas e
              canceladas (com motivo), atendente assumindo conversa, lembretes enviados.
            </div>
          </div>
          <a href={`/painel/log?clinica=${clinicaId}`} className="btn-primario" style={{ padding: "9px 16px", fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>
            ver o log →
          </a>
        </div>
      </div>

      {/* ========== PROFISSIONAIS ========== */}
      <div style={{ marginTop: 32 }}>
        <h2 id="profissionais" style={{ fontSize: 18, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, scrollMarginTop: 20 }}><span style={{ color: "var(--accent)", display: "grid", placeItems: "center" }}><IconeProfissionais /></span>Profissionais</h2>

        {profissionais.length === 0 ? (
          <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: 32 }}>
            Nenhum profissional cadastrado.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
            {profissionais.map((prof) => (
              <div key={prof.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{prof.nome}</div>
                    <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                      {prof.especialidade || "Sem especialidade"} · {prof.duracao_min} min
                    </div>
                    {/* Vinculo do Google Agenda desse medico */}
                    <div style={{ marginTop: 8 }}>
                      {(prof.gcal_conectado === true || prof.gcal_conectado === 1) ? (
                        <span style={{ fontSize: 12, color: "var(--ok)" }}>
                          Google Agenda conectado{prof.gcal_email ? ` (${prof.gcal_email})` : ""}
                        </span>
                      ) : (
                        <a
                          href={`/api/gcal/conectar?prof=${prof.id}`}
                          className="btn-fantasma"
                          style={{ padding: "5px 10px", fontSize: 12, textDecoration: "none", display: "inline-block" }}
                        >
                          Conectar Google Agenda
                        </a>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => abrirEdicaoProf(prof)}
                      className="btn-fantasma"
                      style={{ padding: "6px 12px", fontSize: 13 }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => deletarProf(prof.id)}
                      className="btn-fantasma"
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        color: "var(--danger)",
                        borderColor: "var(--danger)",
                      }}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Adicionar novo profissional */}
        <div className="card" style={{ background: "var(--bg)" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>+ Novo profissional</div>
          <label className="rotulo">Nome *</label>
          <input
            className="input"
            value={novoProf.nome}
            onChange={(e) => setNovoProf({ ...novoProf, nome: e.target.value })}
            placeholder="Dr. João"
          />
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            <div style={{ flex: 2 }}>
              <label className="rotulo">Especialidade</label>
              <input
                className="input"
                value={novoProf.especialidade}
                onChange={(e) => setNovoProf({ ...novoProf, especialidade: e.target.value })}
                placeholder="Cardiologista"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="rotulo">Duração (min)</label>
              <input
                className="input"
                type="number"
                value={novoProf.duracao_min}
                onChange={(e) => setNovoProf({ ...novoProf, duracao_min: Number(e.target.value) })}
              />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            Horários: padrão seg-sex 08-12 e 14-18 (edita depois)
          </div>
          <button
            onClick={adicionarNovoProf}
            disabled={!novoProf.nome || adicionandoProf}
            className="btn-primario"
            style={{ width: "100%", marginTop: 16, padding: 12 }}
          >
            {adicionandoProf ? "Adicionando..." : "Adicionar profissional"}
          </button>
        </div>
      </div>

      {/* ========== NUMEROS DE WHATSAPP ========== */}
      <div style={{ marginTop: 32 }}>
        <h2 id="whatsapps" style={{ fontSize: 18, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, scrollMarginTop: 20 }}><span style={{ color: "var(--accent)", display: "grid", placeItems: "center" }}><IconeWhatsApp /></span>Números de WhatsApp</h2>

        {instancias.length === 0 ? (
          <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: 32 }}>
            Nenhum WhatsApp conectado.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
            {instancias.map((inst) => {
              const conectado = inst.status === "conectado" || inst.status === "connected" || inst.status === "open";
              return (
                <div key={inst.id} className="card">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>
                        {inst.numero || inst.uazapi_instance || "Sem número"}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          marginTop: 4,
                          color: conectado ? "var(--ok)" : "var(--muted)",
                          fontWeight: 500,
                        }}
                      >
                        {conectado ? "Conectado" : "Desconectado"}
                      </div>
                    </div>
                    {/* &instancia=ID: gera o QR DESTE numero (sem isso, caia
                        sempre no primeiro da lista e reconectava o errado) */}
                    <a
                      href={`/painel/conectar?clinica=${clinicaId}&instancia=${inst.id}`}
                      className="btn-fantasma"
                      style={{ padding: "8px 14px", fontSize: 13 }}
                    >
                      {conectado ? "Gerenciar" : "Conectar"}
                    </a>
                    <button
                      onClick={() => removerInstancia(inst)}
                      disabled={removendoWpp === inst.id}
                      className="btn-fantasma"
                      style={{
                        padding: "8px 14px",
                        fontSize: 13,
                        color: "var(--danger)",
                        borderColor: "var(--danger)",
                      }}
                    >
                      {removendoWpp === inst.id ? "Removendo..." : "Remover"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={adicionarInstancia}
          disabled={adicionandoWpp}
          className="btn-primario"
          style={{ width: "100%", padding: 12 }}
        >
          {adicionandoWpp ? "Adicionando..." : "+ Adicionar número de WhatsApp"}
        </button>
      </div>

      {/* ========== MODAL: EDITAR PROFISSIONAL ========== */}
      {editandoProf && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 50,
          }}
          onClick={() => {
            setEditandoProf(null);
            setHorariosProfModal([]);
          }}
        >
          <div
            className="card"
            style={{ maxWidth: 500, maxHeight: "90vh", overflow: "auto", padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Editar: {editandoProf.nome}</h3>

            <label className="rotulo">Nome</label>
            <input
              className="input"
              value={editandoProf.nome}
              onChange={(e) => setEditandoProf({ ...editandoProf, nome: e.target.value })}
            />

            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <div style={{ flex: 2 }}>
                <label className="rotulo">Especialidade</label>
                <input
                  className="input"
                  value={editandoProf.especialidade || ""}
                  onChange={(e) => setEditandoProf({ ...editandoProf, especialidade: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="rotulo">Duração (min)</label>
                <input
                  className="input"
                  type="number"
                  value={editandoProf.duracao_min}
                  onChange={(e) => setEditandoProf({ ...editandoProf, duracao_min: Number(e.target.value) })}
                />
              </div>
            </div>

            <label className="rotulo" style={{ marginTop: 12 }}>Convênios que ESSE profissional atende</label>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
              Separe por vírgula. Vazio = valem os convênios gerais da clínica.
            </div>
            <input
              className="input"
              value={editandoProf.convenios || ""}
              onChange={(e) => setEditandoProf({ ...editandoProf, convenios: e.target.value })}
              placeholder="Ex: Unimed, Bradesco Saúde"
            />

            <label className="rotulo" style={{ marginTop: 12 }}>Informações do profissional</label>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
              O que atende, o que NÃO atende, restrições, público (a IA usa isso nas conversas).
            </div>
            <textarea
              className="input"
              rows={3}
              value={editandoProf.info || ""}
              onChange={(e) => setEditandoProf({ ...editandoProf, info: e.target.value })}
              placeholder="Ex: atende adultos e crianças a partir de 8 anos; não faz laudo para cirurgia; especialista em distúrbios do sono"
            />

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Horários de funcionamento</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                Dias da semana e turnos disponíveis pra agendamento.
              </div>

              {DIAS_SEMANA.map((dia) => {
                const horas_dia = horariosProfModal.filter((h) => h.dia_semana === dia.num);
                return (
                  <div key={dia.num} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 500, marginBottom: 8 }}>{dia.nome}</div>
                    {horas_dia.length === 0 ? (
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>Sem horários</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {horas_dia.map((h) => (
                          <div key={h.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              className="input"
                              type="time"
                              value={h.hora_inicio}
                              onChange={(e) => {
                                const updated = horariosProfModal.map((x) =>
                                  x.id === h.id ? { ...x, hora_inicio: e.target.value } : x
                                );
                                setHorariosProfModal(updated);
                              }}
                              style={{ flex: 1, marginTop: 0 }}
                            />
                            <span>até</span>
                            <input
                              className="input"
                              type="time"
                              value={h.hora_fim}
                              onChange={(e) => {
                                const updated = horariosProfModal.map((x) =>
                                  x.id === h.id ? { ...x, hora_fim: e.target.value } : x
                                );
                                setHorariosProfModal(updated);
                              }}
                              style={{ flex: 1, marginTop: 0 }}
                            />
                            <button
                              onClick={() => {
                                setHorariosProfModal(horariosProfModal.filter((x) => x.id !== h.id));
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--danger)",
                                cursor: "pointer",
                                fontSize: 18,
                              }}
                            >
                              <IconeLixeira size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setHorariosProfModal([
                          ...horariosProfModal,
                          { id: Math.random().toString(), dia_semana: dia.num, hora_inicio: "09:00", hora_fim: "12:00" },
                        ]);
                      }}
                      style={{
                        marginTop: 8,
                        background: "transparent",
                        border: "none",
                        color: "var(--link)",
                        cursor: "pointer",
                        fontSize: 13,
                        padding: 0,
                      }}
                    >
                      + Adicionar turno
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => {
                  setEditandoProf(null);
                  setHorariosProfModal([]);
                }}
                className="btn-fantasma"
                style={{ flex: 1, padding: 12 }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarProf}
                disabled={salvandoProf || !editandoProf.nome}
                className="btn-primario"
                style={{ flex: 1, padding: 12 }}
              >
                {salvandoProf ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra fixa de salvar — aparece no rodape quando ha alteracao nao salva
          nos dados da clinica, pra salvar sem voltar la pra cima. */}
      {dadosAlterados && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <span style={{ color: erro ? "var(--danger)" : "var(--muted)", fontSize: 14, marginRight: "auto", fontWeight: erro ? 600 : 400 }}>
            {erro
              ? `${erro} — as alterações NÃO foram salvas.`
              : "Você tem alterações não salvas nos dados da clínica."}
          </span>
          <button
            className="btn-fantasma"
            onClick={() => {
              if (confirm("Descartar as alterações não salvas?")) setDados(dadosIniciais);
            }}
            disabled={salvandoDados}
            style={{ padding: "10px 16px" }}
          >
            Descartar
          </button>
          <button
            className="btn-primario"
            onClick={salvarDadosClinica}
            disabled={salvandoDados}
            style={{ padding: "10px 20px" }}
          >
            {salvandoDados ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      )}
    </main>
  );
}

// Campo de formulario com rotulo e dica opcional (usado na secao de dados da clinica)
function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{rotulo}</div>
      {dica && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{dica}</div>}
      {children}
    </label>
  );
}
