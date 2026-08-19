# Macros

API de contagem de macronutrientes construída sobre a metodologia do
[@tchaubuchinho](https://www.tiktok.com/@tchaubuchinho): a pessoa aprende a
conta em vez de receber um cardápio pronto.

Feito pra uso próprio primeiro, mas multiusuário desde o começo — qualquer
pessoa cria conta e o app funciona pra ela.

## No ar

**https://macros-nu.vercel.app** — funciona no celular, é só abrir.

Detalhes de infraestrutura e as armadilhas do deploy estão em `DEPLOY.md`.

## Rodando local

```bash
npm install
cp .env.example .env     # opcional: preencha ANTHROPIC_API_KEY pros recursos de IA
npm run start:dev
```

Abra `http://localhost:3000` no navegador — o app está lá. A API fica em
`/api` e a documentação interativa em `/docs`. O banco é SQLite e se cria
sozinho, já populado com a base de alimentos.

Local o banco é SQLite em arquivo, sem configurar nada. Com `DATABASE_URL`
definida, usa Postgres — é assim que roda em produção.

```bash
npm test          # 44 testes, incluindo o fluxo completo de ponta a ponta
npm run build
```

## Onboarding

Quem cria conta responde três perguntas curtas — quem é você, seu corpo, seu
objetivo — e sai do cadastro com as metas calculadas, o primeiro peso
registrado e **a conta aberta passo a passo** pra conferir no papel.

Nada de cair num app vazio tendo que descobrir onde configurar. E nada de
receber um número pronto sem saber de onde veio: a memória de cálculo é parte
da entrega, não um extra escondido.

O formulário protege contra o erro mais comum (altura em metros em vez de
centímetros) e avisa, na hora de escolher o nível de atividade, que caminhada
leve não conta como treino — superestimar ali faz o déficit não acontecer.

## O app

Quatro telas, feitas pra funcionar no celular:

- **Hoje** — o que já entrou, o que ainda cabe e as réguas de cada macro.
  Cada refeição fica recolhida mostrando só o resumo dela (kcal e os macros);
  um toque abre os itens. Dá para acrescentar, renomear e remover refeições,
  e **copiar uma refeição inteira para outra** — quem almoça parecido todo dia
  não precisa recadastrar arroz, feijão e frango cinco vezes por semana.
- **Comer** — escreva "duas conchas de feijão e um filé" e a IA monta os itens,
  ou procure na base direto. Cada resultado diz quanto ainda cabe hoje.
- **Peso** — registra o peso e mostra a tendência por média móvel, não o número
  cru do dia. Diagnostica platô e aplica o ajuste com um toque.
- **A conta** — seus dados, o recálculo e os sete passos da conta abertos.

O visual é de caderno de cozinha: papel, tinta e anotação à mão. Nenhum verde
de academia, nenhuma barra vermelha de erro. Quando você passa da meta, a régua
fica hachurada e o texto diz quanto passou. Só isso.

## O que este app faz diferente

Sete decisões de produto que nenhum concorrente grande implementa. Cada uma
sai de um problema real do método.

### 1. Proteína pelo peso alvo, não pelo peso atual

MyFitnessPal, Yazio e Lifesum definem proteína como **percentual das
calorias**. Isso tem uma consequência perversa: quando você aumenta o déficit,
a meta de proteína *cai* — exatamente o contrário do que deveria acontecer.

Aqui a proteína é `peso alvo × 2` e não se move. Alguém de 140 kg multiplicando
o peso atual por 2 chegaria a 280 g de proteína por dia: o corpo descarta o
excedente, e o dinheiro vai junto.

O MacroFactor, tecnicamente o mais avançado do mercado, faz o **oposto**: ancora
a proteína na massa magra estimada pelo peso atual, então a meta *diminui*
conforme a pessoa emagrece. Nenhum app permite escolher a base do cálculo.

```
TMB          = Mifflin-St Jeor        <- só passo intermediário, nunca é meta
GET          = TMB × fator            <- arredondado na centena
peso alvo    = base + 0,91 × (altura_cm − 152,4)   <- arredondado, inteiro
                 base: 50 (homem) · 45,5 (mulher)
Meta         = GET − déficit
Proteína (g) = peso alvo × 2          <- fixa, nunca se reduz
Gordura (g)  = peso alvo × 1          <- piso hormonal de 40 g
Carboidrato  = (meta − prot×4 − gord×9) ÷ 4   <- absorve o resto
```

Os arredondamentos acontecem **antes** dos cálculos seguintes: a fórmula é uma
estimativa, e carregar decimais adiante só dá falsa precisão.

### 2. Toda meta vem com a memória de cálculo

`POST /api/calculo` devolve os sete passos com fórmula, substituição, resultado
e o porquê de cada um. Dá pra refazer no papel e conferir. É o ponto do método:
quem entende a conta não precisa do app pra sempre.

### 3. Fonte rastreável e modo de preparo obrigatórios

Todo alimento carrega origem (`TACO`, `TBCA`, `USDA`, `ROTULO`, `USUARIO`) e
modo de preparo. Arroz cru e arroz cozido são itens distintos, porque é o
cozido que vai pro prato e é ele que você pesa.

Na busca, fonte verificada vem antes de dado de usuário. Nenhum app
internacional usa a TACO — comida brasileira neles depende de entrada
colaborativa não conferida.

### 4. Planejamento reverso: a maravilha primeiro

Com a cabeça descansada de manhã é fácil dizer não. À noite, cansado, não é.
Então o dia começa pelo que você quer comer de verdade.

```
GET /api/diario/cabe/:alimentoId
  -> "Cabem 240 g. O limite aqui é gordura."

GET /api/diario/fechar
  -> o que fecha a proteína que sobrou, em porções que cabem num prato
```

Registra a sobremesa marcada com `ehMaravilha: true`, e o resto do dia se
encaixa em volta.

Ressalva honesta: o solver reverso **não é inédito** — Prospre ("Fit Into
Plan"), Eat This Much e Hit My Macros já fazem. O que não existe é a
combinação: os meal planners têm solver e não têm acompanhamento adaptativo;
os trackers (MyFitnessPal, Cronometer, MacroFactor) têm acompanhamento e zero
solver. Aqui as duas coisas moram no mesmo app.

### 5. Gramas, nunca "porções"

A API só aceita peso em gramas. O erro mais comum em app de macro é registrar
"20" num campo de porção de 25 g e lançar 500 g sem perceber. Aqui esse campo
não existe.

### 6. Platô: corta carbo, nunca proteína

`GET /api/metas/plato` usa média móvel de 7 dias — o peso do dia oscila com
água e sal, e reagir a esse ruído é o que faz gente desistir.

Nada é ajustado antes de **4 semanas** de registro: o cálculo é uma estimativa
e só o tempo mostra se ela estava certa. Confirmado o platô, a ordem de corte é:

1. reduzir carboidrato (~10%, com piso de 50 g)
2. aumentar o cardio
3. só com o carboidrato já baixo, reduzir gordura — nunca abaixo de 40 g

**A proteína não entra nessa conta em nenhuma hipótese.** É o único macro que o
método trata como inegociável, e o código impede que ela seja alterada por
ajuste de platô.

### 7. Zero linguagem de culpa

Nenhuma comida é chamada de porcaria, lixo, besteira, "comida de verdade",
suja ou limpa. Passar da meta é informação, não falha. Não há streak que zera,
nem nota semanal rotulando a pessoa de "Off Track".

Isso é estrutural, não cosmético: o déficit tem teto de 25% do gasto e piso na
TMB, a gordura tem piso hormonal, não existe projeção de peso futuro e nenhuma
tela usa vermelho de erro. A IA que comenta o dia opera sob a mesma regra.

Vale registrar o motivo: a literatura associa o próprio ato de contar calorias
a sintomas de transtorno alimentar (Simpson & Mazzeo, 2017, n=493; Levinson et
al., onde 73% dos pacientes com TA que usavam MyFitnessPal apontaram o app como
contribuinte). São estudos transversais, sem causalidade estabelecida — mas
suficientes pra tratar "sem culpa" como requisito de projeto, não como tom.

## O papel da IA

Duas fronteiras que a IA não cruza:

1. **Não define meta de macro.** Isso é conta fechada e auditável, feita pelo
   `CalculoService`. IA não arbitra número.
2. **Não inventa valor nutricional.** Ela identifica o que você comeu e busca
   na base; quem tem o número é a TACO. Chutar macro é o erro que o método
   inteiro combate.

O que ela faz:

| Rota | Função |
|---|---|
| `POST /api/ia/interpretar` | "comi duas conchas de feijão e um filé" vira itens com peso estimado e candidatos da base |
| `POST /api/ia/rotulo` | lê a foto de um rótulo e converte a tabela pra 100 g |
| `GET /api/ia/comentar-dia` | comentário descritivo do dia, sem julgamento |

Sem `ANTHROPIC_API_KEY` esses três endpoints ficam desligados e todo o resto
funciona igual.

## Rotas

**Auth** — `POST /auth/registrar` · `POST /auth/entrar` · `GET /auth/eu`

**Cálculo** — `POST /calculo` · `POST /calculo/niveis`

**Alimentos** — `GET /alimentos/buscar?q=` · `GET /alimentos/:id/porcao?gramas=`
· `GET /alimentos/codigo-barras/:codigo` · `POST /alimentos` · `POST /alimentos/validar`

**Diário** — `GET /diario?data=` · `POST /diario/itens` · `PATCH /diario/itens/:id`
· `DELETE /diario/itens/:id` · `GET /diario/espaco` · `GET /diario/cabe/:alimentoId`
· `GET /diario/fechar`

**Metas** — `GET /metas` · `GET /metas/historico` · `POST /metas/recalcular`
· `POST /metas/peso` · `GET /metas/peso` · `GET /metas/tendencia` · `GET /metas/plato`

**IA** — `GET /ia/status` · `POST /ia/interpretar` · `POST /ia/rotulo` · `GET /ia/comentar-dia`

Tudo autenticado por Bearer token, exceto registro, login, cálculo e busca de
alimentos.

## Estrutura

```
src/
  calculo/      motor de macros + memória de cálculo (coberto por testes)
  alimentos/    base TACO, busca com sinônimos, validação de rótulo
  diario/       refeições do dia + planejador reverso (coberto por testes)
  metas/        tendência de peso, platô, recálculo
  ia/           interpretação de texto, leitura de rótulo, comentário
  auth/         JWT
  comum/        entidades e DTOs
  app.e2e.spec  fluxo completo: conta, meta, maravilha, peso, platô
publico/        o cliente web (um HTML, um CSS, um JS)
```

## Base de alimentos

**649 alimentos**, sendo 632 da TACO completa (4ª edição, NEPA/Unicamp),
extraídos do PDF oficial, mais itens curados à mão que a TACO não cobre:
porções caseiras ("1 fatia", "1 concha"), produtos de rótulo e comida de
padaria e boteco.

Cobre o dia a dia brasileiro — arroz, feijão, farofa, tapioca, bisteca,
mandioca, cuscuz, quibe, feijoada — e também pizza, pastel, brigadeiro,
cerveja e creme de avelã, tratados como comida normal, porque é o que são.

**O modo de preparo é campo próprio, e é aí que está o diferencial.** A TACO
já traz isso estruturado na origem, e o app promove a campo pesquisável:

```
Mandioca [cozido]  ->  125 kcal
Mandioca [frito]   ->  300 kcal      mesmo alimento, 2,4x a energia
Mandioca [cru]     ->  151 kcal
```

A busca entende: "mandioca frita" devolve a frita, "peito de frango grelhado"
devolve o grelhado. Nenhum concorrente trata preparo como atributo — o USDA
enfia no meio do nome e o NCCDB "nem sempre especifica se os valores são de
alimento cozido".

A busca ignora acento e entende como as pessoas falam: "nutella" acha creme de
avelã, "filé de frango" acha peito de frango, "bife" acha patinho.

**Licenciamento.** Verificado direto no PDF oficial da 4ª edição: *"É permitida
a reprodução parcial ou total desta obra, desde que citada a fonte."* Sem
cláusula não-comercial — a TACO serve inclusive a produto pago, desde que
citada. São 597 alimentos.

A **TBCA** (USP/FoRC) é outra história: CC BY-NC-ND 4.0 proíbe uso comercial
**e** proíbe alteração, o que já barra normalizar os dados pro schema daqui.
Os poucos itens marcados como `TBCA` neste seed devem sair ou ser substituídos
por equivalente TACO antes de qualquer uso comercial.

Como cada registro guarda a fonte, essa troca é localizada e não mexe no resto
do app.

## Limitações conhecidas

- SQLite com `synchronize: true`. Serve pra uso pessoal; virando produto, migra
  pra Postgres com migrations de verdade.
- A TACO é de 2011 e tem 597 itens. Para produto de marca com código de
  barras, o caminho é o Open Food Facts BR (~35 mil itens, licença ODbL com
  share-alike). Ainda não integrado.
- Sete dos 649 alimentos vêm da TACO com valores de 2011; alimento
  industrializado muda de formulação, então rótulo atual sempre ganha da tabela.
- Receita composta tem entidade modelada mas ainda não tem rota.
- Sem instalação como app (PWA) nem uso offline: precisa do servidor no ar.
- Sem integração com wearable, e isso é deliberado: importar caloria de
  smartwatch conta o exercício duas vezes, porque o fator de atividade já
  contabilizou o treino. Vale dizer que o MacroFactor já sustenta essa mesma
  posição publicamente — aqui é paridade com o melhor da categoria, não
  novidade. A literatura ampara: o estudo de Stanford (Shcherbina et al., 2017)
  mediu erro de 27% a 93% na estimativa calórica de sete dispositivos, sem
  nenhum abaixo de 20%.
