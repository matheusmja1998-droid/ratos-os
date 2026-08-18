// RAIO-X DO TRIAL — relatorio de saude por clinica em trial, pro Telegram da LM.
// Nao e o relatorio de ROI que vai pro dono da clinica (esse e a Regua 5); este
// aqui e pra NOSSA equipe: mostra se a IA esta atendendo bem, o que ficou parado
// e se a equipe da clinica esta usando a ferramenta. Serve pra fazer suporte
// ativo ANTES do trial acabar.
import {
  listClinicas, getClinica, metricasClinica, listInstancias,
  mensagensDoPeriodo, pacientesDaClinica,
} from "./db";
import { enviarAlerta } from "./alertas";
import { anthropic, MODELO } from "./claude";
import type Anthropic from "@anthropic-ai/sdk";

const DIAS_TRIAL = 14;

const soData = (iso: string) => String(iso || "").replace("T", " ").slice(0, 19);
// aceita os DOIS formatos: Postgres ("2026-08-18T12:03:32.371+00:00", com fuso)
// e SQLite ("2026-08-18 12:03:32", UTC sem marcador). Sem isso o calculo de
// horas dava NaN no Supabase e o relatorio saia com "null h sem resposta".
function paraDate(v: string): Date {
  const s = String(v || "").trim();
  if (!s) return new Date(NaN);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s); // ja tem fuso
  return new Date(s.replace(" ", "T") + "Z");               // SQLite: UTC
}
const horasEntre = (a: string, b: string) =>
  (paraDate(b).getTime() - paraDate(a).getTime()) / 3600e3;

export type SaudeTrial = {
  clinicaId: string;
  nome: string;
  diaDoTrial: number;
  diasRestantes: number;
  whatsappConectado: boolean;
  conversas: number;
  mensagensPaciente: number;
  mensagensIA: number;
  mensagensHumano: number;
  pctHumano: number;         // quanto a equipe da clinica respondeu na mao
  consultasMarcadas: number;
  taxaAgendamento: number;   // conversas que viraram consulta
  paradas: { telefone: string; nome: string; horas: number; ultima: string; iaPausada: boolean }[];
  pausadasSemResposta: number; // recepcao assumiu e largou o paciente
  semRespostaIA: number;       // paciente falou e ninguem respondeu
  alertas: string[];
};

// levanta os numeros de UMA clinica no periodo do trial
export async function saudeDaClinica(clinicaId: string, dias = 7): Promise<SaudeTrial | null> {
  const c = await getClinica(clinicaId);
  if (!c) return null;

  const inicioTrial = c.trial_inicio || c.criado_em;
  const diaDoTrial = Math.max(1, Math.floor(horasEntre(soData(inicioTrial), new Date().toISOString()) / 24) + 1);
  const desde = soData(new Date(Date.now() - dias * 86400e3).toISOString());

  const msgs = await mensagensDoPeriodo(clinicaId, desde);
  const pacientes = await pacientesDaClinica(clinicaId);
  const porTelefone = new Map<string, any[]>();
  for (const m of msgs) {
    const arr = porTelefone.get(m.telefone) || [];
    arr.push(m);
    porTelefone.set(m.telefone, arr);
  }

  const mensagensPaciente = msgs.filter((m: any) => m.role === "user").length;
  const daCasa = msgs.filter((m: any) => m.role === "assistant");
  const mensagensHumano = daCasa.filter((m: any) => String(m.origem || "") === "humano").length;
  const mensagensIA = daCasa.length - mensagensHumano;

  // CONVERSAS PARADAS: ultima mensagem foi do PACIENTE e ninguem respondeu ha 2h+
  const agora = new Date().toISOString();
  const paradas: SaudeTrial["paradas"] = [];
  let pausadasSemResposta = 0;
  for (const [tel, lista] of porTelefone) {
    lista.sort((a: any, b: any) => String(a.criado_em).localeCompare(String(b.criado_em)));
    const ultima = lista[lista.length - 1];
    if (!ultima || ultima.role !== "user") continue;
    const horas = horasEntre(soData(ultima.criado_em), agora);
    if (horas < 2) continue;
    const p = pacientes.find((x: any) => x.telefone === tel);
    const iaPausada = Boolean(p?.ia_pausada);
    if (iaPausada) pausadasSemResposta++;
    paradas.push({
      telefone: tel,
      nome: p?.nome || p?.wa_nome || tel,
      horas: Math.round(horas),
      ultima: String(ultima.conteudo || "").slice(0, 90),
      iaPausada,
    });
  }
  paradas.sort((a, b) => b.horas - a.horas);

  const m = await metricasClinica(clinicaId, desde);
  const conversas = porTelefone.size;
  const insts = await listInstancias(clinicaId).catch(() => []);
  const whatsappConectado = insts.some((i: any) => String(i.status) === "conectado");

  const alertas: string[] = [];
  if (!whatsappConectado) alertas.push("WhatsApp DESCONECTADO: a IA nao recebe mensagem nenhuma");
  if (conversas === 0) alertas.push(`Nenhuma conversa em ${dias} dias: o cliente nao esta usando (ou nao divulgou o numero)`);
  if (paradas.length) alertas.push(`${paradas.length} conversa(s) sem resposta ha 2h+`);
  if (pausadasSemResposta) alertas.push(`${pausadasSemResposta} conversa(s) com a IA PAUSADA e o paciente esperando (recepcao assumiu e largou)`);
  const pctHumano = daCasa.length ? Math.round((mensagensHumano / daCasa.length) * 100) : 0;
  if (pctHumano >= 50 && daCasa.length >= 10) alertas.push(`Equipe responde ${pctHumano}% na mao: ou a IA esta falhando, ou nao confiam nela ainda`);
  if (conversas >= 5 && m.total === 0) alertas.push("Teve conversa mas ZERO consulta marcada: a IA nao esta convertendo");

  return {
    clinicaId,
    nome: c.nome,
    diaDoTrial,
    diasRestantes: Math.max(0, DIAS_TRIAL - diaDoTrial),
    whatsappConectado,
    conversas,
    mensagensPaciente,
    mensagensIA,
    mensagensHumano,
    pctHumano,
    consultasMarcadas: m.total,
    taxaAgendamento: conversas ? Math.round((m.total / conversas) * 100) : 0,
    paradas: paradas.slice(0, 5),
    pausadasSemResposta,
    semRespostaIA: paradas.filter((p) => !p.iaPausada).length,
    alertas,
  };
}

// LEITURA QUALITATIVA: a IA le as conversas e diz se o atendimento esta bom.
// Roda so quando ha conversa suficiente (senao gasta token pra nada).
async function analisarAtendimento(clinicaId: string, dias: number): Promise<string | null> {
  const desde = soData(new Date(Date.now() - dias * 86400e3).toISOString());
  const msgs = await mensagensDoPeriodo(clinicaId, desde);
  if (msgs.length < 6) return null;
  msgs.sort((a: any, b: any) => String(a.criado_em).localeCompare(String(b.criado_em)));

  const porTelefone = new Map<string, any[]>();
  for (const m of msgs) {
    const arr = porTelefone.get(m.telefone) || [];
    arr.push(m);
    porTelefone.set(m.telefone, arr);
  }
  // ate 8 conversas, 14 mensagens cada (cabe no contexto sem explodir custo)
  const amostra = [...porTelefone.entries()].slice(0, 8).map(([tel, lista]) => {
    const ult = lista.slice(-14).map((m: any) => {
      const quem = m.role === "user" ? "PACIENTE" : String(m.origem || "") === "humano" ? "RECEPCAO" : "IA";
      return `${quem}: ${String(m.conteudo || "").slice(0, 200)}`;
    }).join("\n");
    return `--- conversa ${tel.slice(-4)} ---\n${ult}`;
  }).join("\n\n");

  const prompt = `Você é o head de sucesso do cliente de um SaaS de atendimento por IA para clínicas.
Abaixo estão conversas reais dos últimos ${dias} dias de uma clínica em período de teste.

${amostra}

Analise e responda em no máximo 6 linhas, em português do Brasil, direto ao ponto, sem enrolação e SEM travessão:
1. A IA está atendendo bem? Cite o erro mais grave que você viu (se houver), com exemplo curto.
2. A recepção está trabalhando junto com a IA ou atropelando ela?
3. A ação de suporte mais urgente que a agência deve fazer com esse cliente ainda hoje.
Responda em texto corrido curto, sem markdown, sem títulos.`;

  try {
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    const texto = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return texto || null;
  } catch {
    return null;
  }
}

function formatarRelatorio(s: SaudeTrial, analise: string | null): string {
  const semaforo = s.alertas.length === 0 ? "🟢" : s.alertas.length <= 1 ? "🟡" : "🔴";
  const linhas = [
    `${semaforo} <b>TRIAL: ${s.nome}</b>`,
    `Dia ${s.diaDoTrial} de ${DIAS_TRIAL} · faltam ${s.diasRestantes} dias`,
    ``,
    `💬 ${s.conversas} conversa(s) · ${s.mensagensPaciente} msg de paciente`,
    `🤖 IA respondeu ${s.mensagensIA} · 🧑 equipe respondeu ${s.mensagensHumano} (${s.pctHumano}%)`,
    `📅 ${s.consultasMarcadas} consulta(s) marcada(s) · ${s.taxaAgendamento}% das conversas viraram agendamento`,
    `${s.whatsappConectado ? "🟢 WhatsApp conectado" : "🔴 WhatsApp DESCONECTADO"}`,
  ];
  if (s.alertas.length) {
    linhas.push(``, `<b>⚠️ Pontos de atencao</b>`);
    for (const a of s.alertas) linhas.push(`• ${a}`);
  }
  if (s.paradas.length) {
    linhas.push(``, `<b>⏸ Conversas paradas</b>`);
    for (const p of s.paradas)
      linhas.push(`• ${p.nome} — ${p.horas}h sem resposta${p.iaPausada ? " (IA pausada pela recepcao)" : ""}`);
  }
  if (analise) linhas.push(``, `<b>🔎 Leitura das conversas</b>`, analise);
  return linhas.join("\n");
}

// Roda o raio-x de TODAS as clinicas em trial e manda cada uma no Telegram.
export async function rodarSaudeTrials(opts: { dias?: number; comAnalise?: boolean } = {}) {
  const dias = opts.dias ?? 7;
  const comAnalise = opts.comAnalise ?? true;
  const clinicas = await listClinicas();
  // SO trial de verdade: status trial + ativa + trial_inicio preenchido ("Iniciar
  // trial" no admin). Sem o trial_inicio entrava cada clinica de teste antiga e o
  // relatorio virava spam — quem esta testando pra valer tem data de inicio.
  const emTrial = clinicas.filter(
    (c: any) =>
      String(c.assinatura_status || "trial") === "trial" &&
      Boolean(c.ativo ?? true) &&
      Boolean(c.trial_inicio)
  );
  const enviados: string[] = [];
  for (const c of emTrial) {
    const s = await saudeDaClinica(c.id, dias).catch(() => null);
    if (!s) continue;
    const analise = comAnalise ? await analisarAtendimento(c.id, dias).catch(() => null) : null;
    await enviarAlerta(formatarRelatorio(s, analise));
    enviados.push(c.nome);
  }
  if (!enviados.length) await enviarAlerta("ℹ️ Raio-x do trial: nenhuma clinica em trial ativo agora.");
  return { clinicas: enviados };
}
