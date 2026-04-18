---
name: debrief-lancamento
description: >
  Faz o debriefing completo de um lançamento de qualquer cliente da WinVision.
  Recebe planilha de leads e de compradores (salvas em dados/), cruza os dados,
  calcula a quebra de mapeamento, busca investimento na Meta Ads API filtrado pela
  tag do lançamento, e gera análise completa por posicionamento, temperatura,
  criativos e campanhas. Salva debrief, diagnósticos e dashboard HTML prontos.
  Use quando o usuário disser "faz o debrief do lançamento", "analisa o lançamento",
  "acabou o lançamento do X", "quero entender o que aconteceu".
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

### Passo 1 — Identificar cliente, tag e arquivos

Se o usuário não especificou o cliente, perguntar qual cliente da WinVision. Ler `_contexto/empresa.md` pra listar os clientes ativos se necessário.

Mapear o nome do cliente pro slug da pasta em `winvision/clientes/`:
- Caio / Mecânico Expert → `prof-caio-pickcius`
- Liso / Kleber → `liso-ideal`
- Fernanda / Vem Doleta → `fernanda-serraglia`
- EV Cosméticos → `ev-cosmeticos`
- Novos clientes: usar slug no formato `nome-sobrenome` ou `nome-produto`

**Perguntar obrigatoriamente a tag do lançamento** usada no gerenciador de anúncios. Exemplo: `ANE_ABRIL_26`, `AGV_MAR_26`, `IDR_FEV_26`. Sem ela o spend vai incluir campanhas de outros produtos rodando na conta no mesmo período, distorcendo todos os KPIs.

Verificar arquivos em `dados/`. Identificar leads e compradores pelo nome do arquivo ou perguntar ao usuário.

Se for Fernanda (ou outro cliente com segmentação geográfica), verificar se tem planilha de países em `dados/` também.

---

### Passo 2 — Ler os arquivos de leads com Python

Se houver mais de uma planilha de leads (ex: tráfego pago e orgânico separados), unir as duas antes de qualquer análise:

```python
import openpyxl, pandas as pd, warnings
warnings.filterwarnings('ignore')

def load_leads(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    cols = [str(c) if c is not None else f'col_{i}' for i,c in enumerate(rows[0])]
    df = pd.DataFrame(rows[1:], columns=cols)
    df = df[['Email','data','utm_source','utm_campaign','utm_medium','utm_content','utm_term']].copy()
    df = df[df['Email'].notna() & (~df['Email'].astype(str).str.strip().isin(['','None','0']))]
    return df

# Se tiver planilhas separadas, unir:
df_trf = load_leads('dados/[leads_trafego].xlsx')
df_org = load_leads('dados/[leads_organico].xlsx')
df_leads = pd.concat([df_trf, df_org], ignore_index=True)

df_leads.rename(columns={'Email':'email'}, inplace=True)
df_leads['email'] = df_leads['email'].astype(str).str.lower().str.strip()
df_leads_dedup = df_leads.drop_duplicates(subset='email', keep='first')
```

**Estrutura esperada — Leads:**
- Colunas: `Email`, `data`, `utm_source`, `utm_campaign`, `utm_medium`, `utm_content`, `utm_term`

**Estrutura esperada — Compradores:**
- Coluna principal: `Email`
- Pode conter: valor da compra, data da compra, status

Se as colunas tiverem nomes diferentes, identificar pelo conteúdo.

---

### Passo 3 — Ler compradores e cruzar (PROCV)

```python
# Compradores — tentar engine='openpyxl' mesmo se extensão for .xls
df_comp = pd.read_excel('dados/[compradores].xls', engine='openpyxl')
df_comp['email_norm'] = df_comp['Email'].astype(str).str.lower().str.strip()

# Cruzar
df_merged = df_comp.merge(
    df_leads_dedup[['email','utm_source','utm_campaign','utm_medium','utm_content','utm_term']],
    left_on='email_norm', right_on='email', how='left'
)

df_mapeados = df_merged[df_merged['utm_source'].notna()]
df_nao_mapeados = df_merged[df_merged['utm_source'].isna()]
```

---

### Passo 4 — Calcular a quebra

```python
total_compradores = len(df_comp)
compradores_mapeados = len(df_mapeados)
quebra_pct = (total_compradores - compradores_mapeados) / total_compradores

leads_ajustados = len(df_leads_dedup) * (1 - quebra_pct)
```

O investimento vem da Meta Ads API (passo 5 abaixo) — não precisa perguntar ao usuário.

---

### Passo 5 — Buscar investimento na Meta Ads API

**Mapeamento de UTMs:**
- `utm_source` → temperatura (paid-cold = frio, org = orgânico)
- `utm_campaign` → placement (Facebook_Mobile_Feed, Instagram_Reels...)
- `utm_medium` → **nome do conjunto de anúncios** (adset_name na Meta)
- `utm_content` → **nome do criativo** (ad_name na Meta)
- `utm_term` → **nome da campanha** (campaign_name na Meta)

**5.1 Identificar a conta do cliente**

Consultar `.claude/skills/meta-ads-ratos/contas.yaml`:
- Fernanda → `act_362367444`
- Caio → `act_191737889662177`
- Liso → `act_1375975899342771`

**5.2 Definir o período**

Extrair a data mínima e máxima da coluna `data` na planilha de leads.

**5.3 Puxar spend por campanha — filtrado pela tag + LEADS**

```bash
python3 .claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXXXXXX \
  --fields "campaign_name,spend" \
  --level campaign \
  --time-range '{"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}' \
  --limit 200
```

Filtrar em Python: manter **apenas campanhas que contenham a tag do lançamento E a palavra LEADS**. Isso exclui outros produtos e fases de vendas que rodaram no mesmo período.

```python
from collections import defaultdict

TAG = 'ANE_ABRIL_26'  # tag informada pelo usuário no Passo 1

camp_spend = defaultdict(float)
for d in camp_data:
    if TAG in d['campaign_name'] and 'LEADS' in d['campaign_name']:
        camp_spend[d['campaign_name']] += float(d['spend'])

investimento_total = sum(camp_spend.values())
```

**5.4 Puxar spend por criativo — filtrado pela tag + LEADS**

```bash
python3 .claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXXXXXX \
  --fields "campaign_name,ad_name,spend" \
  --level ad \
  --time-range '{"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}' \
  --limit 500
```

```python
ad_spend = defaultdict(float)
for d in ad_data:
    if TAG in d['campaign_name'] and 'LEADS' in d['campaign_name']:
        ad_spend[d['ad_name']] += float(d['spend'])
```

**5.5 Calcular investimento ajustado**

```python
investimento_ajustado = investimento_total * (1 - quebra_pct)
```

---

### Passo 6 — Extrair os dados por dimensão

Todas as análises usam **apenas os compradores mapeados** e os **leads/investimento ajustados pela quebra**.

**6.1 Posicionamento** — agrupar por `utm_campaign` (Facebook_Mobile_Feed, Instagram_Reels, organico...)
- Leads aj., Compradores mapeados, Taxa de conversão

**6.2 Temperatura** — classificar por `utm_source`
- paid-cold → Frio | paid-hot → Quente | org-* / ig / direto → Orgânico
- Leads aj., Compradores, Conversão, Invest. aj., ROAS, CPL

**6.3 Criativos** — agrupar por `utm_content`, cruzar com `ad_name` da Meta
- Leads aj., Compradores, Conversão, Spend aj., ROAS, CPL
- Ordenar por compradores (tabela completa) e por ROAS (top/bottom)
- Identificar criativo dominante (mais compradores) e padrão nos nomes (tema, versão)

**6.4 Campanhas** — agrupar por `utm_term`, cruzar com `campaign_name` da Meta
- Leads aj., Compradores, Conversão, Spend aj., ROAS, CPL
- Ordenar por compradores (tabela completa) e por ROAS (ranking)
- Identificar campanha âncora e maior desperdício

**6.5 Países** — apenas clientes com segmentação geográfica (ex: Fernanda)

```python
df_paises = pd.read_excel('dados/[arquivo_paises].xlsx')
df_paises['email'] = df_paises['email'].str.lower().str.strip()
df_comp_paises = df_mapeados.merge(df_paises, on='email', how='left')
analise_paises = df_comp_paises.groupby('pais').size().reset_index(name='compradores')
```

---

### Passo 7 — Buscar histórico anterior

Verificar `winvision/clientes/[cliente]/lancamentos/`. Se houver debrief anterior, ler e comparar:
- Faturamento, ROAS geral, CPL, taxa de conversão, criativo dominante, quebra

---

### Passo 8 — Gerar os 4 outputs

#### Output 1 — Resumo executivo (uso interno)

```markdown
# Debrief — [Nome do Lançamento] | [Cliente]
*[Mês/Ano]*

## Panorama geral
[2-3 parágrafos: resultado, contexto, destaques]

## Quebra de mapeamento
- Compradores totais: X | Mapeados: Y | Quebra: Z%

## Números-chave (sobre mapeado)
| Métrica | Valor |
|---------|-------|
| Faturamento bruto total | |
| Faturamento mapeado | |
| Investimento Meta (campanhas [TAG] + LEADS) | |
| Investimento ajustado | |
| ROAS | |
| Leads únicos | |
| Leads ajustados | |
| Compradores mapeados | |
| Taxa de conversão | |
| CPL médio | |

## Por posicionamento
## Por temperatura
## Top criativos (por ROAS)
## Criativos abaixo do esperado
## Top campanhas (por ROAS)
## Campanha âncora e maior desperdício
## [Países — apenas Fernanda]
## O que funcionou
## O que freou
## O que ficou na mesa
## 3 próximos passos
## vs. Lançamento anterior
```

#### Output 2 — Diagnóstico completo de criativos

Tabela com todos os criativos: ROAS, compradores, conversão, spend aj. Ordenado por compradores. Análise de padrões: tema, versão, qual grupo performa melhor.

#### Output 3 — Diagnóstico completo de campanhas

Tabela com todas as campanhas: ROAS, compradores, conversão, spend aj. Ordenado por compradores. Análise por fase (teste, público, escala) e tipo (frio, quente, Advantage+).

#### Output 4 — Dashboard HTML

Gerar arquivo HTML completo com Chart.js via CDN, fundo escuro (#0f0f13). Incluir:
- **KPI cards** (2 linhas): faturamento bruto, investimento (leads), ROAS, CPL, compradores totais, quebra, conversão, período
- **Donut**: compradores por temperatura (frio / quente / orgânico)
- **Bar + linha**: compradores e conversão por posicionamento (utm_campaign)
- **Bubble chart**: criativos — eixo X = ROAS, eixo Y = compradores, tamanho = spend; cor por tema
- **Bar + linha**: campanhas — barras coloridas por ROAS (verde ≥4x, azul ≥2,5x, vermelho <2,5x) + linha de ROAS sobreposta
- **Tabela criativos**: badges por ROAS coloridos + mini-barra de compradores
- **Tabela campanhas**: mesma estrutura
- **Seção insights**: o que funcionou + 3 próximos passos

Abrir automaticamente no browser após salvar.

---

### Passo 9 — Salvar tudo na pasta do cliente

```
winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema].md
winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]_diagnostico-criativos.md
winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]_diagnostico-campanhas.md
winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]_dashboard.html
winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]/   ← planilhas aqui
```

```bash
mkdir -p "winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]"
mv "dados/[arquivo_leads].xlsx" "winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]/"
mv "dados/[arquivo_compradores].xls" "winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]/"
open "winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema]_dashboard.html"
```

---

## Regras

- Sempre usar `data_only=True` no openpyxl
- **Nunca calcular ROAS ou conversão sobre total bruto** — sempre sobre mapeado
- **Filtrar spend sempre por tag + LEADS** — nunca puxar spend bruto da conta
- Fernanda: incluir países e compliance ("mostrar caminhos", não "ensinar a investir")
- Output 3 (cliente) nunca expõe quebra nem críticas diretas
- Análise em prosa + tabelas — não só listas
- Tom conforme `_contexto/preferencias.md`
- Se libs não instaladas: `pip3 install openpyxl pandas --break-system-packages`
