import { NextRequest, NextResponse } from "next/server";
import {
  getClinica,
  upsertClinica,
  listProfissionais,
  vincularKlingoProfissional,
  upsertProfissional,
  setHorarios,
  registrarLog,
} from "@/lib/db";
import { validarKlingo, listarProfissionaisKlingo } from "@/lib/klingo";
import { clinicaPermitida } from "@/lib/sessao";

// Integracao Klingo (gestao de unidades de saude). A UNICA credencial e o
// X-APP-TOKEN — o cliente cola o token e a agenda conecta sozinha.
// ISOLAMENTO: a conta so opera a propria clinica.

// GET /api/klingo?clinica=ID → status da conexao (NUNCA devolve o token).
export async function GET(req: NextRequest) {
  const clinicaId = await clinicaPermitida(req.nextUrl.searchParams.get("clinica"));
  if (!clinicaId) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const clinica = await getClinica(clinicaId);
  const conectado = Boolean(clinica?.klingo_app_token);

  const profs = await listProfissionais(clinicaId);
  const mapeamento = profs.map((p: any) => ({
    id: p.id,
    nome: p.nome,
    klingo_professional_id: p.klingo_professional_id || "",
  }));

  let profissionais: { id: string; nome: string; especialidade: string; crm: string }[] = [];
  if (conectado) {
    profissionais = await listarProfissionaisKlingo(clinica).catch(() => []);
  }
  return NextResponse.json({
    conectado,
    cnes: clinica?.klingo_cnes || "",
    especialidade: clinica?.klingo_especialidade || "",
    profissionais, // profissionais no Klingo
    mapeamento, // profissionais do Facilita + vinculo atual
  });
}

// POST /api/klingo → salva o token. Valida ANTES de salvar.
// Body: { clinica_id, token, cnes?, especialidade? }. Token vazio no update = mantem.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId || clinicaId !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  const clinica = await getClinica(clinicaId);
  const token = String(body.token || "").trim() || clinica?.klingo_app_token || "";
  if (!token) {
    return NextResponse.json({ erro: "cole o token da Klingo (X-APP-TOKEN)" }, { status: 400 });
  }

  const v = await validarKlingo(token);
  if (!v.ok) {
    return NextResponse.json({ erro: `Klingo recusou: ${v.erro}` }, { status: 400 });
  }

  await upsertClinica({
    id: clinicaId,
    klingo_app_token: token,
    klingo_cnes: String(body.cnes || "").trim() || null,
    klingo_especialidade: String(body.especialidade || "").trim() || null,
  });

  return NextResponse.json({ ok: true, profissionais: v.profissionais ?? 0 });
}

// PATCH /api/klingo → salva o de-para dos profissionais.
// Body: { clinica_id, mapeamento: [{ id, klingo_professional_id, crm? }] }.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId || clinicaId !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  if (!Array.isArray(body.mapeamento)) {
    return NextResponse.json({ erro: "mapeamento invalido" }, { status: 400 });
  }

  // pega o CRM do profissional do Klingo pra guardar junto (filtro de agenda)
  const clinica = await getClinica(clinicaId);
  const kgProfs = await listarProfissionaisKlingo(clinica).catch(() => []);
  const crmPorId = new Map(kgProfs.map((p) => [p.id, p.crm]));

  const profs = await listProfissionais(clinicaId);
  const daClinica = new Set(profs.map((p: any) => p.id));
  for (const m of body.mapeamento) {
    if (!m?.id || !daClinica.has(m.id)) continue;
    const kgId = String(m.klingo_professional_id || "");
    await vincularKlingoProfissional(m.id, kgId, kgId ? crmPorId.get(kgId) : undefined);
  }
  return NextResponse.json({ ok: true });
}

// PUT /api/klingo — IMPORTA os profissionais da conta Klingo (mesmo fluxo do
// import da Feegow/Clinicorp: cria com grade padrao, nome igual so vincula,
// mapeado pula). Body: { clinica_id }
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId || clinicaId !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  const clinica = await getClinica(clinicaId);
  const kgProfs = await listarProfissionaisKlingo(clinica);
  if (kgProfs.length === 0) {
    return NextResponse.json(
      { erro: "o Klingo não devolveu profissionais (confere o token)" },
      { status: 502 }
    );
  }

  const locais = await listProfissionais(clinicaId);
  const norm = (s: string) =>
    String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const jaMapeados = new Set(
    locais.map((p: any) => String(p.klingo_professional_id || "")).filter(Boolean)
  );
  const porNome = new Map(locais.map((p: any) => [norm(p.nome), p]));

  let criados = 0;
  let vinculados = 0;
  let pulados = 0;

  for (const kp of kgProfs) {
    const nome = String(kp.nome || "").replace(/\s+/g, " ").trim();
    if (!nome) continue;
    if (jaMapeados.has(kp.id)) {
      pulados++;
      continue;
    }
    const existente = porNome.get(norm(nome));
    if (existente && !existente.klingo_professional_id) {
      await vincularKlingoProfissional(existente.id, kp.id, kp.crm);
      vinculados++;
      continue;
    }
    if (existente) {
      pulados++;
      continue;
    }
    const novo = await upsertProfissional({
      clinica_id: clinicaId,
      nome,
      especialidade: kp.especialidade || null,
      duracao_min: 30,
    });
    await vincularKlingoProfissional(novo.id, kp.id, kp.crm);
    const horarios = [1, 2, 3, 4, 5].flatMap((dia) => [
      { dia_semana: dia, hora_inicio: "08:00", hora_fim: "12:00" },
      { dia_semana: dia, hora_inicio: "14:00", hora_fim: "18:00" },
    ]);
    await setHorarios(novo.id, horarios);
    criados++;
  }

  await registrarLog(
    clinicaId,
    "sistema",
    `🩺 Importação Klingo: ${criados} profissional(is) criado(s), ${vinculados} vinculado(s), ${pulados} já existente(s)`
  );
  return NextResponse.json({ ok: true, criados, vinculados, pulados, total: kgProfs.length });
}

// DELETE /api/klingo → desconecta (limpa credenciais). Body: { clinica_id }.
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId || clinicaId !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  await upsertClinica({
    id: clinicaId,
    klingo_app_token: null,
    klingo_cnes: null,
    klingo_especialidade: null,
    klingo_plano: null,
  });
  return NextResponse.json({ ok: true });
}
