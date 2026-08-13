"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const COLS: [string, string][] = [
  ["novo", "Novos"], ["disparado", "Disparados"], ["respondeu", "Responderam"],
  ["em_conversa", "Em conversa"], ["decisor", "Contato c/ decisor"],
  ["reuniao_marcada", "Reunião marcada"], ["cliente", "Fechados"], ["perdido", "Perdidos"], ["sem_whatsapp", "Sem WhatsApp"],
];

export default function Operacional() {
  const [aba, setAba] = useState<"pipeline" | "conversas" | "campanhas">("pipeline");
  const [leads, setLeads] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [conv, setConv] = useState<any | null>(null);
  const [texto, setTexto] = useState("");

  async function carregar() { setLeads(await (await fetch("/api/leads")).json()); }
  useEffect(() => { carregar(); const t = setInterval(carregar, 12000); return () => clearInterval(t); }, []);

  const filtra = (l: any) => {
    if (!busca) return true;
    const b = busca.toLowerCase(), dig = busca.replace(/\D/g, "");
    return (l.nome_empresa || "").toLowerCase().includes(b) || (l.nome_contato || "").toLowerCase().includes(b) ||
      (dig && (l.telefone || "").includes(dig));
  };
  const vis = leads.filter(filtra);

  async function abrir(id: string) { setConv(await (await fetch("/api/lead/" + id)).json()); }
  async function enviar() {
    if (!texto.trim() || !conv) return;
    await fetch(`/api/lead/${conv.lead.id}/mensagem`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
    setTexto(""); abrir(conv.lead.id); carregar();
  }
  async function toggleIA(pausar: boolean) {
    await fetch(`/api/lead/${conv.lead.id}/ia`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pausar }) });
    setTimeout(() => { abrir(conv.lead.id); carregar(); }, pausar ? 0 : 3000);
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href="/painel" style={{ color: "#6cc24a", textDecoration: "none" }}>← painel</Link>
        <nav style={{ display: "flex", gap: 4 }}>
          {(["pipeline", "conversas", "campanhas"] as const).map((a) => (
            <button key={a} onClick={() => setAba(a)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              background: aba === a ? "#1f3d2a" : "transparent", color: aba === a ? "#6cc24a" : "#9aa4bd", fontWeight: aba === a ? 700 : 400 }}>{a}</button>
          ))}
        </nav>
      </header>

      {aba === "pipeline" && (
        <>
          <input placeholder="🔍 buscar por empresa, telefone ou contato" value={busca} onChange={(e) => setBusca(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", marginBottom: 12, borderRadius: 8, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5" }} />
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 12 }}>
            {COLS.map(([st, rot]) => {
              const doStatus = vis.filter((l) => l.status === st);
              return (
                <div key={st} style={{ minWidth: 220, width: 220, flex: "0 0 auto", background: "#0f1424", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#8b93a7", marginBottom: 8 }}>{rot} <b style={{ color: "#6cc24a" }}>{doStatus.length}</b></div>
                  {doStatus.slice(0, 40).map((l) => (
                    <div key={l.id} onClick={() => { setAba("conversas"); abrir(l.id); }} style={{ background: "#141a2e", border: "1px solid #232b45", borderRadius: 8, padding: "8px 10px", marginBottom: 6, cursor: "pointer", fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{l.nome_empresa}</div>
                      <div style={{ fontSize: 11.5, color: "#8b93a7" }}>📱 {l.telefone}{l.nome_contato ? " · " + l.nome_contato : ""}</div>
                      {l.ultima_msg && <div style={{ marginTop: 5, fontSize: 11.5, color: "#8b93a7", borderLeft: `2px solid ${l.ultima_role === "user" ? "#4a9eff" : "#6cc24a"}`, paddingLeft: 6 }}>
                        <b style={{ color: l.ultima_role === "user" ? "#4a9eff" : "#6cc24a" }}>{l.ultima_role === "user" ? "lead" : "eu"}:</b> {String(l.ultima_msg).slice(0, 60)}</div>}
                      {l.ia_pausada ? <span style={{ fontSize: 10.5, color: "#f0c674" }}>🙋 humano</span> : null}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {aba === "conversas" && (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, height: "calc(100vh - 130px)" }}>
          <div style={{ overflowY: "auto", background: "#0f1424", borderRadius: 10, padding: 8 }}>
            {leads.filter((l) => l.status !== "novo").map((l) => (
              <div key={l.id} onClick={() => abrir(l.id)} style={{ padding: "9px 10px", borderRadius: 8, cursor: "pointer", background: conv?.lead?.id === l.id ? "#1f3d2a" : "transparent" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.ia_pausada ? "🙋 " : ""}{l.nome_empresa}</div>
                <div style={{ fontSize: 11.5, color: "#8b93a7" }}>{l.telefone} · {l.status}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#141a2e", border: "1px solid #232b45", borderRadius: 10, display: "flex", flexDirection: "column" }}>
            {!conv ? <div style={{ margin: "auto", color: "#8b93a7" }}>escolhe uma conversa</div> : (
              <>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #232b45", display: "flex", alignItems: "center", gap: 10 }}>
                  <b>{conv.lead.nome_empresa}</b>
                  <span style={{ fontSize: 12, color: "#8b93a7" }}>{conv.lead.telefone}</span>
                  <button onClick={() => toggleIA(!conv.lead.ia_pausada)} style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 7, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 12, cursor: "pointer" }}>
                    {conv.lead.ia_pausada ? "🤖 devolver pra IA" : "🙋 assumir"}</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 5 }}>
                  {conv.mensagens.map((m: any, i: number) => (
                    <div key={i} style={{ alignSelf: m.role === "user" ? "flex-start" : "flex-end", maxWidth: "76%", padding: "7px 11px", borderRadius: 11, fontSize: 13.5, whiteSpace: "pre-wrap", background: m.role === "user" ? "#232b45" : "#1f3d2a" }}>{m.texto}</div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #232b45" }}>
                  <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()} placeholder="responder (pausa a IA)"
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5" }} />
                  <button onClick={enviar} style={{ padding: "0 16px", borderRadius: 8, border: "none", background: "#6cc24a", color: "#0b1020", fontWeight: 700, cursor: "pointer" }}>Enviar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {aba === "campanhas" && <Campanhas onImport={carregar} />}
    </div>
  );
}

function Campanhas({ onImport }: { onImport: () => void }) {
  const [camps, setCamps] = useState<any[]>([]);
  const [dispHoje, setDispHoje] = useState(0);
  const [nome, setNome] = useState("");
  const [aberturas, setAberturas] = useState("Oi, tudo bem? Aqui é o {nome_empresa}... quer dizer, sou eu. Posso te fazer uma pergunta rápida?");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");

  async function carregar() { const d = await (await fetch("/api/campanhas")).json(); setCamps(d.campanhas || []); setDispHoje(d.disparados_hoje || 0); }
  useEffect(() => { carregar(); }, []);

  async function criar() {
    if (!nome) return;
    await fetch("/api/campanhas", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, aberturas: aberturas.split("\n").map((s) => s.trim()).filter(Boolean) }) });
    setNome(""); carregar();
  }
  async function patch(id: string, body: any) { await fetch("/api/campanha/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); carregar(); }
  async function importar() {
    if (!file) return;
    setMsg("importando…");
    const fd = new FormData(); fd.append("csv", file);
    const d = await (await fetch("/api/importar", { method: "POST", body: fd })).json();
    setMsg(d.ok ? `✅ ${d.novos} novos · ${d.repetidos} repetidos · ${d.semTel} sem telefone` : "erro: " + d.erro);
    onImport();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={{ background: "#141a2e", border: "1px solid #232b45", borderRadius: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Nova campanha</h3>
        <input placeholder="nome da campanha" value={nome} onChange={(e) => setNome(e.target.value)} style={inp} />
        <label style={lbl}>Mensagens de abertura (1 por linha, usa {"{nome_empresa}"} e {"{cidade}"})</label>
        <textarea rows={4} value={aberturas} onChange={(e) => setAberturas(e.target.value)} style={inp} />
        <button onClick={criar} style={btn}>Criar campanha</button>
      </div>
      <div style={{ background: "#141a2e", border: "1px solid #232b45", borderRadius: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Importar leads (CSV)</h3>
        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ color: "#9aa4bd" }} />
        <button onClick={importar} style={{ ...btn, marginTop: 10 }}>Importar</button>
        <div style={{ fontSize: 13, color: "#8b93a7", marginTop: 8 }}>{msg}</div>
        <hr style={{ border: "none", borderTop: "1px solid #232b45", margin: "16px 0" }} />
        <h3 style={{ margin: "0 0 8px" }}>Campanhas · hoje {dispHoje} disparos</h3>
        {camps.map((c) => (
          <div key={c.id} style={{ border: "1px solid #232b45", borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <b>{c.nome}</b> <span style={{ fontSize: 12, color: "#6cc24a" }}>{c.status}</span>
            <div style={{ fontSize: 12.5, color: "#8b93a7" }}>{c.disparados}/{c.total_leads} disparados · teto {c.teto_dia}/dia</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {c.status !== "ativa" ? <button style={mini} onClick={() => patch(c.id, { status: "ativa" })}>▶ ativar</button> : <button style={mini} onClick={() => patch(c.id, { status: "pausada" })}>⏸ pausar</button>}
              <button style={mini} onClick={() => patch(c.id, { vincular: true }).then(() => alert("leads vinculados"))}>+ vincular leads novos</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 12px", marginBottom: 10, borderRadius: 8, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontFamily: "inherit", fontSize: 14 };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "#9aa4bd", margin: "4px 0" };
const btn: React.CSSProperties = { padding: "9px 16px", borderRadius: 8, border: "none", background: "#6cc24a", color: "#0b1020", fontWeight: 700, cursor: "pointer" };
const mini: React.CSSProperties = { padding: "5px 10px", borderRadius: 7, border: "1px solid #2a3350", background: "#0f1424", color: "#e8ecf5", fontSize: 12, cursor: "pointer" };
