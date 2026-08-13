import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELO } from "@/lib/claude";
import { criarMaterial, listMateriais, getMaterial, removerMaterial, atualizarMaterial, registrarLog } from "@/lib/db";
import { clinicaPermitida } from "@/lib/sessao";

// Materiais da clinica: PDFs/textos que viram CONHECIMENTO da IA.
// O PDF e convertido pra TEXTO no upload (via IA, uma vez so) e apenas o texto
// fica no banco — o prompt da clinica passa a incluir esse conteudo.

export const maxDuration = 60; // extracao de PDF grande pode demorar
const MAX_PDF_BYTES = 8 * 1024 * 1024;

// GET /api/materiais?clinica=ID       → lista os materiais (só preview)
// GET /api/materiais?id=MATERIAL_ID    → conteúdo COMPLETO de 1 material (pra editar)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // buscar 1 material completo (editar): isolamento pela clinica do material
  const id = searchParams.get("id");
  if (id) {
    const m = await getMaterial(id);
    if (!m) return NextResponse.json({ erro: "material não encontrado" }, { status: 404 });
    const permitida = await clinicaPermitida(m.clinica_id);
    if (!permitida || permitida !== m.clinica_id) {
      return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
    }
    return NextResponse.json({ material: { id: m.id, nome: m.nome, conteudo: m.conteudo || "" } });
  }

  const permitida = await clinicaPermitida(searchParams.get("clinica"));
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  const materiais = await listMateriais(permitida);
  // nao manda o conteudo inteiro pra tela (pode ser grande) — so um preview
  return NextResponse.json({
    materiais: materiais.map((m: any) => ({
      id: m.id,
      nome: m.nome,
      preview: String(m.conteudo || "").slice(0, 160),
      tamanho: String(m.conteudo || "").length,
      criado_em: m.criado_em,
    })),
  });
}

// POST /api/materiais — sobe um material.
// Body: { clinica_id, nome, texto? , pdf_base64? } (um dos dois)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const nome = String(body.nome || "material").slice(0, 120);
  let conteudo = "";

  if (body.texto) {
    conteudo = String(body.texto);
  } else if (body.pdf_base64) {
    const b64 = String(body.pdf_base64).split(",").pop() as string; // aceita data URI
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES) {
      return NextResponse.json({ erro: "PDF vazio ou maior que 8MB" }, { status: 400 });
    }
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return NextResponse.json({ erro: "arquivo não é um PDF válido" }, { status: 400 });
    }
    try {
      const resp = await anthropic.messages.create({
        model: MODELO,
        max_tokens: 4000,
        system:
          "Extraia o conteudo util deste documento de uma clinica (tabelas de precos, lista de exames/procedimentos, orientacoes de preparo, convenios, regras). Devolva em texto corrido/topicos, completo e fiel, sem comentarios seus.",
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
              { type: "text", text: "Extraia o conteudo util." },
            ],
          },
        ],
      });
      conteudo = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    } catch (e: any) {
      console.error("[materiais] extracao de PDF falhou:", e.message);
      return NextResponse.json({ erro: "não consegui ler esse PDF. Tenta de novo ou cola o conteúdo como texto." }, { status: 502 });
    }
  }

  if (!conteudo.trim()) {
    return NextResponse.json({ erro: "material vazio (manda um PDF ou o texto)" }, { status: 400 });
  }

  const material = await criarMaterial({ clinica_id: permitida, nome, conteudo });
  await registrarLog(permitida, "sistema", `📚 Material adicionado à IA: ${nome}`);
  return NextResponse.json({ ok: true, id: material.id });
}

// PATCH /api/materiais — edita um material de TEXTO. Body: { id, nome?, texto? }
// So texto: PDF vira texto no upload, entao editar aqui e sempre texto.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const m = await getMaterial(String(body.id || ""));
  if (!m) return NextResponse.json({ erro: "material não encontrado" }, { status: 404 });
  const permitida = await clinicaPermitida(m.clinica_id);
  if (!permitida || permitida !== m.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  const nome = body.nome !== undefined ? String(body.nome).slice(0, 120) : undefined;
  const texto = body.texto !== undefined ? String(body.texto) : undefined;
  if (texto !== undefined && !texto.trim()) {
    return NextResponse.json({ erro: "o material não pode ficar vazio" }, { status: 400 });
  }
  await atualizarMaterial(m.id, {
    ...(nome !== undefined ? { nome } : {}),
    ...(texto !== undefined ? { conteudo: texto } : {}),
  });
  await registrarLog(permitida, "sistema", `✏️ Material editado na IA: ${nome || m.nome}`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/materiais — remove um material. Body: { id }
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const m = await getMaterial(String(body.id || ""));
  if (!m) return NextResponse.json({ erro: "material não encontrado" }, { status: 404 });
  const permitida = await clinicaPermitida(m.clinica_id);
  if (!permitida || permitida !== m.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  await removerMaterial(m.id);
  await registrarLog(permitida, "sistema", `🗑 Material removido da IA: ${m.nome}`);
  return NextResponse.json({ ok: true });
}
