import { NextRequest, NextResponse } from "next/server";
import {
  getClinica,
  listProfissionais,
  salvarConfigFeegow,
  salvarMapeamentoFeegow,
  getProfissional,
  upsertProfissional,
  setHorarios,
  registrarLog,
} from "@/lib/db";
import {
  validarTokenFeegow,
  listarProfissionaisFeegow,
  listarEspecialidadesFeegow,
  listarProcedimentosFeegow,
  listarMotivosFeegow,
} from "@/lib/feegow";
import { clinicaPermitida } from "@/lib/sessao";

// Integracao Feegow: conectar token, listar dados da conta Feegow e mapear
// os profissionais do Facilita pros profissionais correspondentes no Feegow.
// SEGURANCA: o token NUNCA volta pro browser (so o status "conectado").

export const maxDuration = 30;

// GET /api/integracoes/feegow?clinica=ID → status + listas pro setup
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const permitida = await clinicaPermitida(searchParams.get("clinica"));
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const clinica = await getClinica(permitida);
  const conectado = Boolean(clinica?.feegow_token);
  const profissionais = await listProfissionais(permitida);

  let feegow: any = { profissionais: [], especialidades: [], procedimentos: [], motivos: [] };
  if (conectado) {
    const [profs, esps, procs, mots] = await Promise.all([
      listarProfissionaisFeegow(clinica.feegow_token),
      listarEspecialidadesFeegow(clinica.feegow_token),
      listarProcedimentosFeegow(clinica.feegow_token),
      listarMotivosFeegow(clinica.feegow_token),
    ]);
    feegow = { profissionais: profs, especialidades: esps, procedimentos: procs, motivos: mots };
  }

  return NextResponse.json({
    conectado,
    local_id: clinica?.feegow_local_id || "",
    unidade_nome: clinica?.feegow_unidade_nome || "",
    motivo_id: clinica?.feegow_motivo_id || "",
    // mapeamento atual dos NOSSOS profissionais
    mapeamento: profissionais.map((p: any) => ({
      id: p.id,
      nome: p.nome,
      feegow_professional_id: p.feegow_professional_id || "",
      feegow_especialidade_id: p.feegow_especialidade_id || "",
      feegow_procedimento_id: p.feegow_procedimento_id || "",
    })),
    feegow,
  });
}

// POST /api/integracoes/feegow — conecta (valida e salva o token)
// Body: { clinica_id, token }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const token = String(body.token || "").trim();
  if (!token) return NextResponse.json({ erro: "cole o token da Feegow" }, { status: 400 });

  const v = await validarTokenFeegow(token);
  if (!v.ok) {
    return NextResponse.json(
      { erro: `A Feegow recusou esse token (${v.erro}). Confere se copiou completo e se a API está liberada na conta.` },
      { status: 400 }
    );
  }

  await salvarConfigFeegow(permitida, { feegow_token: token });
  await registrarLog(permitida, "sistema", "🔌 Integração Feegow conectada");
  return NextResponse.json({ ok: true });
}

// PATCH /api/integracoes/feegow — salva configuracao e mapeamento
// Body: { clinica_id, local_id?, motivo_id?, mapeamento?: [{id, feegow_professional_id, feegow_especialidade_id, feegow_procedimento_id}] }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  if (body.local_id !== undefined || body.motivo_id !== undefined || body.unidade_nome !== undefined) {
    await salvarConfigFeegow(permitida, {
      ...(body.local_id !== undefined ? { feegow_local_id: String(body.local_id) } : {}),
      ...(body.motivo_id !== undefined ? { feegow_motivo_id: String(body.motivo_id) } : {}),
      ...(body.unidade_nome !== undefined ? { feegow_unidade_nome: String(body.unidade_nome) } : {}),
    });
  }

  if (Array.isArray(body.mapeamento)) {
    for (const m of body.mapeamento) {
      // isolamento: so mapeia profissional que pertence a essa clinica
      const prof = await getProfissional(String(m.id || ""));
      if (!prof || prof.clinica_id !== permitida) continue;
      await salvarMapeamentoFeegow(prof.id, {
        feegow_professional_id: m.feegow_professional_id ? String(m.feegow_professional_id) : null,
        feegow_especialidade_id: m.feegow_especialidade_id ? String(m.feegow_especialidade_id) : null,
        feegow_procedimento_id: m.feegow_procedimento_id ? String(m.feegow_procedimento_id) : null,
      });
    }
  }

  await registrarLog(permitida, "sistema", "🔌 Configuração da integração Feegow atualizada");
  return NextResponse.json({ ok: true });
}

// PUT /api/integracoes/feegow — IMPORTA os profissionais da conta Feegow:
// cria cada um no Facilita (com horario padrao) ja vinculado ao id da Feegow.
// Quem ja existe com o mesmo nome so e VINCULADO (nao duplica); quem ja esta
// mapeado e pulado. Body: { clinica_id }
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const clinica = await getClinica(permitida);
  if (!clinica?.feegow_token) {
    return NextResponse.json({ erro: "conecte o token da Feegow primeiro" }, { status: 400 });
  }

  const feegowProfs = await listarProfissionaisFeegow(clinica.feegow_token);
  if (feegowProfs.length === 0) {
    return NextResponse.json({ erro: "a Feegow não devolveu profissionais (confere o token)" }, { status: 502 });
  }

  const locais = await listProfissionais(permitida);
  const norm = (s: string) =>
    String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const jaMapeados = new Set(locais.map((p: any) => String(p.feegow_professional_id || "")).filter(Boolean));
  const porNome = new Map(locais.map((p: any) => [norm(p.nome), p]));

  let criados = 0;
  let vinculados = 0;
  let pulados = 0;

  for (const fp of feegowProfs) {
    if (jaMapeados.has(fp.id)) {
      pulados++; // ja vinculado a alguem
      continue;
    }
    const existente = porNome.get(norm(fp.nome));
    if (existente && !existente.feegow_professional_id) {
      // mesmo nome ja cadastrado aqui: so vincula (nao duplica), ja com a
      // especialidade do Feegow (id + nome legivel pra IA)
      await salvarMapeamentoFeegow(existente.id, {
        feegow_professional_id: fp.id,
        feegow_especialidade_id: fp.especialidade_id || null,
      });
      if (fp.especialidade_nome && !existente.especialidade) {
        await upsertProfissional({ id: existente.id, clinica_id: permitida, nome: existente.nome, especialidade: fp.especialidade_nome, duracao_min: existente.duracao_min });
      }
      vinculados++;
      continue;
    }
    if (existente) {
      pulados++;
      continue;
    }
    // cria o profissional novo ja vinculado, com a especialidade puxada do Feegow
    const novo = await upsertProfissional({
      clinica_id: permitida,
      nome: fp.nome,
      especialidade: fp.especialidade_nome || null,
      duracao_min: 30,
    });
    await salvarMapeamentoFeegow(novo.id, {
      feegow_professional_id: fp.id,
      feegow_especialidade_id: fp.especialidade_id || null,
    });
    const horarios = [1, 2, 3, 4, 5].flatMap((dia) => [
      { dia_semana: dia, hora_inicio: "08:00", hora_fim: "12:00" },
      { dia_semana: dia, hora_inicio: "14:00", hora_fim: "18:00" },
    ]);
    await setHorarios(novo.id, horarios);
    criados++;
  }

  await registrarLog(
    permitida,
    "sistema",
    `🔌 Importação Feegow: ${criados} profissional(is) criado(s), ${vinculados} vinculado(s), ${pulados} já existente(s)`
  );
  return NextResponse.json({ ok: true, criados, vinculados, pulados, total: feegowProfs.length });
}

// DELETE /api/integracoes/feegow — desconecta (apaga o token)
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  await salvarConfigFeegow(permitida, { feegow_token: null });
  await registrarLog(permitida, "sistema", "🔌 Integração Feegow desconectada");
  return NextResponse.json({ ok: true });
}
