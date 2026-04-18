---
name: debrief-lancamento
description: >
  Faz o debriefing completo de um lançamento da WinVision (Caio, Liso ou Fernanda).
  Recebe a planilha do lançamento (salva em dados/), lê todas as abas, calcula a quebra
  de mapeamento, e gera análise completa por posicionamento, temperatura, conjuntos,
  criativos e países (Fernanda). Salva o histórico na pasta do cliente.
  Use quando o usuário disser "faz o debrief do lançamento", "analisa o lançamento",
  "acabou o lançamento do X", "quero entender o que aconteceu".
---

# /debrief-lancamento — Debriefing de Lançamento

## Dependências

- `_contexto/empresa.md` — contexto dos clientes
- `_contexto/preferencias.md` — tom de voz
- Planilha do lançamento salva em `dados/`
- Histórico anterior: `winvision/clientes/[cliente]/lancamentos/` (se existir)

---

## Metodologia de análise (como funciona a quebra)

O mapeamento de compradores é feito via PROCV cruzando e-mail de comprador com e-mail de lead. Alguns compradores compram com e-mail diferente do que se cadastraram — esses ficam sem origem mapeada. Isso é chamado de **quebra**.

**Como a quebra afeta os números:**
- Se 25% dos compradores não foram mapeados → quebra = 25%
- Essa quebra é refletida proporcionalmente nos leads e no investimento
- Todos os KPIs (ROAS, conversão, CPL) são calculados **sobre os números ajustados pela quebra**
- A planilha já faz esse ajuste automaticamente nas colunas "Leads - X%" e "Valor investido - X%"

**Regra de ouro:** nunca analisar ROAS ou conversão sobre o total bruto. Sempre sobre o mapeado (após quebra).

---

## Workflow

### Passo 1 — Identificar cliente e planilha

Se o usuário não especificou o cliente, perguntar:
> "É o debrief de qual cliente? Caio, Liso (Kleber) ou Fernanda?"

Mapear pro slug da pasta:
- Caio → `prof-caio-pickcius`
- Liso / Kleber → `liso-ideal`
- Fernanda → `fernanda-serraglia`

Verificar se existe planilha em `dados/`. Se houver mais de uma, perguntar qual usar.

---

### Passo 2 — Ler a planilha com Python

Usar `openpyxl` com `data_only=True` para ler os valores calculados (não as fórmulas).

```python
import openpyxl
wb = openpyxl.load_workbook('dados/[arquivo].xlsx', read_only=True, data_only=True)
```

**Abas a ler:**

| Aba | O que contém |
|-----|--------------|
| `LEADS` | Todos os leads com UTMs (source, campaign, medium, content, term) |
| `COMPRADORES` | Compradores com PROCV já feito puxando UTMs dos leads |
| `Analise` | Tabelas calculadas com quebra aplicada: por posicionamento, temperatura, conjunto, criativo |
| `RESULTADOS` | Consolidação final (pode ter fórmulas — preferir ler Analise) |

**Lógica de leitura:**
- Ler `Analise` com `data_only=True` — os valores já estão calculados com quebra
- Identificar os blocos por cabeçalho: POSICIONAMENTO, TEMPERATURA, CONJUNTO, CRIATIVOS, PAÍSES (se existir)
- Ignorar linhas vazias e colunas None

---

### Passo 3 — Calcular a quebra

```
Total compradores (aba COMPRADORES) = X
Compradores mapeados (com UTM origem preenchida) = Y
Quebra = (X - Y) / X × 100%
```

A planilha já aplica a quebra nas colunas ajustadas. Confirmar qual percentual foi usado.

---

### Passo 4 — Extrair os dados por dimensão

**4.1 Posicionamento (Facebook / Instagram / Orgânico)**
- Leads, Leads ajustados, Compradores, Taxa de conversão

**4.2 Temperatura (Frio / Orgânico)**
- Leads, Leads ajustados, Compradores, Taxa de conversão, Investimento, Investimento ajustado, Faturamento, ROAS, CPL limite

**4.3 Conjuntos de anúncios**
- Mesmas colunas de temperatura
- Ordenar por ROAS (maior pra menor)
- Destacar top 3 e bottom 3

**4.4 Criativos**
- Mesmas colunas
- Ordenar por ROAS
- Identificar o criativo dominante (mais leads ou mais compradores)
- Verificar padrão no nome do criativo (tema, mês, versão)

**4.5 Países (apenas Fernanda)**
- Se existir bloco de países na planilha, extrair conversão por país
- Portugal geralmente é separado dos demais

---

### Passo 5 — Buscar histórico anterior

Verificar `winvision/clientes/[cliente]/lancamentos/`. Se houver arquivo anterior, ler e comparar:
- Faturamento líquido
- ROAS geral
- CPL
- Taxa de conversão geral
- Criativo dominante
- Quebra de mapeamento

---

### Passo 6 — Gerar os 3 outputs

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

#### Output 2 — Diagnóstico de criativos

Lista completa dos criativos com ROAS, compradores e conversão, ordenados do melhor pro pior. Identificar padrões: qual tema performa, qual versão ganhou, qual mês de criativo dominou.

#### Output 3 — Rascunho pro cliente

Tom mais leve. Destacar positivo primeiro. Apresentar gaps como "oportunidades". Sem expor números internos que possam gerar desconforto. Sem mencionar quebra de mapeamento diretamente.

---

### Passo 7 — Salvar o histórico

Salvar o Output 1 em:
```
winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema].md
```

Confirmar o nome do arquivo com o usuário antes de salvar.

---

## Regras

- Sempre usar `data_only=True` no openpyxl — as fórmulas na planilha não são lidas, apenas os valores calculados
- Nunca calcular ROAS ou conversão sobre total bruto — sempre sobre o mapeado (após quebra)
- Fernanda: sempre incluir análise por países e seguir compliance de linguagem (não usar "ensinar a investir", "ajudar a investir" — só "mostrar caminhos")
- Output 3 nunca expõe quebra de mapeamento nem críticas diretas
- Análise sempre em prosa + tabelas — não só listas
- Tom conforme `_contexto/preferencias.md`
- Se `openpyxl` não estiver instalado: `pip3 install openpyxl --break-system-packages`
