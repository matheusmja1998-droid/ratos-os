---
name: cockpit-creative
description: >
  Cria pacote de 10 criativos de imagem para anúncios Meta Ads dos experts da WinVision
  (estrutura Andrômeda: 5 vídeos + 10 imagens por campanha, onde imagem funciona como
  remarketing do vídeo). Gera copy usando Schwartz (diagnóstico de consciência) + Hormozi
  (value equation), aplica compliance duplo (NZ para Fernanda + política Meta de serviços
  financeiros), renderiza em dois formatos (feed 1080x1080 e stories 1080x1920) via Playwright.
  Use quando o usuário disser "criar anúncio", "criar anúncios", "novo lote de criativos",
  "criativos de imagem", "anúncio de remarketing", ou /criar-anuncio.
---

---

## 🚀 Setup conversacional (primeira vez)

> Quando rodar `/cockpit-creative` pela primeira vez ou `/cockpit-creative setup`.

### Passo 1 — Verificar pré-requisitos

> "Cockpit Creative gera 10 criativos de imagem por demanda. Pra funcionar:
>
> 1. Playwright (renderiza HTML em PNG) — eu instalo
> 2. Identidade visual da agência ou cliente — vou perguntar
> 3. Estilo de criativo preferido
>
> Vamos? (vai/cancelar)"

### Passo 2 — Instalar Playwright

```bash
cd ~/Cockpit && npx playwright install chromium
```

> "✅ Playwright instalado."

### Passo 3 — Configurar identidade visual

> "Agora a identidade visual. Tu quer:
>
> 1. **Identidade da agência** (mesma pra todos clientes)
> 2. **Por cliente** (cada cliente tem sua identidade — recomendado)
>
> Qual? (1/2)"

Se 2: explicar que cada vez que gerar criativo, vai usar identidade do cliente em `clientes/[slug]/marca/`.

Pra cada identidade (agência ou cliente):

> "Me passa:
>
> - **Cor principal** (hex, ex: #FF5C35)
> - **Cor secundária** (hex)
> - **Fonte preferida** (ou diz 'padrão')
> - **Logo** (caminho do arquivo, ou pula se ainda não tem)
> - **Estilo geral**:
>   1. Minimalista — clean, muito espaço em branco
>   2. Bold — impactante, contrastes fortes
>   3. Editorial — tipográfico, elegante"

Salvar em `marca/design-guide.md` (ou `clientes/[slug]/marca/design-guide.md`).

### Passo 4 — Criar pasta de criativos no _modelo/

```bash
mkdir -p ~/Cockpit/clientes/_modelo/criativos/{aprovados,em-teste,arquivados}
```

(Já criada pelo `cockpit-setup`, mas confirmar.)

### Passo 5 — Teste de validação ao vivo

> "Vou gerar 3 criativos de teste agora pra ti ver. Tema: 'oferta de teste'.
>
> Confere a pasta `~/Cockpit/clientes/_teste/criativos/em-teste/` em uns 30 segundos."

Rodar geração de teste. Mostrar caminho dos arquivos PNG gerados.

### Passo 6 — Confirmação + próximos passos

> "✅ **Cockpit Creative configurado.**
>
> Comandos:
>
> - `/cockpit-creative [cliente] tema "[tema]"` — gera 10 criativos
> - `/cockpit-creative [cliente] reels tema "[tema]"` — formato 9:16
> - `/cockpit-creative [cliente] feed tema "[tema]"` — formato 1:1
>
> **Stack quase completa.** Se tu comprou Install, falta:
>
> - Cockpit Track (server-side) — em construção
> - Cockpit Google (Google Ads) — em construção
>
> Quando ficarem prontos, eu te aviso pra clonar.
>
> Por enquanto, tua stack tá assim:
>
> ✅ cockpit-setup
> ✅ cockpit-onboarding
> ✅ cockpit-dossie
> ✅ cockpit-meta
> ✅ cockpit-guardiao
> ✅ cockpit-debrief
> ✅ cockpit-report
> ✅ cockpit-creative
>
> Boas pilotagens. 🚀"

---

# /criar-anuncio — Criação de Criativos de Imagem (Andrômeda)

## Contexto estratégico

Estrutura Andrômeda de campanhas Meta Ads: 5 criativos em vídeo + 10 criativos em imagem por campanha. O vídeo é o primeiro contato. Quando a pessoa vê o vídeo, o algoritmo começa a servir as 10 imagens como remarketing. Por isso as 10 imagens precisam variar ângulo e layout — se forem parecidas, cansam rápido e perdem performance.

Esta skill produz o pacote das 10 imagens. Vídeo não é escopo.

---

## Dependências

- **Obsidian vault:** `/Users/matheusjardim/claude/obsidian/Matheus/` — briefing do lançamento e dossiê do expert
- **Biblioteca Hormozi:** `/Users/matheusjardim/claude/Ratos OS/lm/biblioteca/negocio/hormozi/` (100M Offers, 100M Leads, 100M Money Models)
- **Skill de copy:** `schwartz-copy` (diagnóstico de consciência + níveis de sofisticação)
- **Playwright CLI:** `npx playwright screenshot`. Se nunca usou: `npx playwright install chromium`
- **Preferências de tom:** `_contexto/preferencias.md` (sem travessão, direto, sem corporativo)

---

## Experts suportados

Hoje: **Fernanda Serraglia** (Vem Doleta).

Se o usuário pedir para outro expert, pedir pra apontar o diretório de briefing/dossiê no Obsidian antes de prosseguir.

---

## Workflow em 4 Fases

### Fase 0 — Intake e contexto

1. Perguntar: "Pra qual expert?" (se não disse)
2. Perguntar: "Qual lançamento?" (default: o mais recente ativo na pasta de Lançamentos do Obsidian)
3. Ler automaticamente:
   - Briefing do lançamento (ex: `obsidian/Matheus/Trabalho/WinVision/Clientes/Fernanda Serraglia — Vem Doleta/Lançamentos/[LANÇAMENTO].md`)
   - Dossiê do expert (ex: `.../Fernanda Serraglia — Dossiê.md`)
   - CLAUDE.md do cliente (compliance, avatar, provas sociais)
   - `hormozi-100m-offers.md` (pra aplicar value equation)
4. Perguntar: "Algum ângulo ou promessa específica que você quer priorizar nesse lote? (ex: atacar objeção X, reforçar prova social Y, testar nova headline Z) — se não, eu escolho os 10 ângulos"

---

### Fase 1 — Diagnóstico estratégico (Schwartz)

Com o contexto em mãos, diagnosticar:

**A) Nível de consciência do público neste momento do lançamento**
- Captação fria (antes do aquecimento) → maioria nível 4-5 (problem/unaware)
- Durante CPLs → mix 3-4 (solution/problem aware)
- Pós-CPL / reabertura de carrinho → 1-2 (most/product aware)

**B) Sofisticação do mercado**
- Educação financeira pra imigrantes é mercado de sofisticação **média-alta**: já existem muitos gurus, muitas promessas de enriquecimento. Precisa de mecanismo único e prova forte, não só promessa.

**C) Definir os 10 ângulos**

Distribuir os 10 criativos cobrindo variação de ângulo (pra não cansar no remarketing) e mix de níveis de consciência:

| # | Ângulo | Nível consciência alvo | Objetivo |
|---|---|---|---|
| 1 | História pessoal do expert | 5 | Identificação ("ela era como eu") |
| 2 | Prova social forte (aluna) | 4 | Credibilidade via resultado alheio |
| 3 | Contrarian / quebra de crença | 4-5 | "Tudo que te disseram sobre X está errado" |
| 4 | Curiosity gap / pergunta provocativa | 5 | Parar o scroll |
| 5 | Autoridade / bastidores | 3 | Mostrar método, não prometer resultado |
| 6 | Objeção principal destruída | 3-4 | "Não tenho tempo / dinheiro / conhecimento" |
| 7 | Urgência legítima (janela do evento) | 2-3 | CTA de inscrição |
| 8 | Identificação com avatar | 4-5 | "Se você é X e sente Y..." |
| 9 | Mecanismo único (como funciona) | 3 | Nome próprio pro método |
| 10 | Oferta / convite direto pro evento | 1-2 | Fechar, CTA forte |

Ajustar a mistura se o usuário apontou prioridade específica na Fase 0.

---

### Fase 2 — Copy dos 10 criativos

Pra cada um dos 10, gerar:
- **Headline** (máx 8-10 palavras, o gancho visual principal)
- **Corpo** (2-4 linhas curtas, o argumento central)
- **CTA** (ação clara, ex: "Garanta sua vaga", "Entre no grupo VIP")

Aplicar princípios Hormozi (100M Offers):
- **Value equation:** maximizar sonho + probabilidade percebida, minimizar tempo + esforço percebido. Sem inflar promessa — calibrar percepção.
- **Especificidade:** número específico > número redondo. "Em 47 dias" > "em menos de 2 meses".
- **Prova > promessa:** toda afirmação forte precisa vir ancorada em prova (aluna, estudo, dado).
- **Naming:** nomear o método/sistema aumenta valor percebido.

**Tom:**
- Informal, direto (sem corporativo)
- Sem travessão (—) em nenhum lugar
- Frases curtas
- Sem bullets escondidos em copy de anúncio

---

### Fase 3 — Compliance duplo (CRÍTICO — antes de mostrar ao usuário)

Rodar cada copy pelos dois filtros. Se falhar em qualquer um, reescrever.

#### Filtro 1 — Compliance NZ (Fernanda)

**PROIBIDO:**
- "Aprenda a investir", "Ensino a investir", "Te ensino onde colocar dinheiro"
- "Carteira recomendada", "Análise de carteira", "Recomendação de ativos"
- "Garantia de retorno", "X% ao mês/ano garantido"
- "Vai ficar rico", "Renda passiva garantida"
- Promessa de resultado financeiro específico em nome da Fernanda
- **Qualquer termo que sugira segurança no investimento.** Investir tem risco e a gente não pode garantir que é seguro. PROIBIDO usar: "investimento seguro", "forma segura de investir", "proteja seu dinheiro com segurança", "sem risco", "risco zero", "garantido", "100% seguro", "investimento protegido", "dinheiro a salvo", "blindado", "à prova de crise", "estabilidade garantida", "porto seguro", "investimento sem perda", ou qualquer variação que prometa ausência de risco. Mesmo termos suavizados como "mais seguro", "seguro o suficiente", "segurança financeira garantida" são proibidos. Se a copy precisar falar de proteção/preservação, usar enquadramentos descritivos sem prometer segurança (ex: "como brasileiros estão diversificando em moeda forte" em vez de "proteja seu dinheiro de forma segura").

**PERMITIDO (reframe):**
- "Descubra os caminhos que..." (em vez de "aprenda a")
- "Veja como [nome da aluna] fez" (prova social, resultado dela, não promessa da Fernanda)
- "Conheça o método" (educacional, sem promessa)
- "Entenda como brasileiros no exterior estão protegendo patrimônio" (educativo)

#### Filtro 2 — Política Meta (serviços financeiros)

**PROIBIDO:**
- Valor monetário específico como promessa ("Ganhe R$10k/mês", "De zero a 100k em 6 meses" — mesmo sendo prova social, se for headline principal a Meta derruba)
- Targeting implícito pejorativo ("Você que está endividado", "Se você está quebrado")
- "Renda extra garantida", "Ganhe dinheiro fácil"
- Antes/depois financeiro com números explícitos na imagem principal
- Claim de resultado universal ("Funciona pra qualquer um")

**PERMITIDO:**
- Prova social contextualizada dentro de história ("Lovane saiu da Nova Zelândia sem saber por onde começar. Hoje segue o método da Vem Doleta.")
- Promessa de aprendizado/conhecimento ("Descubra o que ninguém te contou sobre investir em moeda forte")
- Call to action pra evento gratuito ("Garanta sua vaga no evento")

**REGRA:** se a copy parecer agressiva demais, reescrever em tom mais editorial/educativo. Meta derruba anúncio financeiro ambicioso — melhor copy mais suave rodando do que copy forte parada no limbo.

**CHECKPOINT 1:** mostrar as 10 copies revisadas (com ângulo + headline + corpo + CTA de cada). Esperar aprovação antes de ir pro visual.

---

### Fase 4 — Visual (HTML + Playwright)

#### Identidade visual Vem Doleta

Extraída da página https://vemdoleta.com.br/inscrever-trf:

- **Fundo principal:** `#0A1F1A` (verde-escuro profundo, quase preto)
- **Fundo alternativo:** `#000000` (preto puro, pra variação)
- **Destaque primário:** `#C9E265` (verde-limão vibrante — é a cor da palavra-chave, do CTA)
- **Destaque secundário:** `#D4B572` (dourado/bege, pra detalhes editoriais estilo logo)
- **Texto principal:** `#FFFFFF`
- **Texto secundário:** `#B8C5BE` (cinza-esverdeado claro)
- **Fonte título:** serif editorial (usar `"Playfair Display"` ou `"Cormorant Garamond"` via Google Fonts — combina com o tom institucional do Vem Doleta)
- **Fonte corpo:** sans-serif (usar `"Inter"` via Google Fonts)

#### Formatos obrigatórios

Cada um dos 10 criativos deve ser renderizado em **DOIS formatos**:
- **Feed quadrado:** 1080x1080px
- **Stories vertical:** 1080x1920px

Total: 20 PNGs por rodada.

#### Variação de layout (OBRIGATÓRIA pra remarketing)

Os 10 criativos **NÃO podem ter layout igual**. Distribuir:

- 2 com foto da Fernanda como elemento principal (placeholder se não tiver foto)
- 2 com citação grande em destaque (estilo editorial)
- 2 com prova social (nome + localização + ícone/moldura de foto)
- 2 com headline gigante em fundo sólido (tipografia como elemento principal)
- 2 com frame editorial (tipo capa de jornal/revista, com tag superior tipo "EVENTO GRATUITO")

#### Regras de responsividade

- Padding lateral mínimo: **80px** (feed) / **100px** (stories)
- Padding vertical mínimo: **80px** topo e base
- Tamanhos de fonte seguros:
  - Headline principal (feed): max 72px
  - Headline principal (stories): max 88px
  - Corpo de texto: max 36px
  - Labels uppercase (tag superior): 14px letter-spacing 0.1em
  - CTA: 22-28px com padding 18px 36px
- Sempre checar mentalmente se o texto cabe na altura — se apertar, reduzir fonte ou cortar linha
- `overflow: hidden` no body
- Google Fonts como única dependência externa, tudo inline CSS

#### Nomenclatura de arquivos

Padrão: `[CÓDIGO_LANÇAMENTO]_IMG_[NN]` — ex: `JII_MAI_26_IMG_01`, `JII_MAI_26_IMG_02`.

- Prefixo do lançamento: usar o código de 3 letras do evento + mês/ano (ex: JII = Jornada do Investidor Iniciante, AGV = A Grande Virada — perguntar ao usuário se não souber)
- Sufixo numérico: 2 dígitos (01 a 10)
- Mesmo nome de arquivo para feed e stories (só muda a pasta)

#### Estrutura de arquivos

```
winvision/clientes/[expert]/criativos/YYYY-MM-DD_[lançamento]/
  estrategia.md          # diagnóstico Schwartz + distribuição de ângulos
  copies.md              # as 10 copies finais (headline + corpo + CTA + ângulo)
  feed/
    JII_MAI_26_IMG_01.html + .png   (1080x1080)
    JII_MAI_26_IMG_02.html + .png
    ...
    JII_MAI_26_IMG_10.html + .png
  stories/
    JII_MAI_26_IMG_01.html + .png   (1080x1920)
    JII_MAI_26_IMG_02.html + .png
    ...
    JII_MAI_26_IMG_10.html + .png
```

#### Render

1. Criar HTMLs feed + stories pra criativo 01
2. Renderizar **apenas criativo 01 feed + stories**:
   ```bash
   npx playwright screenshot --viewport-size=1080,1080 --full-page "file:///caminho/feed/criativo-01.html" "feed/criativo-01.png"
   npx playwright screenshot --viewport-size=1080,1920 --full-page "file:///caminho/stories/criativo-01.html" "stories/criativo-01.png"
   ```
3. **CHECKPOINT 2:** mostrar os dois PNGs. Se aprovado, seguir. Se pedir ajuste de estilo, ajustar e re-renderizar só o criativo 01 até aprovação.
4. Aplicar o estilo aprovado aos outros 9 (mantendo variação de layout da lista acima) e renderizar todos.

---

## Regras gerais

- Texto aprovado na Fase 3 não muda na Fase 4 (visual). Se o usuário quiser mudar copy, volta pra Fase 2.
- Cada rodada de criativos vai pra pasta datada própria — não sobrescrever lotes anteriores
- Sem travessão (—) em headline, corpo ou CTA
- Se o compliance NZ ou Meta tiver dúvida, perguntar ao usuário antes de aprovar a copy
- Se o briefing do lançamento no Obsidian estiver desatualizado (ex: datas passadas), alertar o usuário antes de seguir
- Salvar em `winvision/clientes/[expert]/criativos/` — não misturar com `criativos/` de outros lançamentos antigos

## Atalhos

- Usuário diz "mais 10" ou "novo lote" → skill pergunta se é pro mesmo lançamento e gera outro pacote com ângulos/copies diferentes (não repetir headline do lote anterior — checar `copies.md` das pastas anteriores antes de escrever)
- Usuário diz "só feed" ou "só stories" → renderiza apenas o formato pedido
- Usuário diz "refaz o criativo 3" → regera só o criativo 3 (copy + HTML + PNG feed + stories)
