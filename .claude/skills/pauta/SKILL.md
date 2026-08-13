---
name: pauta
description: Skill genérica de planejamento editorial. Pesquisa notícias e tendências de qualquer nicho e devolve pautas de conteúdo prontas com ângulo, gancho e formato sugerido. Use quando o usuário disser /pauta, "preciso de pauta de [nicho]", "ideia de conteúdo pra [tema]", ou quiser planejar conteúdo de qualquer setor que não seja Cockpit (pra Cockpit usar /tendencia-do-ar).
---

# /pauta — Planejamento editorial genérico

Pesquisa notícias e tendências recentes de qualquer nicho/cliente e devolve pautas prontas pra produção, com ângulo comercial, gancho e formato sugerido.

**Não confundir com `/tendencia-do-ar`:** essa é a skill exclusiva do Cockpit (Ratos de IA), com radar de IA + dor do Gestor Sufocado. A `/pauta` é pra qualquer outro contexto (clientes da WinVision/LM, projetos avulsos, novos nichos).

## Presets disponíveis

A skill tem presets pré-configurados pra clientes/nichos recorrentes:

- **solar** — integradoras solares B2B (era a antiga `pauta-solar`)
- **mecanica-motos** — Caio Pickcius (Mecânico Expert)
- **financas-imigrante** — Fernanda Serraglia (Vem Doleta)
- **cosmeticos** — EV Cosméticos
- **alisamento** — Liso Ideal (Kleber)
- **ortopedia** — Dr. Fábio (IOT Varginha)
- **pediatria** — Rafaelly
- **custom** — qualquer outro nicho (a skill pergunta o necessário)

## Como usar

```
/pauta preset: solar
/pauta preset: solar foco: agronegócio
/pauta preset: mecanica-motos
/pauta cliente: kleber
/pauta nicho: dropshipping (custom)
```

Sem argumento → pergunta qual preset usar.

## Workflow

### 1. Identificar preset e foco

Se o usuário passou `preset:` ou `cliente:`, carregar a configuração do preset. Se não, perguntar:

> "Pra qual contexto é a pauta?
> - Cliente recorrente (solar, mecânica-motos, financas-imigrante, cosméticos, alisamento, ortopedia, pediatria)
> - Nicho novo (custom — eu pergunto o necessário)"

### 2. Carregar contexto do preset

Cada preset define:
- **Avatar:** quem é o público
- **Posicionamento:** o que o cliente vende
- **Pilares editoriais:** 3-5 pilares de conteúdo
- **Fontes de pesquisa:** sites/comunidades específicas do nicho
- **Tom:** como escrever
- **CTA padrão:** que ação o conteúdo provoca

Ver `presets/[nome].md` dentro desta skill pra cada configuração.

Se for `custom`, perguntar:
> "Pra montar a pauta, me conta:
> 1. Quem é o público (idade, profissão, dor principal)?
> 2. O que tu/o cliente vende?
> 3. Tem 3-5 pilares editoriais já definidos? Se não, eu sugiro
> 4. Que sites/comunidades esse público consome?
> 5. Tom: informal, técnico, formal?"

### 3. Pesquisar notícias e dados recentes

Rodar WebSearch nas fontes do preset. Buscar últimos 7-30 dias. Coletar:
- Título, fonte, data, resumo
- 3-5 resultados mais relevantes por fonte

### 4. Filtrar por ângulo comercial

Descartar notícia que:
- É puramente técnica sem ângulo de negócio
- Não conecta com avatar
- Já é óbvia/batida no nicho

Manter notícia que:
- Mostra dado novo
- Cria contraste com crença comum do nicho
- Permite virada provocadora

### 5. Devolver 5-7 pautas prontas

Pra cada pauta:

```
## Pauta [N] — [TÍTULO]

**Pilar:** [qual pilar editorial]
**Formato:** [carrossel / reels / post longo / story]
**Ângulo:** [educacional / contrário / oportunidade / provocativo / inspiracional]

**Tensão:** [a fricção do conteúdo, em 1-2 frases]

**Hook (opções):**
- [hook A]
- [hook B]
- [hook C]

**Estrutura:**
- Abertura: [...]
- Desenvolvimento: [...]
- Virada: [...]
- CTA: [...]

**Fonte:** [link da notícia/dado]

**Skill recomendada:** [/carrossel-ratos / /criar-anuncio / etc]
```

### 6. Salvar plano

Salvar em `[cliente ou nicho]/conteudo/pautas/YYYY-MM-DD.md`.

Pra clientes WinVision: `winvision/[cliente]/conteudo/pautas/`
Pra clientes LM: `lm/[cliente]/conteudo/pautas/`
Pra nicho novo custom: perguntar onde salvar.

## Regras

- **Especificidade obrigatória:** dado + fonte + ano em toda afirmação. Sem "o mercado tá crescendo".
- **Ângulo sempre comercial:** pauta tem que conectar com venda do cliente, não ser conteúdo técnico solto.
- **CTA forte:** pergunta direta, oferta ou provocação. Nunca "espero que tenha gostado".
- **Sem travessões.**
- **Tom do preset prevalece** sobre tom genérico.

## Output esperado

5-7 pautas salvas em arquivo do cliente, prontas pra virar carrossel/reels/post.
