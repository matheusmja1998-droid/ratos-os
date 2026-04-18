---
name: debrief-lancamento
description: >
  Faz o debriefing completo de um lançamento da WinVision (Caio, Liso ou Fernanda).
  Coleta os dados do lançamento, analisa o funil, identifica o que funcionou e o que falhou,
  e gera 3 entregas: resumo interno, diagnóstico por etapa do funil, e rascunho pro cliente.
  Salva o histórico na pasta do cliente.
  Use quando o usuário disser "faz o debrief do lançamento", "vamos analisar o lançamento",
  "acabou o lançamento do X", "quero entender o que aconteceu no lançamento".
---

# /debrief-lancamento — Debriefing de Lançamento

## Dependências

- `_contexto/empresa.md` — contexto dos clientes
- `_contexto/preferencias.md` — tom de voz
- Histórico anterior: `winvision/clientes/[cliente]/lancamentos/` (se existir)

---

## Workflow

### Passo 1 — Identificar o cliente

Se o usuário não especificou, perguntar:

> "É o debrief de qual cliente? Caio, Liso (Kleber) ou Fernanda?"

Mapear pro slug da pasta:
- Caio → `prof-caio-pickcius`
- Liso / Kleber → `liso-ideal`
- Fernanda → `fernanda-serraglia`

---

### Passo 2 — Coletar os dados

Pedir os números do lançamento. Se o usuário já colou os dados ou anexou um arquivo, usar direto sem perguntar.

Campos a coletar (pedir todos de uma vez, não um por um):

```
- Nome/tema do lançamento:
- Data de início e fim:
- Tipo: (PL, perpétuo, SL, outro)
- Faturamento bruto:
- Faturamento líquido (após reembolsos):
- Nº de vendas:
- Ticket médio:
- % de reembolso:
- Leads captados:
- CPL (custo por lead):
- Investimento total em tráfego:
- ROAS:
- Taxa de conversão leads → vendas:
- Canais de tráfego usados:
- Observações livres (o que aconteceu, o que foi diferente):
```

Se algum campo não tiver disponível, continuar assim mesmo — indicar como "não informado" na análise.

---

### Passo 3 — Buscar histórico anterior

Verificar se existe algum arquivo em `winvision/clientes/[cliente]/lancamentos/`. Se existir, ler o mais recente pra comparar resultados.

---

### Passo 4 — Analisar

#### 4.1 Panorama geral
- O lançamento bateu a meta? (se não tiver meta explícita, perguntar ou estimar pelo histórico)
- ROAS saudável? (referência: acima de 3x é bom pra info, abaixo de 2x é preocupante)
- CPL dentro do esperado?
- Reembolso alto? (acima de 10% merece atenção)

#### 4.2 Diagnóstico por etapa do funil

Para cada etapa, avaliar o que funcionou e o que freou:

| Etapa | O que medir | Pergunta-chave |
|-------|-------------|----------------|
| **Tráfego** | CPL, alcance, CTR | O tráfego chegou barato e qualificado? |
| **Captação** | Leads, taxa de opt-in | A página capturou bem? |
| **Aquecimento** | Engajamento, presença, abertura de e-mails | As pessoas chegaram quentes pro carrinho? |
| **Carrinho** | Conversão, velocidade de vendas | Quanto veio nas primeiras horas? Quanto veio na virada? |
| **Retenção** | % reembolso, LTV inicial | A promessa foi cumprida? |

#### 4.3 O que ficou na mesa
- Oportunidades não aproveitadas (upsell, extensão de carrinho, remarketing, etc.)
- Gargalos que custaram vendas
- O que teria mudado o resultado com pouca mudança (alavancas fáceis)

#### 4.4 Comparação com lançamento anterior (se houver histórico)
- Faturamento: cresceu ou caiu?
- CPL: melhorou ou piorou?
- Conversão: evoluiu?
- O que mudou entre os dois lançamentos?

---

### Passo 5 — Gerar os 3 outputs

#### Output 1 — Resumo executivo (uso interno)

```markdown
# Debrief — [Nome do Lançamento] | [Cliente]
*[Data]*

## O que aconteceu
[2-3 parágrafos com o panorama geral do lançamento]

## O que funcionou
- [item com contexto]
- [item com contexto]

## O que freou
- [item com contexto]
- [item com contexto]

## O que ficou na mesa
- [oportunidade não aproveitada]
- [oportunidade não aproveitada]

## 3 próximos passos
1. [ação concreta pro próximo lançamento]
2. [ação concreta pro próximo lançamento]
3. [ação concreta pro próximo lançamento]

## Números-chave
| Métrica | Valor |
|---------|-------|
| Faturamento bruto | |
| Faturamento líquido | |
| Nº de vendas | |
| Ticket médio | |
| Reembolso | |
| Leads | |
| CPL | |
| Investimento tráfego | |
| ROAS | |
| Conversão leads→vendas | |
```

#### Output 2 — Diagnóstico de funil

Tabela + comentário por etapa (tráfego, captação, aquecimento, carrinho, retenção). Linguagem técnica, pra uso interno.

#### Output 3 — Rascunho pro cliente

Tom mais leve. Destacar o que foi positivo primeiro, depois o que vai melhorar. Sem expor gaps internos ou críticas diretas — apresentar como "oportunidades pro próximo lançamento". Sem dados que possam gerar desconforto se compartilhados diretamente.

---

### Passo 6 — Salvar o histórico

Salvar o Output 1 (resumo executivo completo com todos os números) em:

```
winvision/clientes/[cliente]/lancamentos/[YYYY-MM]_[tema-do-lancamento].md
```

Exemplo: `winvision/clientes/prof-caio-pickcius/lancamentos/2026-04_lancamento-mecanico-expert.md`

Confirmar com o usuário o nome do arquivo antes de salvar.

---

## Regras

- Nunca inventar dados — se não tiver o número, dizer "não informado"
- Output 3 (pro cliente) nunca deve expor críticas diretas, só oportunidades
- Fernanda: seguir compliance de linguagem (`_contexto/preferencias.md` e memória de compliance)
- Análise sempre em prosa + tabela — não só bullet points
- Tom conforme `_contexto/preferencias.md`
- Perguntar todos os dados de uma vez, não em sequência um a um
