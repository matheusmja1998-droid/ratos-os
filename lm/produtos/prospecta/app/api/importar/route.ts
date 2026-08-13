export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { upsertLead, sb } from "@/lib/db";

function parseCSV(texto: string): string[][] {
  const linhas: string[][] = [];
  let atual: string[] = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === "," || c === ";") { atual.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      atual.push(campo); campo = "";
      if (atual.some((x) => x.trim())) linhas.push(atual);
      atual = [];
    } else campo += c;
  }
  if (campo || atual.length) { atual.push(campo); if (atual.some((x) => x.trim())) linhas.push(atual); }
  return linhas;
}

export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("csv") as File | null;
  if (!file) return NextResponse.json({ erro: "arquivo não veio" }, { status: 400 });
  const texto = await file.text();
  const linhas = parseCSV(texto);
  if (linhas.length < 2) return NextResponse.json({ erro: "csv vazio" }, { status: 400 });

  const header = linhas[0].map((h) => h.trim().toLowerCase());
  const col = (...nomes: string[]) => header.findIndex((h) => nomes.includes(h));
  const iNome = col("nome", "title", "name", "nome_empresa", "empresa");
  const iTel = col("telefone", "phone", "whatsapp", "phoneunformatted");
  const iCidade = col("cidade", "city");
  const iSite = col("site", "website", "url");
  const iNicho = col("nicho", "categoryname", "categoria");
  if (iTel === -1) return NextResponse.json({ erro: `coluna de telefone não achada. cabeçalhos: ${header.join(", ")}` }, { status: 400 });

  const origem = (form.get("origem") as string) || file.name || "csv";
  let novos = 0, repetidos = 0, semTel = 0;
  for (const l of linhas.slice(1)) {
    let tel = String(l[iTel] || "").replace(/\D/g, "");
    if (!tel) { semTel++; continue; }
    if (tel.length <= 11 && !tel.startsWith("55")) tel = "55" + tel;
    const { count: antes } = await sb.from("leads").select("id", { count: "exact", head: true }).eq("conta_id", s.contaId);
    await upsertLead(s.contaId, {
      nome_empresa: l[iNome] || "Empresa", telefone: tel,
      cidade: iCidade >= 0 ? l[iCidade] : null, site: iSite >= 0 ? l[iSite] : null,
      nicho: iNicho >= 0 ? l[iNicho] : null, origem_lista: origem,
    });
    const { count: depois } = await sb.from("leads").select("id", { count: "exact", head: true }).eq("conta_id", s.contaId);
    (depois || 0) > (antes || 0) ? novos++ : repetidos++;
  }
  return NextResponse.json({ ok: true, novos, repetidos, semTel });
}
