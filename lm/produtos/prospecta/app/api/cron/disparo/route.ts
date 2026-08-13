export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import {
  sb, campanhaAtiva, templatesDaCampanha, disparosHoje, proximoLeadPraDisparo,
  marcarDisparado, atualizarLead, salvarMensagem, registrarEvento, instanciasConectadas,
} from "@/lib/db";
import { enviarTexto, checarWhatsapp } from "@/lib/uazapi";

// Cron da nuvem: roda a cada 1-2 min. Varre contas ATIVAS/trial e dispara 1 lead
// por conta que estiver na janela, sob o teto e com cadencia vencida.
// Rotacao round-robin: distribui os disparos entre os WhatsApp conectados da conta.

function agoraSP() {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", weekday: "short",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const dow = { "mån": 1, "tis": 2, "ons": 3, "tors": 4, "fre": 5, "lör": 6, "sön": 7 }[p.weekday as string]
    || ((new Date().getUTCDay() + 6) % 7) + 1;
  return { hora: `${p.hour}:${p.minute}`, dow };
}
const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const preencher = (t: string, lead: any) => t.replaceAll("{nome_empresa}", lead.nome_empresa || "").replaceAll("{cidade}", lead.cidade || "");

export async function GET(req: Request) {
  // protecao: so o cron da Vercel (header) ou o secret
  const secret = new URL(req.url).searchParams.get("secret");
  const auth = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && !auth.includes(process.env.CRON_SECRET))
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const { hora, dow } = agoraSP();
  const resumo: any[] = [];

  // contas que podem disparar: ativo ou trial nao vencido
  const { data: contas } = await sb.from("contas").select("id, plano, trial_ate")
    .in("plano", ["ativo", "trial", "interna"]);

  for (const conta of contas || []) {
    // trial vencido nao dispara
    if (conta.plano === "trial" && conta.trial_ate && new Date(conta.trial_ate) < new Date()) continue;

    const camp = await campanhaAtiva(conta.id);
    if (!camp) continue;
    // janela + dias
    const dias = String(camp.dias_semana || "1,2,3,4,5").split(",").map(Number);
    if (!dias.includes(dow)) continue;
    if (hora < (camp.janela_inicio || "08:30") || hora > (camp.janela_fim || "18:00")) continue;
    // teto
    if ((await disparosHoje(conta.id)) >= (camp.teto_dia || 25)) continue;
    // cadencia (proximo_disparo_em na campanha)
    if (camp.proximo_disparo_em && new Date(camp.proximo_disparo_em) > new Date()) continue;
    // WhatsApp conectado?
    const insts = await instanciasConectadas(conta.id);
    if (!insts.length) continue;

    // proximo lead
    const lead = await proximoLeadPraDisparo(conta.id, camp.id);
    if (!lead) continue;
    // templates de abertura
    const tpls = await templatesDaCampanha(conta.id, camp.id, "abertura");
    if (!tpls.length) continue;

    // ROTACAO round-robin: escolhe a instancia pela contagem de disparos do dia
    insts.sort((a: any, b: any) => (a.disparos_hoje || 0) - (b.disparos_hoje || 0));
    const inst = insts[0];

    // checa se o numero tem WhatsApp (nao queima chip com fixo)
    const chk = await checarWhatsapp(inst.uazapi_token, lead.telefone);
    if (chk.temWhatsapp === false) {
      await marcarDisparado(camp.id, lead.id);
      await atualizarLead(conta.id, lead.id, { status: "sem_whatsapp" });
      await registrarEvento(conta.id, lead.id, "sem_whatsapp", lead.telefone);
      continue; // pula sem gastar teto/cadencia
    }
    const alvo = chk.numeroCorrigido || lead.telefone;
    if (chk.numeroCorrigido && chk.numeroCorrigido !== lead.telefone)
      await sb.from("leads").update({ telefone: chk.numeroCorrigido }).eq("conta_id", conta.id).eq("id", lead.id);

    const texto = preencher(tpls[rand(0, tpls.length - 1)].texto, lead);
    const r = await enviarTexto(inst.uazapi_token, alvo, texto);
    if (r.ok) {
      await salvarMensagem(conta.id, lead.id, "assistant", texto);
      await marcarDisparado(camp.id, lead.id);
      await atualizarLead(conta.id, lead.id, { status: "disparado" });
      await registrarEvento(conta.id, lead.id, "disparo", camp.nome);
      await sb.from("instancias").update({ disparos_hoje: (inst.disparos_hoje || 0) + 1 }).eq("id", inst.id);
      // proxima cadencia
      const prox = new Date(Date.now() + rand(camp.cadencia_min_seg, camp.cadencia_max_seg) * 1000);
      await sb.from("campanhas").update({ proximo_disparo_em: prox.toISOString() }).eq("id", camp.id);
      resumo.push({ conta: conta.id, lead: lead.nome_empresa, whatsapp: inst.nome });
    } else {
      await registrarEvento(conta.id, lead.id, "erro", `disparo: ${r.erro}`);
    }
  }

  return NextResponse.json({ ok: true, disparados: resumo.length, resumo });
}
