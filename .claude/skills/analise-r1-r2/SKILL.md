---
name: analise-r1-r2
description: Analisa transcrição de R1 ou R2 do Matheus (ou de qualquer vendedor) à luz da metodologia Nimoto. Linka cada movimento da reunião aos conceitos das aulas (CLOSER, tríade de ofertas, equação do valor, 7 princípios da influência, MAGIC, nutrição infinita) com timestamp da transcrição original. Aponta onde o vendedor seguiu o framework e onde escorregou. Salva no Obsidian em "LM/Treinamentos/Mentoria Nimoto/Análises R1 R2/". Use quando o Matheus disser "analisa essa R1", "analisa essa R2", "fiz uma reunião, joga no framework do Nimoto", "cola transcrição da reunião", colar transcrição de reunião comercial, ou /analise-r1-r2.
---

# Análise R1/R2 com framework Nimoto

Analisa transcrição de uma reunião comercial (R1 ou R2) usando a metodologia da mentoria Nimoto. Liga cada frase relevante a um conceito específico das aulas, com timestamp e justificativa do "por que funciona / por que falhou".

## Quando disparar

- Matheus cola transcrição e pede análise sob ótica do Nimoto
- "/analise-r1-r2"
- "analisa essa reunião"
- "fiz uma R1 hoje, joga no framework"
- "vê o que eu errei nessa call"

## Inputs esperados

1. **Transcrição da reunião** (cola no chat ou caminho do arquivo)
2. **Tipo:** R1 ou R2 (se não souber, infere pelo conteúdo — R1 = diagnóstico, R2 = oferta/fechamento)
3. **Quem é o vendedor:** Matheus, Tino, ou outro
4. **Quem é o prospect:** nome + empresa + nicho
5. **Resultado da reunião:** fechou? marcou próxima? sumiu?

Se faltar qualquer um, perguntar antes de começar (uma pergunta só, em bloco).

## Fontes obrigatórias (ler antes de analisar)

Toda análise se baseia em pelo menos esses 4 docs no Obsidian:

1. `LM/Treinamentos/Mentoria Nimoto/Transcrição Mentoria Nimoto — R1 e R2 (01-05-2026).md` — método CLOSER, tríade de ofertas, equação do valor, 3 perguntas de fechamento, primeiras 48h
2. `LM/Treinamentos/Mentoria Nimoto/Transcrição Mentoria Niimoto — Call 1 (18-04-2026) - 3h.md` — 7 princípios da influência, oferta viva, vender pro empresário não pra empresa, leitura de intenção, isolar objeção
3. `LM/Treinamentos/Mentoria Nimoto/Mentoria Nimoto — Imersão (Mentalidade, MAGIC, CLOSER, Nutrição Infinita).md` — resumo da imersão de 7h com timestamps
4. `LM/Treinamentos/Mentoria Nimoto/Mentoria Nimoto — Fundamentos Comercial.md` — Blue Ocean, B2B é lógica, estrutura de reunião

**Referência-mestre de análise pronta:** `LM/Treinamentos/Mentoria Nimoto/Análises R1 R2/2026-05-04 — Nimoto vendendo Assim para V4 (referência).md` — analise no mesmo formato dessa.

**Checklist CLOSER (perguntas oficiais do slide do Nimoto):** `closer-perguntas-oficiais.md` (na própria pasta da skill). Ler sempre antes de analisar — toda etapa do CLOSER que faltar na reunião vira item obrigatório na seção "Onde o vendedor falhou".

## Como rodar

### 1. Coleta de contexto
Confirma os 5 inputs acima. Se já tiver tudo, segue.

### 2. Leitura das fontes
Lê os 4 docs da mentoria + a referência-mestre. **Não pular essa etapa** — sem isso a skill perde calibração e vira chute.

### 3. Escopo da reunião — REGRA CRÍTICA

**R1 vai SÓ até o O do CLOSER. Ponto.**
- **C** — Clarity (por que o cliente aceitou a reunião)
- **L** — Label (rotular o problema com nome próprio)
- **O** — Overview (tríade de enfatização da dor: já tentou? por que falhou? quanto perdeu?)
- **Transição:** "vou montar um projeto personalizado pra te apresentar na próxima call" → marca R2 com data específica.

R1 **não tem** S, E nem R. Não tem pitch de oferta, não tem 3 portas de fechamento, não tem garantia, não tem preço. Quem cobra essas etapas na R1 tá analisando errado.

**R2 vai do recap até o R do CLOSER, ou seja, CLOSER inteiro:**
- **C** — recap rápido do que mudou desde a R1
- **L** — devolver o termo/dor rotulada na R1
- **O** — pergunta de urgência presente (versão comprimida da tríade)
- **S** — Sell the Vacation (destino final + 3 pilares + oferta-frase MAGIC). **ATENÇÃO:** o S tem DUAS partes. (a) oferta-frase/destino = curta, regra "vende o destino, não o voo / ≤3 min" vale SÓ aqui. (b) apresentação técnica do produto = o **Passo D** do método, que PODE e DEVE ser detalhada (mapa mental, script, cadência, playbook, CRM, exemplos de quebra de objeção). **NÃO cobrar detalhamento da entrega como "vendeu o voo" nem mostrar exemplo de entregável como "consultoria grátis".** Ver memória `feedback-r2-passo-d-apresentacao`.
- **E** — Explain Away (3As pra cada objeção que surgir)
- **R** — Reinforce (3 perguntas de fechamento + garantia antes do preço + preço + primeiras 48h). As 3 portas têm forma livre (bloco no fechamento OU distribuídas na apresentação, tanto faz). Só cobrar COMPLETUDE: se faltou alguma das 3 (ex: fez 1 de 3, ou nunca perguntou a 3ª de confiar no executor), aí sim é falha. Nunca cobrar a forma.

### 3b. Análise por blocos

**Quebra a transcrição em 6-9 blocos seguindo a estrutura natural da reunião.**

Pra **R1**:
- Abertura (apresentação + metodologia)
- Transição pra diagnóstico (C do CLOSER)
- Diagnóstico (perguntas isoladas)
- Rotulação (L do CLOSER)
- Enfatização da dor (O do CLOSER + tríade)
- Movimentos do prospect (dor/intenção verbalizada espontaneamente)
- Transição pra R2 + marcação da próxima call

Pra **R2**:
- Abertura + recap (C versão R2)
- Devolver dor rotulada (L)
- Urgência presente (O comprimido)
- Sell the destination (S — oferta-frase + 3 pilares)
- Quebra de objeções conforme aparecerem (E — 3As)
- 3 perguntas de fechamento (R — funciona / serve pra você / sou a pessoa)
- Garantia antes do preço (R)
- Preço + fechamento (R)
- Primeiras 48h / onboarding (R)

### 4. Padrão OBRIGATÓRIO frase por frase

**REGRA INEGOCIÁVEL:** a análise é frase por frase, não por bloco agrupado. Cada citação relevante do vendedor (ou prospect) vira um item separado, no formato exato abaixo. **Não resumir, não agrupar parágrafos, não substituir citação por descrição.**

**Critério de aprovação visual:** se o output não tiver o mesmo "look" das duas referências canônicas — mesma densidade de blockquotes, mesma quantidade de itens separados por `---`, mesmo formato de Conceito/Aula/Por que — REFAZER. Não entregar análise agrupada.

Formato fixo de cada item:

```markdown
> "citação literal exata da transcrição"

**Conceito:** [framework aplicado — Label, tríade, 3As, viés de certeza, etc.]
**Aula:** [[Nome do arquivo da aula]] [timestamp] — *"frase de referência exata da aula"*
**Por que funciona / por que falhou:** [1-3 linhas explicando o efeito real]

---
```

**Critério "frase relevante":**
- Toda frase do vendedor que execute (ou tente executar) uma etapa do CLOSER
- Toda frase que aplique um framework (3As, viés de certeza, reciprocidade, escassez, big idea, etc.)
- Toda frase que pule, falhe ou faça oposto do framework
- Toda frase do PROSPECT que verbalize dor, urgência, destino, objeção, ou compromisso espontâneo

**O que NÃO entra:** small talk, futebol, perguntas operacionais sem peso de método.

**Densidade esperada:** R1 ou R2 de 30-45min gera 18-30 itens analisados. Reunião de 45-60min gera 25-35 itens. Se a análise tem menos de 15 itens, faltou citação. Refazer.

**Citações OBRIGATÓRIAS — não pode faltar nenhuma destas se aparecer na transcrição:**
- Toda pergunta-âncora do vendedor (C, L ou O)
- Toda frase do prospect que confessa número (faturamento, ticket, conversão, custo)
- Toda frase do prospect que rotula algo com nome próprio dele ("autofagia de mercado", "corda no pescoço", "buraco mais embaixo")
- Toda demissão, perda recente, valor desperdiçado verbalizado pelo prospect
- Toda objeção (R1: rara, mas "tô sem tempo agora" conta) (R2: todas)
- Toda tentativa do vendedor de marcar próxima call
- Toda dica/ensinamento que o vendedor entregou de graça (Call 1 [110:48] — erro recorrente)
- Toda vez que o vendedor bateu de frente com a versão do prospect (Call 1 [122:00])

**Referências canônicas obrigatórias** (toda análise nova tem que sair com o mesmo padrão visual destas):

1. `LM/Treinamentos/Mentoria Nimoto/Análises R1 R2/2026-05-04 — Nimoto vendendo Assim para V4 (referência).md` — referência da R1
2. `LM/Treinamentos/Mentoria Nimoto/Análises R1 R2/2026-05-05 — Matheus e Tino vs Synergy (R2).md` — referência da R2

**Antes de salvar:** abrir uma das duas referências e comparar visualmente. Mesmo número médio de citações por bloco, mesmo formato de cabeçalho, mesma estrutura de mapa-resumo no fim.

**REGRA INEGOCIÁVEL DE ENTREGA — SEMPRE mandar a análise COMPLETA no chat ALÉM de salvar no Obsidian.**

O Matheus quer ler a análise inteira no chat — não só receber o link do arquivo. Salvar no Obsidian é pra arquivo histórico, mas a leitura acontece no chat na hora.

Isso significa:
- TODOS os blocos com TODAS as citações frase-por-frase aparecem no chat
- Mapa-resumo completo aparece no chat
- Bloco "Onde falhou" completo aparece no chat
- Checklist "Aplicação na próxima R1/R2" completo aparece no chat
- Próximo passo prático com o prospect aparece no chat

**Não resumir no chat e mandar pro Obsidian o "completo".** O conteúdo no chat e no arquivo do Obsidian são idênticos. Se o arquivo tem 40 itens, o chat também tem 40.

Estrutura da resposta no chat:
1. Frase curta de abertura ("Análise salva em [link]. Aqui vai completa:")
2. Análise inteira (mesmo conteúdo do arquivo, do título até o "Documentos relacionados")
3. Pergunta final se quer atualizar o índice

### 5. Movimentos do prospect também contam
Quando o cliente verbaliza dor, urgência, destino ou objeção sozinho, **chama atenção** — porque foi resultado do trabalho do vendedor (ou da sorte). Liga ao conceito ("cliente quebrou a própria objeção", "cliente verbalizou destino", "intenção por trás da fala").

### 6. Mapa-resumo no fim
Tabela com 3 colunas: Movimento | Conceito | Aula+timestamp.

### 6b. REGRA CRÍTICA — Intenção estratégica + camada de oferta

**Antes de cobrar qualquer "falha", validar com o usuário (ou inferir do contexto):**
1. Qual é o **produto** que tu queria vender?
2. Qual é a **camada de entrada** dentro desse produto? (porta de entrada / entry-level / produto completo)

Termo do prospect pode levar a 3 lugares distintos:
- **Produto-alvo na camada certa** → rotular obrigatório (L do CLOSER puro)
- **Produto-alvo mas em camada maior do que a entrada planejada** → ignorar de propósito é correto, porque puxa pro entry-level errado
- **Produto errado** → ignorar de propósito é correto

Exemplo real (João Luiz / Doria Solar):
- Produto-alvo: **Ignição Comercial**
- Camada de entrada planejada pelo Matheus: **prospector solo (porta de entrada do Ignição)** — menor unidade vendável, fricção psicológica mínima
- Termos do prospect que levavam pra **camada maior** (Ignição completa com gerente, estruturação de equipe, recontratação): "demiti 5 em 2 meses", "nada mais caro do que contratar errado", "fadiga de formar time", "liderança que não compra a régua"
- Esses NÃO foram rotulados porque puxariam o João pra conversa de "vou ter que reconstruir equipe inteira" — fricção alta, venda morre. Manter o foco no prospector solo deixa a R2 começar barata e escalar depois.

**Como aplicar na análise:**
- Quando um termo do prospect for ignorado deliberadamente, **não marcar como ❌**. Mencionar num bloco separado **"Decisões estratégicas de escopo / camada"** explicando: (a) janela existiu, (b) levaria pra camada errada do produto, (c) descartada de propósito.
- Se houver dúvida sobre intenção, **perguntar ao usuário antes de marcar como falha**.
- Só cobrar L como ❌ se o termo IGNORADO levaria pra camada de entrada planejada. Termos fora dessa camada não contam.
- Termos descartados podem ser **ressuscitados na R2** depois que o entry-level for vendido — virar argumento de escalada ("e quando o prospector estiver gerando funil, a gente entra na próxima camada que resolve X que tu falou na primeira call").

### 6c. Plantio de visão pra R2 vs consultoria grátis

**Nem toda entrega de conceito tático na R1 é consultoria grátis.** Quando o vendedor planta a VISÃO do destino/método pra abrir R2 (sem entregar o passo-a-passo de execução), isso é gancho legítimo, não erro.

Critério:
- ✅ **Gancho pra R2:** plantou que "uma pessoa só prospectando rampa em 3 dias e gera demanda" pra contrastar com a tese atual do prospect ("preciso fechar 1 contrato grande em 60 dias"). Isso reframa o destino. É bom.
- ⚠️ **Misto:** plantou a visão MAS entregou detalhe operacional demais (estrutura de comissão + cálculo de ROI por extenso) que dá pro prospect executar sozinho.
- ❌ **Consultoria grátis pura:** entregou método com passo-a-passo executável (Call 1 [110:48] — "cobra antes de ensinar"). Sem amarrar a R2.

Quando houver dúvida entre ⚠️ e ❌, perguntar ao usuário qual foi a intenção antes de marcar.

### 7. Onde o vendedor falhou no próprio framework
Bloco crítico **obrigatório**. Listar 2-4 pontos onde o vendedor (Matheus/Tino/quem for) deixou passar algo que a mentoria ensina explicitamente. Citar a aula que cobre o erro.

**REGRA DE ESCOPO:** só cobrar erros do que a etapa exige.
- Em **R1**, só cobrar erros de C, L e O. Não cobrar "não fez 3 portas", "não vendeu destino", "não apresentou pitch", "não falou preço" — isso é R2.
- Em **R2**, cobrar CLOSER inteiro + recap da R1.

Exemplos comuns de erro do Matheus em R1 (já vistos):
- Não apresentar metodologia na abertura (R1/R2 [16:05])
- Não rotular o problema com nome próprio (faltou L do CLOSER — R1/R2 [21:49])
- Tríade incompleta (perguntou "já tentou?" mas não perguntou "por que falhou? quanto perdeu? quanto tempo?")
- Não ler a intenção por trás da fala (Call 1 [80:24])
- Bater de frente em afirmação do cliente em vez de concordar+reframe (Call 1 [122:00])
- Entregar dica/tática de graça em vez de virar prova social (Call 1 [110:48])
- Marcar R2 sem data específica / com framing "se fizer sentido" (R1/R2 [13:18])

Exemplos comuns de erro em R2:
- Não isolar decisão dos sócios
- Antecipar objeção que o cliente não fez
- Faltar alguma das 3 portas antes do preço (ex: fez 1 de 3, ou pulou a 3ª de confiar no executor). NÃO cobrar a FORMA das portas (bloco ou distribuída são ambos válidos), só a completude.
- Rapport no meio de objeção forte
- Soltar o preço sem ter isolado a objeção viva (tratar como "só preço" quando ainda tem objeção aberta)
- Garantia depois do preço em vez de antes
- Bater de frente na objeção em vez de "concordo" antes de contornar (3As)
- Apresentar entregáveis antes da metodologia (ordem, não o detalhamento em si — detalhar a entrega no Passo D é correto)

### 8. Aplicação na próxima R1/R2
Checklist de 4-6 itens acionáveis pra próxima reunião do mesmo vendedor, baseados nos erros encontrados.

## Onde salvar

`/Users/matheusjardim/claude/obsidian/Matheus/Trabalho/LM/Treinamentos/Mentoria Nimoto/Análises R1 R2/YYYY-MM-DD — [Vendedor] vs [Prospect] ([R1|R2]).md`

Exemplo: `2026-05-08 — Matheus vs Synergy (R1).md`

## Frontmatter padrão

```yaml
---
tipo: análise R1
data: 2026-05-08
vendedor: Matheus Jardim
prospect: Flávio (Synergy)
nicho: energia solar
resultado: R2 marcada para 14/05
tags: [mentoria, nimoto, r1, análise]
fontes:
  - "[[Transcrição Mentoria Niimoto — Call 1 (18-04-2026) - 3h]]"
  - "[[Transcrição Mentoria Nimoto — R1 e R2 (01-05-2026)]]"
  - "[[Mentoria Nimoto — Imersão (Mentalidade, MAGIC, CLOSER, Nutrição Infinita)]]"
---
```

## Estrutura do arquivo final

```markdown
# Análise — [Vendedor] vendendo para [Prospect]

[1 parágrafo de contexto — quem, quando, resultado, ângulo principal]

> [!info] Resultado e diagnóstico geral
> 1-3 linhas: a R1/R2 funcionou ou não, e o que mais pesou.

---

## Bloco 1 — Abertura
[citação + conceito + aula + por que]

## Bloco 2 — [...]
[...]

---

## Mapa-resumo
[tabela 3 colunas]

---

## ⚠️ Onde [Vendedor] falhou no próprio framework
[2-4 itens, com aula citada]

---

## Aplicação na próxima R1/R2
- [ ] [item acionável]
- [ ] [...]
```

## Tom e estilo

- Tom direto, sem enrolação. Mesma régua das preferências do Matheus.
- Sem travessão (—) em parágrafos do corpo. Pode usar em separadores e tabelas.
- Sem emoji exceto ⚠️ no bloco de falhas.
- Sem genéricos de IA tipo "é importante notar que".
- Citações **sempre literais** da transcrição.
- Aulas citadas **sempre com timestamp** entre colchetes.
- Crítica é elogio — não suavizar. Se o Matheus errou no L do CLOSER, falar "não rotulou", não "poderia ter rotulado mais explicitamente".

## Depois de salvar

1. Mostrar o caminho do arquivo salvo (link clicável) numa frase curta de abertura
2. **Mandar a análise INTEIRA no chat** — todos os blocos frase-por-frase, mapa-resumo, "Onde falhou", checklist e próximo passo. Mesmo conteúdo do arquivo. Não resumir.
3. Perguntar se quer atualizar o índice em `Mentoria Nimoto — Índice.md` (só se for análise relevante de cliente real, não pra exercício)
