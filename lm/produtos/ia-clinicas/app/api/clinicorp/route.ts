import { NextRequest, NextResponse } from "next/server";
import {
  getClinica,
  upsertClinica,
  listProfissionais,
  vincularClinicorpProfissional,
  upsertProfissional,
  setHorarios,
  registrarLog,
} from "@/lib/db";
import { validarClinicorp, listarProfissionaisClinicorp } from "@/lib/clinicorp";
import { clinicaPermitida } from "@/lib/sessao";

// Integracao Clinicorp (agenda odontologica). Guardar as credenciais quando o
// cliente liberar o Token API — ai a agenda ja conecta sozinha.
// ISOLAMENTO: a conta so opera a propria clinica.

// GET /api/clinicorp?clinica=ID → status da conexao (NUNCA devolve o token).
// Quando conectado, lista os dentistas do Clinicorp + o mapeamento atual dos
// profissionais do Facilita (pro card fazer o de-para).
export async function GET(req: NextRequest) {
  const clinicaId = await clinicaPermitida(req.nextUrl.searchParams.get("clinica"));
  if (!clinicaId) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const clinica = await getClinica(clinicaId);
  const conectado = Boolean(
    clinica?.clinicorp_api_user && clinica?.clinicorp_token && clinica?.clinicorp_subscriber_id
  );

  // profissionais do Facilita (pro de-para), sempre — mesmo desconectado
  const profs = await listProfissionais(clinicaId);
  const mapeamento = profs.map((p: any) => ({
    id: p.id,
    nome: p.nome,
    clinicorp_professional_id: p.clinicorp_professional_id || "",
  }));

  let profissionais: { id: string; nome: string; especialidade: string }[] = [];
  if (conectado) {
    profissionais = await listarProfissionaisClinicorp(clinica).catch(() => []);
  }
  return NextResponse.json({
    conectado,
    // devolve so identificadores nao-sensiveis pra tela preencher (sem o token)
    api_user: clinica?.clinicorp_api_user || "",
    subscriber_id: clinica?.clinicorp_subscriber_id || "",
    business_id: clinica?.clinicorp_business_id || "",
    profissionais, // dentistas no Clinicorp
    mapeamento, // profissionais do Facilita + vinculo atual
  });
}

// POST /api/clinicorp → salva/atualiza as credenciais. Valida ANTES de salvar
// pra nao guardar token que nao funciona. Body: { clinica_id, api_user, token,
// subscriber_id, business_id? }. Token vazio no update = mantem o atual.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId || clinicaId !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  const clinica = await getClinica(clinicaId);
  const apiUser = String(body.api_user || "").trim();
  // subscriber_id vazio = usa o proprio usuario API (na pratica sao o mesmo
  // valor — confirmado na conta real da Compass; menos campo pra confundir)
  const subscriberId = String(body.subscriber_id || "").trim() || apiUser;
  const businessId = String(body.business_id || "").trim();
  // token em branco no update = manter o que ja esta salvo (nao reescrever)
  const token = String(body.token || "").trim() || clinica?.clinicorp_token || "";

  if (!apiUser || !token) {
    return NextResponse.json(
      { erro: "preencha o usuario API e o token" },
      { status: 400 }
    );
  }

  // valida contra o Clinicorp antes de persistir
  const v = await validarClinicorp({ apiUser, token, subscriberId });
  if (!v.ok) {
    return NextResponse.json({ erro: `Clinicorp recusou: ${v.erro}` }, { status: 400 });
  }

  await upsertClinica({
    id: clinicaId,
    clinicorp_api_user: apiUser,
    clinicorp_token: token,
    clinicorp_subscriber_id: subscriberId,
    clinicorp_business_id: businessId || null,
  });

  return NextResponse.json({ ok: true, profissionais: v.profissionais ?? 0 });
}

// PATCH /api/clinicorp → salva o de-para dos profissionais.
// Body: { clinica_id, mapeamento: [{ id, clinicorp_professional_id }] }.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId || clinicaId !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  if (!Array.isArray(body.mapeamento)) {
    return NextResponse.json({ erro: "mapeamento invalido" }, { status: 400 });
  }

  // so mexe em profissionais QUE SAO DESSA clinica (isolamento). Update
  // cirurgico (vincularClinicorpProfissional) — nunca zera outros campos.
  const profs = await listProfissionais(clinicaId);
  const daClinica = new Set(profs.map((p: any) => p.id));
  for (const m of body.mapeamento) {
    if (!m?.id || !daClinica.has(m.id)) continue;
    await vincularClinicorpProfissional(m.id, String(m.clinicorp_professional_id || ""));
  }
  return NextResponse.json({ ok: true });
}

// PUT /api/clinicorp — IMPORTA os dentistas da conta Clinicorp: cria cada um
// no Facilita (com horario padrao seg-sex 08-12/14-18) ja vinculado ao id do
// Clinicorp. Quem ja existe com o mesmo nome so e VINCULADO (nao duplica);
// quem ja esta mapeado e pulado. Mesmo fluxo do import da Feegow.
// Body: { clinica_id }
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId || clinicaId !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  const clinica = await getClinica(clinicaId);
  const ccProfs = await listarProfissionaisClinicorp(clinica);
  if (ccProfs.length === 0) {
    return NextResponse.json(
      { erro: "o Clinicorp não devolveu dentistas (confere a conexão)" },
      { status: 502 }
    );
  }

  const locais = await listProfissionais(clinicaId);
  const norm = (s: string) =>
    String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const jaMapeados = new Set(
    locais.map((p: any) => String(p.clinicorp_professional_id || "")).filter(Boolean)
  );
  const porNome = new Map(locais.map((p: any) => [norm(p.nome), p]));

  let criados = 0;
  let vinculados = 0;
  let pulados = 0;

  for (const cp of ccProfs) {
    const nome = String(cp.nome || "").replace(/\s+/g, " ").trim();
    if (!nome) continue;
    if (jaMapeados.has(cp.id)) {
      pulados++; // esse dentista do Clinicorp ja esta vinculado a alguem
      continue;
    }
    const existente = porNome.get(norm(nome));
    if (existente && !existente.clinicorp_professional_id) {
      await vincularClinicorpProfissional(existente.id, cp.id);
      vinculados++;
      continue;
    }
    if (existente) {
      pulados++;
      continue;
    }
    // cria o dentista novo ja vinculado, com grade padrao
    const novo = await upsertProfissional({
      clinica_id: clinicaId,
      nome,
      especialidade: cp.especialidade || null,
      duracao_min: 30,
    });
    await vincularClinicorpProfissional(novo.id, cp.id);
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
    `🦷 Importação Clinicorp: ${criados} dentista(s) criado(s), ${vinculados} vinculado(s), ${pulados} já existente(s)`
  );
  return NextResponse.json({ ok: true, criados, vinculados, pulados, total: ccProfs.length });
}

// DELETE /api/clinicorp → desconecta (limpa credenciais). Body: { clinica_id }.
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicaId = await clinicaPermitida(body.clinica_id ?? null);
  if (!clinicaId || clinicaId !== body.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  await upsertClinica({
    id: clinicaId,
    clinicorp_api_user: null,
    clinicorp_token: null,
    clinicorp_subscriber_id: null,
    clinicorp_business_id: null,
  });
  return NextResponse.json({ ok: true });
}
