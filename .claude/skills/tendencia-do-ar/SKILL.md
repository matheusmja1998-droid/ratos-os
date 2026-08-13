---
name: tendencia-do-ar
description: Radar semanal de pautas pro conteúdo do Cockpit. Roda 3 radares em paralelo (dor do avatar Gestor Sufocado + atualizações de IA/Claude/ferramentas + vídeos curados de TikTok/Instagram/YouTube transcritos) e gera 7 pautas de carrossel/semana. Cada carrossel tem versão vídeo derivada (bastidor mostrando rodando). Use quando o usuário disser /tendencia-do-ar, "planeja a semana de conteúdo", "qual a pauta dessa semana", "o que postar essa semana no Cockpit", ou quando mandar link de TikTok/Instagram/YouTube dizendo "salva esse vídeo na tendência" / "joga isso na tendência" / "guarda esse vídeo pra analisar".
---

# /tendencia-do-ar — Radar de Pautas Cockpit

## O que essa skill faz

Toda segunda-feira, gera o plano de 7 carrosséis da semana pro conteúdo do Cockpit. Cada carrossel também vira roteiro de vídeo bastidor (mostrando a stack rodando na prática).

Não escreve carrossel aqui. Escreve o **plano**. A produção é feita pelas skills `/carrossel-ratos` e `/cockpit-creative`.

## Posicionamento

Esta skill é **exclusiva do Cockpit** (Ratos de IA). Não usar pra clientes da WinVision/LM. O avatar é o **Gestor Sufocado** (ver `obsidian/Cockpit/01 — Avatar.md`).

Big Idea: **"O gestor que opera diferente."**

## Modos de operação

A skill tem 2 modos:

### Modo A — Salvar vídeo na fila (rápido)

Quando o Matheus mandar **link de TikTok/Instagram/YouTube/Reels** com qualquer das frases:
- "salva esse vídeo na tendência"
- "joga isso na tendência"
- "guarda esse vídeo pra analisar"
- "manda pra skill de tendência"
- ou só o link sem texto, em contexto de pesquisa de tendência

→ Adicionar linha em `conteudo/cockpit/radar/videos-pra-analisar.md` na seção "Fila atual" no formato:
```
- [ ] YYYY-MM-DD plataforma URL — nota opcional
```

Confirmar no chat: "Salvo na fila. Tem X vídeos esperando análise. Roda /tendencia-do-ar segunda pra processar tudo."

**Não transcrever na hora.** Acumula a fila pra processar em lote no Modo B.

### Modo B — Rodar radar completo (segunda)

Quando o Matheus disser `/tendencia-do-ar`, "planeja a semana", etc., rodar os 3 radares + gerar plano. Workflow detalhado abaixo.

---

## Estrutura de saída — 7 carrosséis/semana

Os 7 carrosséis se distribuem em 4 ângulos editoriais + 1 transversal:

| # | Ângulo | % | Trilha | Vídeo derivado |
|---|---|---|---|---|
| 3 | Bastidor da operação | 40% | Notícia/explicação | Sim (bastidor real, 30s) |
| 2 | Caso real (números) | 25% | Storytelling | Sim (print + voiceover) |
| 1 | Provocação técnica | 15% | Opinião forte | Sim (talking head, 45s) |
| 1 | Manifesto/identidade | 15% | Posicionamento | Sim (talking head, 60s) |

**Trilha transversal (se a semana tiver release importante):** substituir 1 dos bastidores por **Notícia de mercado** (atualização de Claude/IA/ferramenta + tradução pro avatar). Esse vira automaticamente um carrossel + vídeo de bastidor mostrando a feature nova rodando dentro do Cockpit.

## Workflow

### 1. Verificar dependências

Ler:
- `obsidian/.../Cockpit/01 — Avatar.md` (avatar e dores)
- `obsidian/.../Cockpit/03 — Conteúdo e Comunicação.md` (ângulos, tom, banco de hooks)
- `marca/design-guide.md` (paleta Cockpit)
- `conteudo/cockpit/radar/atualizacoes-cobertas.md` (release log — pra dedup)
- `conteudo/cockpit/radar/dores-cobertas.md` (dores já postadas — pra dedup)
- `conteudo/cockpit/radar/videos-pra-analisar.md` (fila de vídeos curados)
- `conteudo/cockpit/radar/videos-ja-analisados.md` (dedup vídeos)
- `conteudo/cockpit/radar/posts-x-cobertos.md` (dedup posts X/Twitter)

Se algum dos arquivos de radar não existir, criar vazio.

### 2. Rodar Radar 1 — Dor do Avatar

Buscar o que tá vivo essa semana nas comunidades onde o Gestor Sufocado vive. Usar WebSearch + WebFetch.

**Fontes prioritárias:**
- Reddit: r/PPC, r/FacebookAds, r/GoogleAds, r/marketing — buscar threads recentes (últimos 7 dias) com queries: "ios 17 tracking", "facebook ads not working", "campaign performance dropped", "agency client report"
- LinkedIn: buscar posts virais sobre tracking, iOS, Meta, Google em PT-BR (queries: "tráfego pago iOS", "agência relatório cliente", "CAPI server-side", "Meta Ads atualização")
- Twitter/X: contas @rohitc1106, @ppcgreg, @AdsLiaison — últimas 7 dias
- Hotmart/comunidades BR: Sobral, V4, Cazé, Subido — se tiver acesso público recente

**Filtro:** só dor que combina com sintomas listados em `01 — Avatar.md` (acordar 3h, cliente cobrando ROI, criativo morto, relatório domingo, iOS ferrou, etc.).

**Output:** lista de 5-8 dores frescas, cada uma com:
- Sintoma específico (frase real, não paráfrase)
- Quantas vezes apareceu essa semana (frequência aproximada)
- Link de exemplo (se tiver)
- Ângulo recomendado (qual dos 4)

### 3. Rodar Radar 2 — Atualizações de IA/Claude/Ferramentas

Buscar o que mexeu no mercado de IA aplicada a tráfego. Usar WebFetch nas fontes:

**Fontes obrigatórias (toda segunda):**
- `https://www.anthropic.com/news` — releases de modelo, features
- `https://docs.claude.com/en/release-notes` — changelog do Claude
- GitHub releases: `https://github.com/anthropics/claude-code/releases` — Claude Code
- `https://docs.anthropic.com/en/docs/claude-code/changelog` — Claude Code changelog
- `https://x.com/AnthropicAI` (via fxtwitter) — últimas 7 dias
- `https://x.com/alexalbert__` (via fxtwitter)

**Fontes de mercado:**
- `https://developers.facebook.com/docs/marketing-api/changelog` — Meta Marketing API
- `https://ads-developers.googleblog.com/` — Google Ads
- `https://docs.n8n.io/release-notes/` — n8n changelog
- WebSearch: "OpenAI release this week", "Google Gemini update", "MCP protocol news"

**Dedup:** comparar com `conteudo/cockpit/radar/atualizacoes-cobertas.md`. Não trazer release que já virou pauta nas últimas 4 semanas.

**Filtro de relevância:** só trazer atualização que pode ser **traduzida pro avatar** (gestor de tráfego). Lançamento técnico que não tem aplicação prática em agência → descartar ou registrar como "watchlist" sem virar pauta.

**Output:** lista de 3-6 atualizações da semana, cada uma com:
- O que saiu (nome da feature/release)
- Data
- Tradução pro avatar ("pra gestor de tráfego isso significa X")
- Aplicação prática dentro do Cockpit (qual skill/feature usa isso)
- Fonte (link)
- Ângulo recomendado (Notícia → vira carrossel notícia + vídeo bastidor)

### 3.4. Rodar Radar X/Twitter — Threads virais sobre Claude Code

Limitação técnica: `fxtwitter.com/{user}` só retorna metadados de perfil, não timeline. Pra ler timeline pública sem login não dá. Em vez disso, usar **WebSearch** pra pegar threads que o Google indexou (geralmente as virais).

**Queries obrigatórias (rodar toda segunda em paralelo):**

```
WebSearch: "claude code" site:x.com
WebSearch: "claude opus 4.7" site:x.com
WebSearch: "claude agent skill" site:x.com
WebSearch: "claude mcp" site:x.com
WebSearch: claude code workflow site:x.com 2026
WebSearch: anthropic release site:x.com
```

**Fluxo:**

1. Rodar todas as queries em paralelo
2. Pegar URLs únicas de tweets (formato `x.com/user/status/ID`)
3. Pra cada URL, fazer WebFetch via fxtwitter substituindo o domínio:
   `x.com/user/status/123` → `api.fxtwitter.com/user/status/123`
4. Esse endpoint funciona pra tweet específico (diferente do endpoint de perfil) e retorna texto, autor, engajamento, mídia
5. Filtrar:
   - Posts dos últimos 7 dias
   - Engajamento >500 likes ou que gerou debate
   - Tema relevante pro avatar (Claude Code, agentes, automação aplicada, IA pra dev/marketing)

**Output:** lista de 5-10 threads/posts da semana com:
- @autor + data
- Citação principal (1-2 frases)
- Engajamento aproximado
- Link original
- Por que importa pro avatar
- Ângulo recomendado se virar pauta

**Dedup:** `conteudo/cockpit/radar/posts-x-cobertos.md`. Não reusar.

**Posts que viram pauta sozinhos:**
Karpathy/Anthropic/alex albert/Simon Willison falando algo forte sobre Claude Code → vira pauta tipo "X pessoa famosa disse Y. Eis o que isso significa pra gestor de tráfego."

### 3.5. Rodar Radar 3 — Vídeos curados (TikTok / Instagram / YouTube)

Ler `conteudo/cockpit/radar/videos-pra-analisar.md`. Pegar todos os links da seção "Fila atual" que estiverem com `- [ ]` (não processados).

**Pra cada vídeo:**

1. Chamar a skill `/transcribe` com o URL pra baixar e transcrever (suporta TikTok, Instagram, YouTube, Reels via yt-dlp)
2. Analisar a transcrição extraindo:
   - **Tema central** (ex: "subagentes no Claude Code", "MCP server custom", "automação de tráfego com Claude")
   - **Hook usado** (primeiros 5 segundos / primeira frase)
   - **Ângulo** (educacional / provocação / bastidor / caso real)
   - **Insight forte** (a frase mais quotable do vídeo)
   - **Tempo aproximado** (curto < 60s, médio 1-5min, longo > 5min)
   - **Aplicabilidade pro avatar** (esse tema cabe em conteúdo de gestor de tráfego? Sim / Não / Adaptado)

3. Marcar como processado: trocar `- [ ]` por `- [x]` no arquivo da fila

4. Adicionar linha em `videos-ja-analisados.md`:
   ```
   - [YYYY-MM-DD] plataforma URL — tema extraído / hook / ângulo
   ```

**Após processar todos:**

Identificar **padrões** entre os vídeos da semana:
- 3+ vídeos no mesmo tema = tendência forte (vira pauta)
- Hook que aparece repetido = formato testado
- Ângulo que tá bombando = adotar na semana

**Output:** lista resumida de:
- Temas dominantes da semana (com quantos vídeos cada)
- Hooks notáveis (com source)
- 2-3 vídeos individuais excepcionais (que sozinhos viram pauta)

Se a fila estiver vazia, pular esse radar e seguir.

### 4. Apresentar briefing pro usuário

Antes de propor as 7 pautas, mostrar o radar bruto:

```
## Radar da semana — [semana XX, ano]

### O avatar tá sentindo:
1. [dor 1] — visto X vezes essa semana ([fonte])
2. [dor 2] — ...
...

### O mercado de IA mexeu em:
1. [release 1] — [data] — [tradução pro avatar]
2. [release 2] — ...
...

### Vídeos curados (X analisados):
Temas dominantes:
- [tema A] — X vídeos
- [tema B] — X vídeos

Hooks notáveis:
- "[hook 1]" — [source]
- "[hook 2]" — [source]

Vídeos excepcionais (vira pauta sozinho):
1. [URL] — [tema] — [por que vira pauta]

### Posts X/Twitter da semana:
Threads virais:
1. @[handle] — "[citação]" — [link]
2. @[handle] — "[citação]" — [link]

Posts individuais que viram pauta sozinhos:
- @[handle] [link] — [por que importa pro avatar]

Vou propor 7 pautas baseado nisso. Posso seguir?
```

**CHECKPOINT:** esperar o usuário aprovar ou pedir pra incluir/remover algum tema.

### 5. Propor as 7 pautas

Distribuição padrão (ajustar conforme o radar):

- **3 Bastidores** (ou 2 + 1 Notícia se tiver release forte)
- **2 Casos reais**
- **1 Provocação técnica**
- **1 Manifesto**

Pra cada pauta, entregar:

```
## Pauta [N] — [TÍTULO DE TRABALHO]

**Ângulo:** [Bastidor / Caso / Provocação / Manifesto / Notícia]
**Trilha:** [Carrossel principal] + [Vídeo bastidor derivado]

**Tensão central:**
[1-2 frases sobre a fricção/contradição que o conteúdo vai explorar]

**Conexão com avatar:**
[Qual dor específica do Gestor Sufocado isso resolve. Citar frase real do avatar se possível]

**Hook recomendado (carrossel):**
[Hook puxado do banco em 03-Conteúdo, ou novo se a tendência pedir]

**5 opções de capa:**
A: [título] / [subtítulo]
B: [título] / [subtítulo]
C: [título] / [subtítulo]
D: [título] / [subtítulo]
E: [título] / [subtítulo]

**Estrutura sugerida do carrossel:**
- Slide 2 (hook): [direção]
- Slides 3-4 (mecanismo): [direção]
- Slides 5-7 (provas): [direção, com dado/print/caso específico]
- Slides 8-9 (virada): [direção]
- Slide final (CTA): [pergunta direta que provoque DM]

**Vídeo derivado (bastidor de 30-60s):**
- Abertura: [primeira cena]
- Demonstração: [o que mostrar na tela/stack rodando]
- Fechamento: [frase de virada]

**Skill que produz:**
- Carrossel: `/carrossel-ratos`
- Vídeo: roteiro só (gravação manual)

**CTA forte (gera DM):**
[Pergunta específica ou oferta — não "segue pra mais"]

**Fonte/contexto:**
[Link da dor original ou release]
```

### 6. Salvar plano semanal

Após aprovação, salvar em:

`conteudo/cockpit/semanas/YYYY-WW.md` (ex: `2026-18.md`)

Estrutura do arquivo:

```markdown
# Semana [XX] — [data início] a [data fim]

## Resumo
- 7 carrosséis + 7 vídeos derivados
- Distribuição: [X bastidores, X casos, X provocações, X manifestos, X notícias]

## Radar usado
[copiar dores e releases do briefing]

## Pautas
[as 7 pautas completas]

## Status de produção
- [ ] Pauta 1 — carrossel
- [ ] Pauta 1 — vídeo
- [ ] Pauta 2 — carrossel
- [ ] Pauta 2 — vídeo
...
```

### 7. Atualizar release logs (dedup)

- Adicionar todas atualizações usadas em `conteudo/cockpit/radar/atualizacoes-cobertas.md` com data
- Adicionar todas dores usadas em `conteudo/cockpit/radar/dores-cobertas.md` com data

Formato:
```
- [2026-04-27] Claude 4.7 1M context — usado na pauta 3 da semana 18
```

### 8. Sugerir próximos passos

Ao final, perguntar:

> "Plano da semana salvo. Quer que eu já comece a produzir o carrossel da pauta 1 com /carrossel-ratos? Ou prefere começar por outra?"

## Regras de qualidade

**O CTA é sagrado.** Cada pauta precisa ter um CTA que provoque DM. KPI mês 1 é 5 DMs/semana. Sem CTA forte, a pauta volta pra revisão. Nunca aceitar "segue pra mais" ou "comenta aí".

**Especificidade ou nada.** Se a dor não tem frase real do avatar, não vira pauta. Se a atualização não tem aplicação dentro do Cockpit, não vira pauta. Genérico = lixo.

**Ângulo 7 (caso de uso real com feature nova) > tudo.** Quando uma atualização permitir mostrar a feature rodando dentro de uma stack de cliente real, prioriza essa. É o conteúdo mais difícil de copiar.

**Bastidor sempre vence inspiração.** Se a semana tiver dúvida entre bastidor e manifesto, vai de bastidor. 40% do conteúdo é bastidor por decisão estratégica.

**Dedup obrigatório.** Não repetir release ou dor nas últimas 4 semanas, exceto se houver atualização nova naquele tema.

## Padrões proibidos no output

- "Domine o tráfego", "gestor 7 dígitos", promessa de faturamento
- Termos genéricos ("escala", "growth", "performance") sem contexto
- "Curso", "treinamento", "formação"
- CTA cordial ("espero que tenha gostado")
- Travessões (—)
- Paráfrases de dor — sempre frase real do avatar
- Pauta sem dado/print/caso concreto

## Output final esperado

Um arquivo `conteudo/cockpit/semanas/YYYY-WW.md` com 7 pautas prontas pra virar carrossel + vídeo, e dois arquivos de log atualizados em `conteudo/cockpit/radar/`.
