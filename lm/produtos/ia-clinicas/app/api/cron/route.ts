import { NextRequest, NextResponse } from "next/server";
import { rodarTodasReguas } from "@/lib/reguas";
import { rodarSaudeTrials } from "@/lib/saude-trial";
import { alertarErro, enviarAlerta } from "@/lib/alertas";
import { listTodasInstancias, atualizarStatusInstancia } from "@/lib/db";
import { statusInstanciaLive } from "@/lib/uazapi";

// WATCHDOG do WhatsApp: confere AO VIVO se cada instancia segue conectada na
// uazapi. Alerta no Telegram na TRANSICAO (caiu / voltou) — sem spam a cada
// rodada — e mantem instancias.status fiel (o painel le dali; antes mostrava
// "conectada" com a instancia morta ha 1h — 21/07, teste com a gestora).
// Chamado a cada 10min por cron externo (VPS): /api/cron?secret=...&tarefa=watchdog
async function watchdogWhatsapp() {
  const insts = await listTodasInstancias();
  const resultado: { instancia: string; conectado: boolean; status: string }[] = [];
  for (const inst of insts) {
    if (!inst?.uazapi_token) continue;
    const { conectado, status } = await statusInstanciaLive(inst.uazapi_token);
    const statusNovo = conectado ? "conectado" : "desconectado";
    const statusAntigo = String(inst.status || "");
    if (statusNovo !== statusAntigo) {
      await atualizarStatusInstancia(inst.id, statusNovo).catch(() => {});
      const rotulo = `"${inst.uazapi_instance || inst.nome || inst.id}"${inst.numero ? ` (${inst.numero})` : ""}`;
      if (!conectado) {
        await enviarAlerta(
          `🔴 WhatsApp CAIU — instancia ${rotulo}: ${status}. A IA NAO esta recebendo mensagens de paciente. Reconectar em ia-clinicas.vercel.app/painel/whatsapps`
        );
      } else {
        await enviarAlerta(`🟢 WhatsApp reconectado — instancia ${rotulo}.`);
      }
    }
    resultado.push({ instancia: String(inst.uazapi_instance || inst.id), conectado, status });
  }
  return resultado;
}

// Endpoint que o cron da Vercel chama pra disparar as reguas.
// A Vercel Cron manda automaticamente "Authorization: Bearer <CRON_SECRET>"
// quando CRON_SECRET esta configurado nas env vars. Aceitamos isso e tambem
// o ?secret= na URL como fallback (chamada manual).
export async function GET(req: NextRequest) {
  // FAIL-CLOSED: sem CRON_SECRET configurado, nega em vez de rodar aberto
  const esperado = process.env.CRON_SECRET;
  if (!esperado) {
    console.error("[cron] CRON_SECRET nao configurado — negando");
    return NextResponse.json({ erro: "servico mal configurado" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") || "";
  const query = req.nextUrl.searchParams.get("secret") || "";
  const ok = auth === `Bearer ${esperado}` || query === esperado;
  if (!ok) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });

  try {
    // tarefa=watchdog: so o vigia de conexao (rapido, roda a cada 10min).
    // Sem tarefa: reguas diarias (cron da Vercel) + watchdog de carona.
    const tarefa = req.nextUrl.searchParams.get("tarefa") || "";
    if (tarefa === "watchdog") {
      const whatsapp = await watchdogWhatsapp();
      return NextResponse.json({ ok: true, whatsapp });
    }
    // tarefa=saude-trial: raio-x das clinicas em trial no Telegram DA LM (suporte
    // ativo antes do trial acabar). ?dias=N muda a janela; ?analise=0 pula a IA.
    if (tarefa === "saude-trial") {
      const dias = Number(req.nextUrl.searchParams.get("dias")) || 7;
      const comAnalise = req.nextUrl.searchParams.get("analise") !== "0";
      const r = await rodarSaudeTrials({ dias, comAnalise });
      return NextResponse.json({ ok: true, ...r });
    }
    const resultado = await rodarTodasReguas();
    const whatsapp = await watchdogWhatsapp().catch(() => []);
    return NextResponse.json({ ok: true, ...resultado, whatsapp });
  } catch (e: any) {
    await alertarErro("cron", e);
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
