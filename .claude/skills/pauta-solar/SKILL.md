# Skill: Pauta Solar

Pesquisa notícias e tendências recentes do setor solar brasileiro e internacional, e devolve pautas de conteúdo prontas para produção — com ângulo comercial, gancho e formato sugerido.

Público-alvo do conteúdo: **donos de integradoras solares** que querem escalar o faturamento.
Posicionamento do Matheus: especialista em estruturação comercial B2B para integradoras solares.

## Como usar

```
/pauta-solar
/pauta-solar foco: agronegócio
/pauta-solar foco: prospecção ativa
/pauta-solar foco: mercado
```

Sem argumento = pesquisa geral, retorna pautas variadas entre os pilares.

---

## Passo a passo

### 1. Identificar foco (se informado)

Se o usuário passou `foco:`, priorizar esse tema nas buscas. Caso contrário, buscar de forma ampla.

### 2. Pesquisar notícias e dados recentes

Rodar buscas em paralelo nos seguintes canais:

**Brasil:**
- `site:canalsolar.com.br` — últimas notícias do setor
- `site:absolar.org.br` — dados e posicionamentos da associação
- `site:portalverde.com.br` — mercado e regulação
- `site:osetoreletrico.com.br` — setor elétrico e energia solar
- Busca geral: `"energia solar" "integradora" OR "mercado solar" Brasil 2025 OR 2026`

**Internacional (para comparar ou trazer tendência):**
- `site:pv-magazine.com solar market 2025 OR 2026`
- `site:solarpowerworldonline.com commercial solar 2025`
- `Bloomberg solar market trend 2026`

**LinkedIn:**
- `linkedin.com/posts energia solar Brasil integradora`

Usar WebSearch para cada busca. Coletar título, fonte e resumo dos 3-5 resultados mais relevantes de cada busca.

### 3. Filtrar pelo ângulo certo

Descartar notícias técnicas (equipamentos, inversores, painéis) que não têm ângulo de negócio.

Priorizar conteúdo que trate de:
- Volume de mercado, crescimento ou retração
- Comportamento do consumidor / decisor
- Mudanças regulatórias com impacto comercial
- Tendências de segmento (agro, comercial, industrial, GDC)
- Dificuldades operacionais de integradoras
- Financiamento e crédito solar

### 4. Gerar as pautas

Gerar entre 3 e 5 pautas. Cada pauta deve seguir um dos pilares abaixo:

**Pilares de conteúdo:**
1. **Mercado com dado real** — um número concreto + perspectiva do que significa pra quem opera uma integradora
2. **Diagnóstico** — descrever uma situação que o dono vive, sem dar a solução ainda. Espelho, não conselho
3. **Tendência com ângulo de negócio** — o que uma mudança de mercado significa pra quem quer crescer agora
4. **Bastidor operacional** — aprendizado real de campo, sem precisar citar cliente. "Essa semana vi isso acontecer..."

**Regras de formato:**
- Nada de "5 motivos", "3 erros", "X razões" — formatos batidos, não usar
- Cada pauta tem: tema, ângulo, gancho sugerido e formato recomendado
- Gancho não começa com "Oi", "Você sabia" ou "Hoje vou falar sobre"
- Tom direto, sem rodeio, como o Matheus fala
- **Jamais usar travessão (—) em qualquer texto gerado pela skill**

### 5. Formato de saída

Para cada pauta, apresentar assim:

---

**Pauta [número] — [Pilar]**

**Tema:** [o assunto central, em uma linha]

**Ângulo:** [a perspectiva específica que o Matheus vai usar — não o que aconteceu, mas o que isso significa pro dono de integradora]

**Gancho sugerido:** [a frase de abertura do post ou vídeo]

**Formato:** [carrossel / vídeo curto / post de texto] | [Instagram / LinkedIn / ambos]

**Fonte:** [de onde veio o dado ou notícia que embasou essa pauta]

---

### 6. Acionar produção automática

Depois de apresentar todas as pautas, perguntar:

> "Quer produzir alguma agora? É só falar o número."

Se o usuário escolher uma pauta:

**Se o formato for carrossel:**
Passar o conteúdo da pauta diretamente para a skill de carrossel. Montar o input assim:

> Tema: [tema da pauta]
> Ângulo: [ângulo da pauta]
> Gancho de capa: [gancho sugerido]
> Público: donos de integradoras solares

Invocar `/carrossel` com esse input já preenchido. A skill de carrossel vai assumir o fluxo a partir daqui (espinha dorsal, checkpoint de capa, visual, PNGs).

**Se o formato for vídeo curto:**
Gerar roteiro de vídeo seguindo a estrutura do curso Engajamento no Talo:
- 0-3s: gancho visual + frase de abertura (usar o gancho sugerido da pauta)
- 4-15s: o problema ou dado de tensão (ângulo da pauta)
- 16-40s: desenvolvimento com dado concreto + perspectiva
- 41-55s: virada prática
- 56-60s: CTA

Salvar em `winvision/conteudo/roteiros/roteiro-[tema-slug]-[YYYY-MM-DD].md`

**Se o formato for post de texto:**
Gerar o post completo:
- Gancho nos primeiros 2 parágrafos (antes do "ver mais")
- Desenvolvimento em 3-4 parágrafos curtos
- CTA no final
- 5 hashtags relevantes

Salvar em `winvision/conteudo/posts/post-[tema-slug]-[YYYY-MM-DD].md`

**Regras para todos os formatos:**
- Sem travessão (—)
- Tom direto, informal, como o Matheus fala
- Nenhum cacoete de IA ("e isso muda tudo", "no fim das contas", "cada vez mais")

### 7. Salvar pautas (opcional)

Se o usuário pedir pra salvar, criar arquivo em:
```
winvision/conteudo/pautas/pautas-solar-[YYYY-MM-DD].md
```

---

## Observações

- Se nenhuma notícia relevante aparecer nas buscas, usar o estudo de mercado em `Matheus/Trabalho/LM/Estudo de Mercado - Energia Solar.md` como base — ele tem dados, tendências e dores suficientes pra gerar pautas sem notícia nova
- Não inventar dados. Se não encontrar número concreto, usar o ângulo qualitativo mesmo
- O conteúdo é pra posicionar o Matheus como especialista em comercial/solar — não como jornalista do setor. Cada pauta deve ter uma perspectiva de quem opera no mercado, não de quem cobre o mercado
