"use client";

// Editor de TOM DE VOZ: categorias em colunas (um clique por categoria, chip
// fica VERDE quando selecionado) + estilos rápidos + slider de tamanho.
// O preview ao lado é uma bolha ESTILO WHATSAPP (verde, de quem envia) montada
// DETERMINISTICAMENTE aqui no navegador — zero tokens de IA gastos.
// O que sai daqui vira a string tom_de_voz (a IA interpreta literalmente).

const CATEGORIAS: { titulo: string; opcoes: string[] }[] = [
  { titulo: "Formalidade", opcoes: ["Formal", "Informal", "Semi-formal", "Cerimonioso", "Coloquial"] },
  { titulo: "Calor humano", opcoes: ["Acolhedor", "Empático", "Caloroso", "Receptivo", "Atencioso", "Cordial"] },
  { titulo: "Energia/ritmo", opcoes: ["Animado", "Enérgico", "Calmo", "Tranquilo", "Sereno"] },
  { titulo: "Proximidade", opcoes: ["Próximo", "Íntimo", "Amigável", "Familiar", "Gente boa"] },
  { titulo: "Autoridade/confiança", opcoes: ["Profissional", "Técnico", "Autoritativo", "Confiante", "Sério"] },
  { titulo: "Personalidade/estilo", opcoes: ["Espontâneo", "Bem-humorado", "Carismático", "Simpático", "Educado", "Gentil"] },
  { titulo: "Objetividade", opcoes: ["Sucinto", "Prático", "Eficiente", "Sem rodeios"] },
  { titulo: "Regionalidade", opcoes: ["Regional/local", "Neutro"] },
];

const ESTILOS_RAPIDOS = ["curto", "extenso", "sem emojis", "com emojis", "engraçado", "direto", "descontraído"];

export const ROTULO_TAMANHO: Record<number, string> = {
  1: "Curtíssima",
  2: "Curta",
  3: "Média",
  4: "Completa",
  5: "Detalhada",
};

// ---- interpreta a string tom_de_voz de volta pra selecoes (pra editar) ----
export function parseTom(tom: string): { porCategoria: Record<string, string>; rapidos: string[] } {
  const t = (tom || "").toLowerCase();
  const porCategoria: Record<string, string> = {};
  for (const cat of CATEGORIAS) {
    for (const op of cat.opcoes) {
      if (t.includes(op.toLowerCase())) {
        porCategoria[cat.titulo] = op;
        break;
      }
    }
  }
  const rapidos = ESTILOS_RAPIDOS.filter((e) => t.includes(e));
  return { porCategoria, rapidos };
}

function montarTom(porCategoria: Record<string, string>, rapidos: string[]): string {
  const partes = [
    ...Object.values(porCategoria).map((v) => v.toLowerCase()),
    ...rapidos,
  ];
  return partes.join(", ");
}

// ---- PREVIEW deterministico (sem IA): monta a mensagem-exemplo por partes ----
function montarPreview(porCategoria: Record<string, string>, rapidos: string[], nivel: number): string {
  const tem = (c: string, v: string) => porCategoria[c] === v;
  const rapido = (e: string) => rapidos.includes(e);

  const semEmoji = rapido("sem emojis") || tem("Formalidade", "Formal") || tem("Formalidade", "Cerimonioso");
  const comEmoji = rapido("com emojis") && !semEmoji;
  const nivelEfetivo = rapido("curto") ? Math.min(nivel, 2) : rapido("extenso") ? Math.max(nivel, 4) : nivel;

  // saudacao pela formalidade
  let saudacao = "Oi, tudo bem?";
  if (tem("Formalidade", "Formal")) saudacao = "Olá, tudo bem?";
  if (tem("Formalidade", "Cerimonioso")) saudacao = "Prezado(a) paciente, seja bem-vindo(a).";
  if (tem("Formalidade", "Semi-formal")) saudacao = "Olá! Tudo bem?";
  if (tem("Formalidade", "Coloquial") || tem("Formalidade", "Informal")) saudacao = "Oii, tudo bem?";
  if (tem("Regionalidade", "Regional/local")) saudacao = "Oii, tudo certinho por aí?";

  // pergunta final
  let pergunta = "Como posso te ajudar hoje?";
  if (tem("Formalidade", "Formal") || tem("Formalidade", "Cerimonioso")) pergunta = "Em que posso ajudá-lo(a)?";
  if (rapido("direto") || tem("Objetividade", "Sem rodeios")) pergunta = "Me conta o que você precisa.";

  // recheios opcionais (entram conforme o tamanho permite)
  const recheios: string[] = [];
  if (tem("Calor humano", "Acolhedor") || tem("Calor humano", "Caloroso"))
    recheios.push("Que bom ter você por aqui!");
  if (tem("Calor humano", "Empático") || tem("Calor humano", "Atencioso"))
    recheios.push("Pode ficar tranquilo(a) que eu te acompanho em tudo.");
  if (tem("Proximidade", "Gente boa") || tem("Proximidade", "Amigável") || tem("Proximidade", "Próximo"))
    recheios.push("Fala comigo à vontade, tá?");
  if (tem("Autoridade/confiança", "Profissional") || tem("Autoridade/confiança", "Técnico"))
    recheios.push("Sou responsável pelos agendamentos e informações da clínica.");
  if (tem("Autoridade/confiança", "Confiante"))
    recheios.push("Deixa comigo que eu resolvo rapidinho.");
  if (tem("Personalidade/estilo", "Bem-humorado") || rapido("engraçado"))
    recheios.push(semEmoji ? "Prometo atender mais rápido que anestesia pegando, haha." : "Prometo atender mais rápido que anestesia pegando 😄");
  if (tem("Energia/ritmo", "Animado") || tem("Energia/ritmo", "Enérgico"))
    recheios.push(semEmoji ? "Bora resolver isso agora!" : "Bora resolver isso agora! 🚀");
  if (tem("Energia/ritmo", "Calmo") || tem("Energia/ritmo", "Tranquilo") || tem("Energia/ritmo", "Sereno"))
    recheios.push("Sem pressa, no seu tempo.");

  const emoji = comEmoji || (!semEmoji && (rapido("descontraído") || tem("Formalidade", "Informal")));
  const carinha = emoji ? " 😊" : "";

  // monta pelo tamanho-alvo
  if (nivelEfetivo <= 1) return `${saudacao} ${pergunta}`.replace("?.", "?");
  if (nivelEfetivo === 2) return `${saudacao}${carinha} ${pergunta}`;
  if (nivelEfetivo === 3) {
    const r = recheios[0] ? ` ${recheios[0]}` : "";
    return `${saudacao}${carinha}${r} ${pergunta}`;
  }
  if (nivelEfetivo === 4) {
    const r = recheios.slice(0, 2).join(" ");
    return `${saudacao}${carinha} ${r ? r + " " : ""}${pergunta}`;
  }
  const r = recheios.slice(0, 3).join(" ");
  const extra = emoji ? "\n\nPosso agendar consulta, remarcar horário ou tirar dúvidas 🦷" : "\n\nPosso agendar consulta, remarcar horário ou tirar dúvidas.";
  return `${saudacao}${carinha} ${r ? r + " " : ""}${extra}\n${pergunta}`;
}

export default function TomDeVozEditor({
  tom,
  nivel,
  onTom,
  onNivel,
}: {
  tom: string;
  nivel: number;
  onTom: (t: string) => void;
  onNivel: (n: number) => void;
}) {
  const { porCategoria, rapidos } = parseTom(tom);

  function clicaCategoria(cat: string, op: string) {
    const novo = { ...porCategoria };
    if (novo[cat] === op) delete novo[cat];
    else novo[cat] = op;
    onTom(montarTom(novo, rapidos));
  }
  function clicaRapido(e: string) {
    let novos = rapidos.includes(e) ? rapidos.filter((x) => x !== e) : [...rapidos, e];
    // pares que se excluem: selecionar um tira o oposto
    const OPOSTOS: Record<string, string> = {
      "sem emojis": "com emojis",
      "com emojis": "sem emojis",
      curto: "extenso",
      extenso: "curto",
    };
    const oposto = OPOSTOS[e];
    if (oposto && novos.includes(e)) novos = novos.filter((x) => x !== oposto);
    onTom(montarTom(porCategoria, novos));
  }

  const chip = (ativo: boolean) => ({
    padding: "6px 11px",
    fontSize: 12.5,
    borderRadius: 18,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1px solid ${ativo ? "var(--ok)" : "var(--border-forte)"}`,
    background: ativo ? "var(--ok)" : "var(--surface)",
    color: ativo ? "#fff" : "var(--text)",
    fontWeight: ativo ? 700 : 400,
    transition: "all 0.12s ease",
  });

  const preview = montarPreview(porCategoria, rapidos, nivel);

  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
      {/* ESQUERDA: estilos rapidos + categorias em colunas */}
      <div style={{ flex: "2 1 380px", minWidth: 300 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            Estilo rápido
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ESTILOS_RAPIDOS.map((e) => (
              <button key={e} type="button" onClick={() => clicaRapido(e)} style={chip(rapidos.includes(e))}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {CATEGORIAS.map((cat) => (
            <div key={cat.titulo}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                {cat.titulo}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
                {cat.opcoes.map((op) => (
                  <button key={op} type="button" onClick={() => clicaCategoria(cat.titulo, op)} style={chip(porCategoria[cat.titulo] === op)}>
                    {op}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DIREITA: slider de tamanho + preview estilo WhatsApp */}
      <div style={{ flex: "1 1 260px", minWidth: 250, position: "sticky", top: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          Tamanho das mensagens: <span style={{ color: "var(--ok)" }}>{ROTULO_TAMANHO[nivel] || "Média"}</span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={nivel}
          onChange={(e) => onNivel(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--ok)" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          <span>← mais curta</span>
          <span>mais completa →</span>
        </div>

        {/* nuvemzinha estilo WhatsApp (mensagem ENVIADA = verde) */}
        <div
          style={{
            marginTop: 12,
            padding: "14px 12px",
            borderRadius: 12,
            background: "var(--bg)",
            border: "1px dashed var(--border-forte)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, textAlign: "center" }}>
            exemplo de como a IA vai falar (mensagem fictícia)
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div
              style={{
                maxWidth: "92%",
                padding: "9px 12px",
                background: "#d9fdd3",
                color: "#111b21",
                borderRadius: "10px 10px 4px 10px",
                fontSize: 13.5,
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
                boxShadow: "0 1px 1px rgba(0,0,0,0.12)",
                position: "relative",
              }}
            >
              {preview}
              <div style={{ fontSize: 10, color: "#667781", textAlign: "right", marginTop: 3 }}>
                12:30 ✓✓
              </div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.45 }}>
          O exemplo é montado aqui na tela (não gasta IA). No atendimento real, a IA segue esse
          tom e tamanho à risca.
        </div>
      </div>
    </div>
  );
}
