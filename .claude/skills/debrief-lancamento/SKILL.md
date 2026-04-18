---
name: debrief-lancamento
description: >
  Faz o debriefing completo de um lançamento de qualquer cliente da WinVision.
  Recebe planilha de leads e de compradores (salvas em dados/), cruza os dados,
  calcula a quebra de mapeamento, busca investimento na Meta Ads API, e gera análise
  completa por posicionamento, temperatura, conjuntos e criativos. Salva o histórico
  na pasta do cliente. Use quando o usuário disser "faz o debrief do lançamento",
  "analisa o lançamento", "acabou o lançamento do X", "quero entender o que aconteceu".
---

# /debrief-lancamento — Debriefing de Lançamento

## Dependências

- `_contexto/empresa.md` — lista de clientes e contexto
- `_contexto/preferencias.md` — tom de voz
- `.claude/skills/meta-ads-ratos/contas.yaml` — contas Meta por cliente
- Planilha de leads salva em `dados/`
- Planilha de compradores salva em `dados/`
- Planilha de países salva em `dados/` (apenas clientes com segmentação geográfica, ex: Fernanda)
- Histórico anterior: `winvision/clientes/[cliente]/lancamentos/` (se existir)

---

## Metodologia de análise (como funciona a quebra)

O mapeamento é feito cruzando e-mail do comprador com e-mail do lead (equivalente a um PROCV). Compradores que compraram com e-mail diferente do cadastro ficam sem origem — isso é a **quebra**.

**Como a quebra afeta os números:**
- Se 25% dos compradores não foram mapeados → quebra = 25%
- Essa quebra é aplicada proporcionalmente nos leads e no investimento
- Todos os KPIs (ROAS, conversão, CPL) são calculados **sobre os números ajustados pela quebra**

**Regra de ouro:** nunca calcular ROAS ou conversão sobre o total bruto. Sempre sobre o mapeado (após quebra).

---

## Workflow

### Passo 1 — Identificar cliente e arquivos

Se o usuário não especificou o cliente, perguntar qual cliente da WinVision. Ler `_contexto/empresa.md` pra listar os clientes ativos se necessário.

Mapear o nome do cliente pro slug da pasta em `winvision/clientes/`:
- Caio / Mecânico Expert → `prof-caio-pickcius`
- Liso / Kleber → `liso-ideal`
- Fernanda / Vem Doleta → `fernanda-serraglia`
- EV Cosméticos → `ev-cosmeticos`
- Novos clientes: usar slug no formato `nome-sobrenome` ou `nome-produto`

Verificar arquivos em `dados/`. Identificar leads e compradores pelo nome do arquivo ou perguntar ao usuário.

Se for Fernanda (ou outro cliente com segmentação geográfica), verificar se tem planilha de países em `dados/` também.

---

### Passo 2 — Ler os dois arquivos com Python

```python
import openpyxl

wb_leads = openpyxl.load_workbook('dados/[arquivo_leads].xlsx', read_only=True, data_only=True)
wb_comp = openpyxl.load_workbook('dados/[arquivo_compradores].xlsx', read_only=True, data_only=True)
```

**Estrutura esperada — Leads:**
- Colunas: `email`, `telefone`, `date_lead`, `utm_source`, `utm_campaign`, `utm_medium`, `utm_content`, `utm_term`

**Estrutura esperada — Compradores:**
- Coluna principal: `email` (ou equivalente)
- Pode conter: valor da compra, data da compra

Se as colunas tiverem nomes diferentes, identificar pelo conteúdo.

---

### Passo 3 — Cruzar compradores com leads (PROCV)

```python
import pandas as pd

df_leads = pd.read_excel('dados/[leads].xlsx')
df_comp = pd.read_excel('dados/[compradores].xlsx')

# Normalizar e-mails (lowercase, strip)
df_leads['email'] = df_leads['email'].str.lower().str.strip()
df_comp['email'] = df_comp['email'].str.lower().str.strip()

# Cruzar
df_merged = df_comp.merge(df_leads[['email','utm_source','utm_campaign','utm_medium','utm_content','utm_term']], 
                           on='email', how='left')

# Mapeados = compradores que tiveram match
df_mapeados = df_merged[df_merged['utm_source'].notna()]
df_nao_mapeados = df_merged[df_merged['utm_source'].isna()]
```

---

### Passo 4 — Calcular a quebra

```python
total_compradores = len(df_comp)
compradores_mapeados = len(df_mapeados)
quebra_pct = (total_compradores - compradores_mapeados) / total_compradores

# Aplicar quebra nos leads e investimento
leads_ajustados = total_leads * (1 - quebra_pct)
investimento_ajustado = investimento_total * (1 - quebra_pct)
```

O investimento vem da Meta Ads API (passo 5 abaixo) — não precisa perguntar ao usuário.

---

### Passo 5 — Buscar investimento na Meta Ads API

Usar os scripts da skill `meta-ads-ratos` pra puxar o `spend` por conjunto e por criativo, no período do lançamento.

**Mapeamento de UTMs:**
- `utm_source` → temperatura (paid-cold = frio, organico = orgânico)
- `utm_campaign` → placement (Facebook_Mobile_Feed, Instagram_Feed...) — não usar pra análise
- `utm_medium` → **nome do conjunto de anúncios** (adset_name na Meta)
- `utm_content` → **nome do criativo** (ad_name na Meta)
- `utm_term` → **nome da campanha** (campaign_name na Meta)

**5.1 Identificar a conta do cliente**

Consultar `.claude/skills/meta-ads-ratos/contas.yaml`:
- Fernanda → `act_362367444` (CA1)
- Caio → `act_191737889662177`
- Liso → `act_1375975899342771`

**5.2 Definir o período do lançamento**

Extrair a data mínima e máxima da coluna `date_lead` na planilha de leads — esse é o período a consultar na Meta.

**5.3 Puxar investimento por conjunto (adset)**

```bash
python3 .claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXXXXXX \
  --fields "adset_name,spend" \
  --level adset \
  --time-range '{"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}' \
  --limit 200
```

**5.4 Puxar investimento por criativo (ad)**

```bash
python3 .claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXXXXXX \
  --fields "ad_name,spend" \
  --level ad \
  --time-range '{"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}' \
  --limit 500
```

**5.5 Cruzar com os UTMs**

- `utm_medium` → match com `adset_name` da API (nome do conjunto)
- `utm_content` → match com `ad_name` da API (nome do criativo)

Os nomes nas UTMs têm `+` no lugar de espaço. Normalizar antes do match:

```python
def normalizar(s):
    if not isinstance(s, str):
        return ''
    return s.lower().replace('+', ' ').replace('-', ' ').strip()
```

**5.6 Calcular investimento total**

```python
investimento_total = df_adsets['spend'].astype(float).sum()
```

---

### Passo 6 — Extrair os dados por dimensão

Todas as análises usam **apenas os compradores mapeados** e os **leads/investimento ajustados pela quebra**.

**6.1 Posicionamento** — agrupar por `utm_source` (facebook, instagram, organico)
- Leads aj., Compradores mapeados, Taxa de conversão

**6.2 Temperatura** — agrupar por `utm_medium` (paid-cold = frio, social/organico = orgânico)
- Leads aj., Compradores, Conversão, Investimento aj. (spend × (1 - quebra)), ROAS, CPL

**6.3 Conjuntos de anúncios** — agrupar por `utm_medium`, cruzar com `adset_name` da Meta
- Leads aj., Compradores, Conversão, Spend aj., ROAS, CPL
- Ordenar por ROAS (maior pra menor)
- Destacar top 3 e bottom 3

**6.4 Criativos** — agrupar por `utm_content`, cruzar com `ad_name` da Meta
- Leads aj., Compradores, Conversão, Spend aj., ROAS, CPL
- Ordenar por ROAS
- Identificar o criativo dominante (mais compradores)
- Verificar padrão no nome: tema, mês, versão

**6.5 Países** — quando o cliente tiver segmentação geográfica (ex: Fernanda)
- O cliente envia uma planilha separada com `email` e `país`
- Cruzar essa planilha com a de compradores por e-mail
- Agrupar compradores mapeados por país
- Compradores, Conversão por país

```python
df_paises = pd.read_excel('dados/[arquivo_paises_fernanda].xlsx')
df_paises['email'] = df_paises['email'].str.lower().str.strip()
df_comp_paises = df_mapeados.merge(df_paises, on='email', how='left')
analise_paises = df_comp_paises.groupby('pais').size().reset_index(name='compradores')
```

---

### Passo 7 — Buscar histórico anterior

Verificar `winvision/clientes/[cliente]/lancamentos/`. Se houver arquivo anterior, ler e comparar:
- Faturamento líquido
- ROAS geral
- CPL
- Taxa de conversão geral
- Criativo dominante
- Quebra de mapeamento

---

### Passo 7 — Gerar os 3 outputs

#### Output 1 — Resumo executivo (uso interno)

```markdown
# Debrief — [Nome do Lançamento] | [Cliente]
*[Mês/Ano]*

## Panorama geral
[2-3 parágrafos: o que aconteceu, qual foi o resultado, contexto geral]

## Quebra de mapeamento
- Compradores totais: X
- Compradores mapeados: Y
- Quebra: Z% — [breve comentário se foi alta ou dentro do normal]

## Números-chave (sobre mapeado)
| Métrica | Valor |
|---------|-------|
| Faturamento | |
| Investimento tráfego | |
| ROAS | |
| Leads totais | |
| Leads ajustados | |
| Compradores mapeados | |
| Taxa de conversão | |
| CPL médio | |

## Por posicionamento
| Plataforma | Leads aj. | Compradores | Conversão |
|------------|-----------|-------------|-----------|
| Facebook | | | |
| Instagram | | | |
| Orgânico | | | |

## Por temperatura
| Temperatura | Leads aj. | Compradores | Conversão | Invest. aj. | ROAS |
|-------------|-----------|-------------|-----------|-------------|------|
| Frio | | | | | |
| Orgânico | | | | | |

## Top criativos (por ROAS)
1. [nome] — ROAS X, Y compradores
2. [nome] — ROAS X, Y compradores
3. [nome] — ROAS X, Y compradores

## Criativos abaixo do esperado
- [nome] — ROAS X, Y compradores

## [Países — apenas Fernanda]
| País | Compradores | Conversão |
|------|-------------|-----------|

## O que funcionou
- [item com contexto]

## O que freou
- [item com contexto]

## O que ficou na mesa
- [oportunidade não aproveitada]

## 3 próximos passos
1. [ação concreta pro próximo lançamento]
2. [ação concreta pro próximo lançamento]
3. [ação concreta pro próximo lançamento]

## vs. Lançamento anterior
[comparativo se houver histórico]
```

#### Output 2 — Diagnóstico completo de criativos

Lista completa dos criativos com ROAS, compradores e conversão, ordenados do melhor pro pior. Identificar padrões: qual tema performa, qual versão ganhou, qual mês de criativo dominou.

#### Output 3 — Rascunho pro cliente

Tom mais leve. Destacar positivo primeiro. Apresentar gaps como "oportunidades". Sem expor números internos que possam gerar desconforto. Sem mencionar quebra de mapeamento diretamente.

---

### Passo 8 — Salvar tudo na pasta do cliente

**8.1 Salvar o debrief**

Salvar o Output 1 em:
```
winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema].md
```

**8.2 Mover as planilhas pra pasta do cliente**

Mover os arquivos de `dados/` pra:
```
winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]/
```

Criar a subpasta com o mesmo nome do debrief. Mover todos os arquivos usados:
- planilha de leads
- planilha de compradores
- planilha de países (se existir)

```bash
mkdir -p "winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]"
mv "dados/[arquivo_leads].xlsx" "winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]/"
mv "dados/[arquivo_compradores].xlsx" "winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]/"
# se tiver planilha de países:
mv "dados/[arquivo_paises].xlsx" "winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]/"
```

Confirmar o nome da pasta com o usuário antes de executar.

---

## Regras

- Sempre usar `data_only=True` no openpyxl — as fórmulas na planilha não são lidas, apenas os valores calculados
- Nunca calcular ROAS ou conversão sobre total bruto — sempre sobre o mapeado (após quebra)
- Fernanda: sempre incluir análise por países e seguir compliance de linguagem (não usar "ensinar a investir", "ajudar a investir" — só "mostrar caminhos")
- Output 3 nunca expõe quebra de mapeamento nem críticas diretas
- Análise sempre em prosa + tabelas — não só listas
- Tom conforme `_contexto/preferencias.md`
- Se `openpyxl` não estiver instalado: `pip3 install openpyxl --break-system-packages`
