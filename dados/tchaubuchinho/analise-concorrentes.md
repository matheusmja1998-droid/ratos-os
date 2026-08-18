# Apps de macros — análise competitiva

Pesquisa de 18/08/2026. Fontes primárias: help centers oficiais, App Store BR
via iTunes Lookup API, press releases, estudos peer-reviewed. Preços em BRL
extraídos da App Store BR na data.

## Preços no Brasil (App Store BR, 18/08/2026)

| App | Mensal | Anual | Nota BR |
|---|---|---|---|
| Yazio PRO | R$47,90–64,90 | R$89,90–214,90 | 4,83 (68.554) |
| Lifesum Premium | R$21,99–69,90 | R$144,90–499,90 | 4,79 (13.970) |
| FatSecret Premium | R$37,90–53,90 | R$82,90–234,90 | 4,87 (22.142) |
| MacroFactor | R$49,90–66,90 | R$399,90–599,90 | só inglês/japonês |
| Cronometer Gold | R$69,90 | R$319,90 | só inglês |
| Tecnonutri | R$30,90 | — | iOS parado desde 02/2024 |

Faixas amplas no mesmo storefront indicam teste de preço dinâmico.

## Fórmulas

Mifflin-St Jeor é o padrão declarado: MyFitnessPal, Cronometer, Yazio, Lifesum.
Lose It! e FatSecret não divulgam. Tecnonutri usa EER da OMS. Dieta e Saúde usa
pontos, não macros.

**MacroFactor é o único com TDEE adaptativo real**: prevê a mudança de peso,
compara com a real e ajusta o gasto pelo erro de predição. Erro mediano de
135 kcal após 3-4 semanas, contra 335 kcal das fórmulas fixas. Exige 6 dos 7
dias de registro e 1 pesagem semanal.

## As lacunas confirmadas

**Proteína por peso alvo — ninguém faz.** Todos ancoram no peso atual, e a
maioria define proteína como % das calorias, o que faz a meta CAIR quando o
déficit aumenta. O MacroFactor faz o oposto do desejado: doc oficial diz que a
proteína diminui conforme a pessoa emagrece.

**Modo de preparo estruturado — ninguém faz.** O NCCDB "nem sempre especifica
se os valores são de alimento cozido". O USDA embute o preparo no nome. A TACO
já resolve isso na origem: 368 entradas com preparo explícito e 57 alimentos
com múltiplos preparos (arroz cru/cozido, mandioca crua/cozida/frita, bisteca
crua/frita/grelhada).

**Fonte rastreável — Cronometer faz, com furo.** Rotula a fonte na busca, mas
ela some quando o alimento entra no diário. Pedido no fórum oficial, nunca
implementado. Base 100% estrangeira.

**Protocolo de platô explicado — ninguém faz.** Existe ajuste calórico
silencioso. Ninguém diz ao usuário o que está acontecendo e o que fazer.
Cardio não entra em nenhum protocolo automático encontrado.

**Zero culpa com macros — vazio.** Os apps anti-diet-culture (Ate, YouAte,
Treatly) resolvem eliminando o tracking. O Lifesum rotula o usuário de
"Off Track" (0-30) e "Imbalanced" (30-60) numa nota semanal de 0 a 150. O
MyFitnessPal projeta "se todo dia fosse como hoje, você pesaria X".

## O que NÃO é diferencial

**Montagem reversa já existe.** Prospre ("Fit Into Plan"), Eat This Much
(travar alimento e autocompletar) e Hit My Macros já fazem. A brecha real é a
combinação: meal planners têm solver sem coaching; trackers têm coaching sem
solver.

**Não sincronizar wearable já é posição do MacroFactor**, com artigo público
dedicado. É paridade com o melhor da categoria.

## Licença das bases (verificado na fonte primária)

| Base | Itens | Licença | Uso comercial |
|---|---|---|---|
| TACO (NEPA/Unicamp, 4a ed. 2011) | 597 | "reprodução parcial ou total permitida, desde que citada a fonte" | **Sim**, com citação |
| TBCA (USP/FoRC, v7.3 2025) | 5.700+ | CC BY-NC-ND 4.0 | **Não** — proíbe comércio E alteração |
| POF/IBGE (2011) | 1.971 | obra pública | Sim |
| Open Food Facts BR | 35.508 | ODbL (share-alike) | Sim, com share-alike |

Baixei o PDF oficial da TACO e li a página de rosto: *"É permitida a reprodução
parcial ou total desta obra, desde que citada a fonte."* Não há cláusula
não-comercial. Isso corrige a leitura anterior de que a TACO seria um risco —
ela é justamente a base BR séria que pode ser usada em produto pago.

A TBCA é que é armadilha: o `NC` barra o uso comercial e o `ND` barra até
normalizar os dados pro schema próprio. Fica fora de qualquer versão paga até
haver acordo com a USP.

Verifiquei também o modo de preparo: o PDF da TACO tem 1.082 linhas com preparo
explícito no nome do alimento (cru, cozido, frito, grelhado, assado, refogado).
O dado que sustenta o diferencial já existe estruturado na origem.

## Outros riscos

**Foto com IA subestima sistematicamente.** Estudo NIH/NIDDK apresentado no
NUTRITION 2026, 102 refeições pesadas a 0,1g: Cal AI −345 kcal/refeição,
Lose It! −333, MyFitnessPal −327. Todos subestimaram gordura em ~30g. O erro
não é aleatório, é enviesado para baixo — não se dilui, acumula. Prato
brasileiro é o pior cenário: culinária não-ocidental perde 25-30% de acurácia
e prato misto amorfo (arroz+feijão+mistura) cai de 95% para 65-75%.

**Contar caloria tem risco documentado.** Simpson & Mazzeo (2017), Eating
Behaviors 26:89-92, n=493. Levinson et al.: 73% dos pacientes com transtorno
alimentar que usavam MyFitnessPal perceberam que o app contribuiu para os
sintomas. São estudos transversais, não estabelecem causalidade. Implicação: o
anti-culpa precisa ser estrutural (piso calórico, sem streak punitivo, sem
projeção de peso futuro), não só tom de copy.

## Timing

MyFitnessPal em crise de retenção pós-redesign de abril/2026 (campanha de
review 1 estrela, migração para Cronometer). Cal AI foi comprado pela
MyFitnessPal em março/2026, removido da App Store em abril por paywall que a
Apple descreveu como "desenhado pra enganar", e teve vazamento de 3,2 milhões
de usuários (Firebase sem autenticação). Yazio tem 0% de reclamações
respondidas no Reclame Aqui, reputação Não Recomendada. Tecnonutri, único
tracker BR de massa, abandonou o iOS (parado na v5.1.3 de 07/02/2024, dois anos
e meio sem update) e trancou o Pro atrás do Wellhub — não dá mais pra assinar
direto.

**Correção sobre o mercado BR:** Dieta e Saúde foi descontinuado em 01/11/2022
(hoje pertence à Vitat, do Grupo Raia Drogasil, junto com o Tecnonutri). Não
consegui confirmar o redirect do domínio por conta própria — a resolução de DNS
falhou na minha rede — então trate essa parte como não verificada em primeira mão.

Quem ocupa o espaço hoje: Alimente-se (4,82 · 5.656 avaliações), FitCal (4,84),
Nutri Inteligente (4,77), Kaloria (4,86). Todos com base colaborativa sem
curadoria. Review real do líder BR, que é exatamente a dor que este app ataca:
*"quando pesquiso um alimento, aparecem várias opções do mesmo alimento e com
valores nutricionais completamente diferentes. Como vou saber qual é o certo?"*
A resposta da empresa foi "estamos estudando fazer uma revisão no nosso banco
de dados".

Dietbox (71.460 avaliações) e WebDiet (198.029) são B2B2C — apps companheiros
do paciente pra receber a dieta do nutricionista, não trackers self-service.
