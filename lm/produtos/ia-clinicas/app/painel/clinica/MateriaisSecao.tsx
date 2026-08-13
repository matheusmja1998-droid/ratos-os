"use client";

import { useEffect, useState } from "react";
import { IconeDocumento } from "../Icones";

// Materiais da IA: PDFs e textos da clinica (tabela de precos, lista de exames,
// preparos, regras) que viram CONHECIMENTO da IA nas conversas. O PDF e
// convertido pra texto no upload (uma vez) e a IA passa a responder com base nele.

type Material = { id: string; nome: string; preview: string; tamanho: number; criado_em: string };

export default function MateriaisSecao({ clinicaId }: { clinicaId: string }) {
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [textoColado, setTextoColado] = useState("");
  const [nomeTexto, setNomeTexto] = useState("");
  // edição inline de um material já salvo
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editTexto, setEditTexto] = useState("");
  const [carregandoEdit, setCarregandoEdit] = useState(false);

  async function carregar() {
    try {
      const res = await fetch(`/api/materiais?clinica=${clinicaId}`);
      const j = await res.json();
      setMateriais(j.materiais || []);
    } catch {
      /* mostra vazio */
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId]);

  async function subirPdf(file: File) {
    setErro("");
    if (file.size > 8 * 1024 * 1024) {
      setErro("PDF maior que 8MB. Divide o arquivo ou cola o conteúdo como texto.");
      return;
    }
    setEnviando(true);
    try {
      const b64: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/materiais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinica_id: clinicaId, nome: file.name, pdf_base64: b64 }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "falha no upload");
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "erro no upload");
    } finally {
      setEnviando(false);
    }
  }

  async function subirTexto() {
    if (!textoColado.trim()) return;
    setErro("");
    setEnviando(true);
    try {
      const res = await fetch("/api/materiais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinica_id: clinicaId,
          nome: nomeTexto.trim() || "Texto colado",
          texto: textoColado,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "falha ao salvar");
      setTextoColado("");
      setNomeTexto("");
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "erro ao salvar");
    } finally {
      setEnviando(false);
    }
  }

  // abre o editor: busca o conteúdo COMPLETO (a lista só tem preview)
  async function abrirEdicao(id: string, nome: string) {
    setErro("");
    setEditandoId(id);
    setEditNome(nome);
    setEditTexto("");
    setCarregandoEdit(true);
    try {
      const res = await fetch(`/api/materiais?id=${id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "não consegui abrir");
      setEditTexto(j.material?.conteudo || "");
    } catch (e: any) {
      setErro(e?.message || "erro ao abrir o material");
      setEditandoId(null);
    } finally {
      setCarregandoEdit(false);
    }
  }

  async function salvarEdicao() {
    if (!editandoId || !editTexto.trim()) return;
    setErro("");
    setEnviando(true);
    try {
      const res = await fetch("/api/materiais", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editandoId, nome: editNome.trim() || undefined, texto: editTexto }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.erro || "falha ao salvar");
      setEditandoId(null);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "erro ao salvar");
    } finally {
      setEnviando(false);
    }
  }

  async function remover(id: string) {
    if (!confirm("Remover esse material? A IA deixa de usar ele nas respostas.")) return;
    await fetch("/api/materiais", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await carregar();
  }

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>Materiais da IA</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0, marginBottom: 12 }}>
        Suba PDFs ou cole textos (tabela de preços, lista de exames, preparos, regras). A IA passa a
        usar esse conteúdo pra responder os pacientes.
      </p>

      {erro && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>
          {erro}
        </div>
      )}

      <div className="card" style={{ display: "grid", gap: 14 }}>
        {/* lista */}
        {carregando ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>carregando...</div>
        ) : materiais.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Nenhum material ainda.</div>
        ) : (
          materiais.map((m) =>
            editandoId === m.id ? (
              // EDITOR INLINE do material
              <div key={m.id} style={{ display: "grid", gap: 8, padding: "12px", background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 10 }}>
                <input
                  className="input"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  placeholder="Nome do material"
                  style={{ marginTop: 0, fontWeight: 600 }}
                />
                <textarea
                  className="input"
                  rows={8}
                  value={editTexto}
                  onChange={(e) => setEditTexto(e.target.value)}
                  placeholder={carregandoEdit ? "carregando conteúdo..." : "conteúdo do material"}
                  disabled={carregandoEdit}
                  style={{ marginTop: 0, fontFamily: "inherit", lineHeight: 1.5 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primario" onClick={salvarEdicao} disabled={enviando || carregandoEdit || !editTexto.trim()} style={{ padding: "8px 16px", fontSize: 13 }}>
                    {enviando ? "salvando..." : "salvar alterações"}
                  </button>
                  <button className="btn-fantasma" onClick={() => setEditandoId(null)} disabled={enviando} style={{ padding: "8px 14px", fontSize: 13 }}>
                    cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div key={m.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <span style={{ display: "grid", placeItems: "center", color: "var(--muted)" }}><IconeDocumento size={19} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.nome}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.preview}
                  </div>
                </div>
                <button className="btn-fantasma" onClick={() => abrirEdicao(m.id, m.nome)} style={{ padding: "5px 10px", fontSize: 12, flexShrink: 0 }}>
                  editar
                </button>
                <button className="btn-fantasma" onClick={() => remover(m.id)} style={{ padding: "5px 10px", fontSize: 12, color: "var(--danger)", borderColor: "var(--danger)", flexShrink: 0 }}>
                  remover
                </button>
              </div>
            )
          )
        )}

        {/* upload PDF */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <label className="btn-primario" style={{ padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
            {enviando ? "Enviando..." : "Subir PDF"}
            <input
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              disabled={enviando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) subirPdf(f);
                e.target.value = "";
              }}
            />
          </label>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>até 8MB · o conteúdo é lido e vira conhecimento da IA</span>
        </div>

        {/* ou colar texto */}
        <div style={{ display: "grid", gap: 8 }}>
          <input
            className="input"
            value={nomeTexto}
            onChange={(e) => setNomeTexto(e.target.value)}
            placeholder="Nome do material (ex: Preparo dos exames)"
            style={{ marginTop: 0 }}
          />
          <textarea
            className="input"
            rows={3}
            value={textoColado}
            onChange={(e) => setTextoColado(e.target.value)}
            placeholder="...ou cola aqui o conteúdo como texto"
            style={{ marginTop: 0 }}
          />
          <div>
            <button className="btn-fantasma" onClick={subirTexto} disabled={enviando || !textoColado.trim()} style={{ padding: "8px 14px", fontSize: 13 }}>
              salvar texto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
