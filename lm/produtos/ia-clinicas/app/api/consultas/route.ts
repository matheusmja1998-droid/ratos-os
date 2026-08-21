import { NextRequest, NextResponse } from "next/server";
import { agendaDaClinica, getConsulta, atualizarObservacaoConsulta, registrarLog, excluirConsulta } from "@/lib/db";
import { agendar, cancelar, remarcar, hojeSP } from "@/lib/agenda";
import { clinicaPermitida } from "@/lib/sessao";

// GET /api/consultas?clinica=ID&de=YYYY-MM-DD&ate=YYYY-MM-DD
// Agenda da clinica no periodo. ISOLAMENTO: clinica so ve a dela.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clinica = await clinicaPermitida(searchParams.get("clinica"));
  if (!clinica) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  const hoje = hojeSP();
  const de = searchParams.get("de") || hoje;
  // por padrao pega 14 dias a partir de hoje (em SP)
  const [y, mo, d] = hoje.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + 14));
  const ateDefault = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  const ate = searchParams.get("ate") || ateDefault;

  const consultas = await agendaDaClinica(clinica, de + "T00:00:00", ate + "T23:59:59");
  return NextResponse.json({ consultas });
}

// POST /api/consultas  → MARCACAO MANUAL (a recepcao marca na mao pelo painel).
// Usa o mesmo agendar() da IA: valida disponibilidade + anti-overbooking por
// sobreposicao. ISOLAMENTO: so marca na clinica da sessao.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const permitida = await clinicaPermitida(body.clinica_id ?? null);
  if (!permitida) return NextResponse.json({ erro: "acesso negado" }, { status: 403 });

  if (!body.profissional_id || !body.inicio) {
    return NextResponse.json({ erro: "profissional e horario sao obrigatorios" }, { status: 400 });
  }

  // telefone: normaliza (so digitos). Sem telefone, gera um placeholder estavel
  // pra recepcao poder marcar mesmo sem o numero na mao (nunca colide com paciente
  // real: prefixo 0000 igual ao do simulador). O nome ainda aparece na agenda.
  const telDigitos = String(body.telefone || "").replace(/\D/g, "");
  const telefone = telDigitos || `0000${Date.now().toString().slice(-9)}`;

  const r = await agendar({
    clinicaId: permitida,
    profissionalId: body.profissional_id,
    telefone,
    nomePaciente: body.nome_paciente || "Paciente",
    inicioISO: body.inicio,
    observacao: body.observacao,
    pagamento: body.pagamento,
    convenioNome: body.convenio_nome,
    validarGrade: false, // painel pode encaixar em qualquer horario livre (ex: 10:15)
  });
  if (!r.ok) {
    return NextResponse.json({ erro: mensagemErroAgenda(r.erro) }, { status: r.erro === "horario ocupado" ? 409 : 400 });
  }
  return NextResponse.json({ ok: true, consulta: r.consulta });
}

// erro tecnico -> mensagem clara pra recepcao
function mensagemErroAgenda(erro?: string): string {
  if (erro === "horario ocupado")
    return "Esse horário já está ocupado — não dá pra colocar uma consulta em cima da outra. Escolha outro horário.";
  if (erro === "horario no passado") return "Esse horário já passou. Escolhe uma data/hora futura.";
  if (erro === "horario indisponivel") return "Esse horário está fora da grade de atendimento do profissional.";
  return erro || "não consegui salvar";
}

// PATCH /api/consultas  → remarcar ou cancelar (secretaria mexendo na mao)
// ISOLAMENTO: so opera consulta que pertence a clinica da sessao.
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const consulta = await getConsulta(body.id);
  if (!consulta) return NextResponse.json({ erro: "consulta nao encontrada" }, { status: 404 });
  const permitida = await clinicaPermitida(consulta.clinica_id);
  if (!permitida || permitida !== consulta.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }

  if (body.acao === "cancelar") {
    const r = await cancelar(body.id, body.motivo);
    return NextResponse.json(r);
  }
  if (body.acao === "remarcar") {
    // validarGrade:false = a recepcao pode encaixar em QUALQUER horario livre
    // (so barra sobreposicao real e horario no passado)
    const r = await remarcar(body.id, body.inicio, body.motivo, { validarGrade: false });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, erro: mensagemErroAgenda(r.erro) },
        { status: r.erro === "horario ocupado" ? 409 : 400 }
      );
    }
    return NextResponse.json(r);
  }
  if (body.acao === "observacao") {
    await atualizarObservacaoConsulta(body.id, String(body.observacao ?? "").slice(0, 500));
    await registrarLog(consulta.clinica_id, "consulta", `📝 Observacao atualizada na consulta de ${consulta.inicio.slice(8, 10)}/${consulta.inicio.slice(5, 7)} as ${consulta.inicio.slice(11, 16)}`);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ erro: "acao invalida (cancelar|remarcar|observacao)" }, { status: 400 });
}

// DELETE /api/consultas {id} -> EXCLUI de vez (nao e cancelar: some do banco).
// ISOLAMENTO: so agendamento da propria clinica.
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const consulta = await getConsulta(String(body.id || ""));
  if (!consulta) return NextResponse.json({ erro: "consulta nao encontrada" }, { status: 404 });
  const permitida = await clinicaPermitida(consulta.clinica_id);
  if (!permitida || permitida !== consulta.clinica_id) {
    return NextResponse.json({ erro: "acesso negado" }, { status: 403 });
  }
  await excluirConsulta(consulta.id);
  await registrarLog(
    consulta.clinica_id,
    "consulta",
    `🗑️ Agendamento EXCLUIDO pela recepcao: ${consulta.observacao || "consulta"} — ${String(consulta.inicio).slice(8, 10)}/${String(consulta.inicio).slice(5, 7)} as ${String(consulta.inicio).slice(11, 16)}`
  ).catch(() => {});
  return NextResponse.json({ ok: true });
}
