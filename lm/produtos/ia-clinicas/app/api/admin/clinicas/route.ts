import { NextRequest, NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";
import { hashSenha } from "@/lib/auth";
import {
  upsertClinica,
  atualizarAssinaturaClinica,
  upsertProfissional,
  addHorario,
  criarConta,
  getContaPorEmail,
  getClinica,
  listInstancias,
  removerClinica,
} from "@/lib/db";
import { deletarInstancia } from "@/lib/uazapi";

// PATCH /api/admin/clinicas — acoes administrativas na clinica.
// Body: { clinica_id, acao: "iniciar_trial" } -> grava trial_inicio=agora e
// marca a assinatura como trial. A partir dai o painel conta os 14 dias.
export async function PATCH(req: NextRequest) {
  const sessao = await sessaoAtual();
  if (!sessao || sessao.papel !== "admin") {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const clinica = await getClinica(String(body.clinica_id || ""));
  if (!clinica) return NextResponse.json({ erro: "clinica nao encontrada" }, { status: 404 });

  if (body.acao === "iniciar_trial") {
    if (clinica.trial_inicio) {
      return NextResponse.json({ erro: "o trial dessa clinica ja foi iniciado" }, { status: 409 });
    }
    // upsertClinica NAO grava campos de cobranca (dropa trial_inicio em
    // silencio) — tem que ser pela funcao dedicada de assinatura.
    await atualizarAssinaturaClinica(clinica.id, {
      trial_inicio: new Date().toISOString(),
      assinatura_status: "trial",
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ erro: "acao desconhecida" }, { status: 400 });
}

// POST /api/admin/clinicas — cria clinica NOVA + conta de acesso dela.
// So admin (o middleware ja garante papel, mas conferimos de novo).
// Body: { clinica: {...}, conta: { email, senha } }
export async function POST(req: NextRequest) {
  const sessao = await sessaoAtual();
  if (!sessao || sessao.papel !== "admin") {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { clinica, conta } = body || {};
  if (!clinica?.nome) return NextResponse.json({ erro: "nome da clinica obrigatorio" }, { status: 400 });
  if (!conta?.email || !conta?.senha)
    return NextResponse.json({ erro: "email e senha de acesso obrigatorios" }, { status: 400 });

  // email ja usado?
  const existe = await getContaPorEmail(conta.email);
  if (existe) return NextResponse.json({ erro: "ja existe uma conta com esse email" }, { status: 409 });

  // 1) cria a clinica
  const c = await upsertClinica(clinica);

  // 2) profissionais opcionais (grade padrao seg-sex 08-12 e 14-18)
  if (Array.isArray(clinica.profissionais)) {
    for (const p of clinica.profissionais) {
      const prof = await upsertProfissional({ ...p, clinica_id: c.id });
      const horarios =
        p.horarios ||
        [1, 2, 3, 4, 5].flatMap((dia: number) => [
          { dia_semana: dia, hora_inicio: "08:00", hora_fim: "12:00" },
          { dia_semana: dia, hora_inicio: "14:00", hora_fim: "18:00" },
        ]);
      for (const h of horarios) await addHorario({ ...h, profissional_id: prof.id });
    }
  }

  // 3) cria a conta de acesso da clinica
  const senha_hash = await hashSenha(String(conta.senha));
  await criarConta({
    email: conta.email,
    senha_hash,
    papel: "clinica",
    clinica_id: c.id,
    nome: clinica.nome,
  });

  return NextResponse.json({ ok: true, clinica: c, email: conta.email });
}

// DELETE /api/admin/clinicas — REMOVE uma clinica INTEIRA (conversas, consultas,
// pacientes, contas, numeros de WhatsApp, tudo). SO ADMIN. Irreversivel.
// Confirmacao dupla: o body precisa trazer o NOME EXATO da clinica.
// Body: { id, confirmar_nome }
export async function DELETE(req: NextRequest) {
  const sessao = await sessaoAtual();
  if (!sessao || sessao.papel !== "admin") {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ erro: "falta id" }, { status: 400 });

  const clinica = await getClinica(id);
  if (!clinica) return NextResponse.json({ erro: "clinica nao encontrada" }, { status: 404 });

  // trava de seguranca: precisa digitar o nome exato
  const confirmado = String(body.confirmar_nome || "").trim().toLowerCase();
  if (confirmado !== String(clinica.nome || "").trim().toLowerCase()) {
    return NextResponse.json(
      { erro: "o nome digitado nao confere com o nome da clinica" },
      { status: 400 }
    );
  }

  // apaga as instancias no servidor uazapi (best-effort, libera os slots)
  const insts = await listInstancias(id);
  for (const i of insts) {
    if (i.uazapi_token) await deletarInstancia(i.uazapi_token).catch(() => {});
  }

  await removerClinica(id);
  console.log(`[admin] clinica REMOVIDA: ${clinica.nome} (${id}) pela conta ${sessao.contaId}`);
  return NextResponse.json({ ok: true, removida: clinica.nome });
}
