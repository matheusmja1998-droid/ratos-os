# Macros

API de contagem de macronutrientes construída sobre a metodologia do
[@tchaubuchinho](https://www.tiktok.com/@tchaubuchinho): a pessoa aprende a
conta em vez de receber um cardápio pronto.

Feito pra uso próprio primeiro, mas multiusuário desde o começo — qualquer
pessoa cria conta e o app funciona pra ela.

## Rodando

```bash
npm install
cp .env.example .env     # opcional: preencha ANTHROPIC_API_KEY pros recursos de IA
npm run start:dev
```

Sobe em `http://localhost:3000/api`, com documentação interativa em
`http://localhost:3000/docs`. O banco é SQLite e se cria sozinho, já populado
com a base de alimentos.

```bash
npm test          # 19 testes do motor de cálculo e do planejador
npm run build
```

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
GET          = TMB (Mifflin-St Jeor) × fator de atividade
Meta         = GET − déficit
Proteína (g) = peso alvo × 2          <- fixa
Gordura (g)  = peso alvo × 1          <- piso hormonal de 40 g
Carboidrato  = (meta − prot×4 − gord×9) ÷ 4   <- absorve o resto
```

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
água e sal, e reagir a esse ruído é o que faz gente desistir. Confirmado o
platô, o ajuste segue a ordem do método: tira ~10% do carboidrato, soma 10
minutos de cardio, mantém a proteína intacta.

### 7. Zero linguagem de culpa

Nenhuma comida é chamada de porcaria, lixo, besteira, "comida de verdade",
suja ou limpa. Passar da meta é informação, não falha. Não há streak que zera,
nem nota semanal rotulando a pessoa de "Off Track".

A IA que comenta o dia opera sob essa regra explicitamente.

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
```

## Base de alimentos

68 alimentos iniciais referenciados em TACO (NEPA/Unicamp), TBCA (USP) e
rótulos. Cobre a comida do dia a dia brasileiro — arroz, feijão, farofa,
tapioca, bisteca, mandioca — e também pizza, pastel, brigadeiro, cerveja e
creme de avelã, tratados como comida normal, porque é o que são.

A busca ignora acento e entende como as pessoas falam: "nutella" acha creme de
avelã, "filé de frango" acha peito de frango, "bife" acha patinho.

**Licenciamento — resolver antes de vender.** A TACO (4ª ed., NEPA/Unicamp) tem
download livre, mas não declara licença para uso comercial. A TBCA (USP/FoRC)
está sob CC BY-NC-ND 4.0, que é explicitamente **não-comercial** e proíbe
alteração. Para uso pessoal não há problema; virando produto pago, é preciso
consulta formal ao NEPA e ao FoRC. Isso é risco de fundação, não detalhe — os
dados de origem estão marcados em cada registro justamente pra essa troca ser
possível depois.

## Limitações conhecidas

- SQLite com `synchronize: true`. Serve pra uso pessoal; virando produto, migra
  pra Postgres com migrations de verdade.
- Base de 68 alimentos é o começo. A TACO completa tem ~600 itens e a TBCA
  passa de 5.000 — importar é trabalho mecânico, ainda não feito.
- Sem app cliente. É só a API, com o Swagger em `/docs` como interface.
- Receita composta tem entidade modelada mas ainda não tem rota.
- Sem integração com wearable, e isso é deliberado: importar caloria de
  smartwatch conta o exercício duas vezes, porque o fator de atividade já
  contabilizou o treino. Vale dizer que o MacroFactor já sustenta essa mesma
  posição publicamente — aqui é paridade com o melhor da categoria, não
  novidade. A literatura ampara: o estudo de Stanford (Shcherbina et al., 2017)
  mediu erro de 27% a 93% na estimativa calórica de sete dispositivos, sem
  nenhum abaixo de 20%.
