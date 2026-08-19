# Prompt para o Claude Design

Copie tudo abaixo da linha e cole no Claude Design.

---

Preciso que você redesenhe as telas de um app de contagem de macronutrientes
chamado **Macros**. Ele já existe e funciona (https://macros-nu.vercel.app) —
o que quero é elevar o acabamento visual sem trair o que ele defende.

## O que este app é, e o que ele recusa ser

É um app de registro alimentar brasileiro construído sobre uma tese: **a pessoa
aprende a conta em vez de receber um cardápio pronto**. Toda meta vem com a
memória de cálculo aberta, passo a passo, para ser refeita no papel.

Ele é deliberadamente **anti-cultura fitness**. Isso não é tom de voz, é
requisito de projeto:

- Nenhuma comida é chamada de porcaria, lixo, besteira, "comida de verdade",
  suja ou limpa. Brigadeiro e brócolis aparecem com o mesmo peso visual.
- Passar da meta é **informação, não falha**. Não existe vermelho de erro,
  não existe alerta, não existe nota semanal julgando a pessoa.
- Não há streak que zera, medalha, troféu, confete nem projeção de peso futuro.
- O usuário marca o que ele quer comer como **"maravilha"** — a sobremesa, a
  pizza — e o resto do dia se encaixa em volta. O prazer é ponto de partida,
  não recompensa.

O motivo é sério: a literatura associa contagem de calorias a sintomas de
transtorno alimentar (Simpson & Mazzeo 2017; Levinson et al., onde 73% dos
pacientes com TA que usavam MyFitnessPal apontaram o app como contribuinte).
Por isso a ausência de gamificação punitiva é decisão de produto, não
esquecimento. **Não adicione nenhum desses elementos.**

## A direção estética atual (mantenha o espírito, eleve a execução)

**Caderno de cozinha**: papel, tinta e anotação à mão. Nada de verde-saúde,
neon, gradiente roxo ou estética de academia. O assunto é comida, não o corpo.

Paleta clara (a escura é a mesma lógica invertida):

```
--papel        #f4f0e6   fundo dos blocos
--papel-fundo  #eae4d5   fundo da página, com textura de fibra
--papel-alto   #fbf8f1   campos de entrada
--tinta        #23201a   texto principal
--tinta-fraca  #6b6355   texto secundário
--tinta-tenue  #9c9282   texto terciário
--linha        #d6cdb8   divisórias
```

Um macro, uma cor — todas tiradas de comida, não de gráfico:

```
--proteina     #a6432c   tijolo
--carboidrato  #b3822a   trigo
--gordura      #7d6a3f   manteiga
--fibra        #4a6b4f   folha
--grifo        #e8c95a   marca-texto (só para "maravilha")
```

Tipografia: **Fraunces** (display, com eixo óptico), **Newsreader** (corpo,
serifada) e **JetBrains Mono** (números e medidas). Os números são grandes e
protagonistas — a caloria do dia aparece em ~3.9rem.

## As quatro telas

Tudo é mobile-first, uma coluna, largura máxima 620px. Barra de navegação fixa
embaixo com quatro itens.

**1 · Hoje** — o painel do dia.
- Bloco "O dia": caloria consumida em número enorme, e à direita, em mono, a
  meta e quanto ainda cabe.
- Quatro réguas horizontais (proteína, carboidrato, gordura, fibra), cada uma
  na sua cor, com "X de Yg · faltam Zg". Quando passa da meta a régua fica
  hachurada, sem vermelho e sem alarme.
- Lista de refeições. Cada uma fica **recolhida** mostrando só o resumo em
  mono (`507 kcal  P 56.6  C 55.8  G 4.6  F 10.9`); um toque expande os itens.
- Refeições são editáveis: acrescentar, renomear, remover, e **copiar uma
  refeição inteira para outra** (montou o almoço, replica na janta).
- Itens marcados como "maravilha" têm uma tarja lateral no tom do marca-texto.

**2 · Comer** — onde se registra.
- Seletor fixo no topo: "Anotar em [refeição]".
- Atalho "O que você mais come", com a porção típica já preenchida.
- Quatro caminhos: foto do prato, texto livre ("duas conchas de feijão e um
  filé"), busca por nome, e sugestões de fechamento.
- Cada alimento traz **selo da fonte** (TACO / TBCA / ROTULO) e o **modo de
  preparo**, porque isso muda o valor: mandioca cozida tem 125 kcal, frita tem
  300. Esse par (fonte + preparo) é o diferencial do produto e precisa estar
  visualmente presente sem virar poluição.
- A quantidade é escolhida em **porção caseira** ("2 unidade média", "3 colher
  de servir") com a conversão exibida embaixo (`= 240 g`).

**3 · Peso** — tendência por média móvel, nunca o número cru do dia. Diagnóstico
de platô com o ajuste sugerido em uma frase.

**4 · A conta** — os sete passos do cálculo abertos (fórmula, substituição,
resultado e o porquê de cada um), dados do perfil, e os grupos de alimento que
a pessoa não come.

## O que eu quero de você

Redesenhe as **quatro telas** em alta fidelidade, mobile (390×844), mais o
**onboarding em quatro etapas** (quem é você / seu corpo / seu objetivo / o que
você não come) e a **tela final do cadastro** que mostra a conta pronta.

Onde quero que você melhore de verdade:

1. **Hierarquia dentro dos blocos.** Hoje tudo tem quase o mesmo peso; a tela
   Comer ficou longa e o olho se perde. Resolva sem apelar para caixinhas
   coloridas.
2. **As réguas de macro.** São o coração da tela Hoje e hoje estão genéricas
   (barrinha de 9px). Quero algo com mais caráter, que ainda leia bem de
   relance e funcione quando o valor passa de 100%.
3. **O resumo da refeição recolhida.** Precisa dar os cinco números de relance
   sem virar planilha.
4. **O selo de fonte e o preparo.** São o argumento do produto. Encontre uma
   forma elegante de mostrá-los que não pareça metadado técnico.
5. **A memória de cálculo.** Sete passos com fórmula e explicação; hoje é uma
   lista longa. Quero que pareça uma página de caderno, algo que dá vontade de
   ler — é a peça que ensina.
6. **Estados vazios.** Primeiro dia, dia sem nada anotado, busca sem resultado.
   Hoje são só frases soltas.

Restrições: mantenha a paleta e as fontes (pode ajustar pesos, tamanhos e
espaçamento à vontade), mantenha uma coluna e mobile-first, e continue
funcionando em tema claro e escuro. Nenhum ícone genérico de app fitness —
sem halteres, sem maçã, sem chama.

Entregue as telas e, junto, as decisões de espaçamento, escala tipográfica e
estados de componente, para eu conseguir implementar em CSS puro (o app não
usa framework de UI).
