---
name: cockpit-report
description: Gera relatório semanal de performance pra um cliente da WinVision ou L.M Agência. Cruza dados de Meta Ads, Kommo, planilhas e atividades da semana, gera análise com recomendações e envia via Telegram pro Matheus ou direto pro cliente. Use quando o Matheus disser "faz o relatório semanal do [cliente]", "manda o report da semana", "relatório dos últimos 7 dias", ou /relatorio-semanal-cliente. Pode rodar manual ou via cron toda segunda 8h.
---

---

## 🚀 Setup conversacional (primeira vez)

> Quando rodar `/cockpit-report` pela primeira vez ou `/cockpit-report setup`.

### Passo 1 — Verificar pré-requisitos

> "Cockpit Report manda relatório semanal automático. Preciso configurar:
>
> 1. Conexão com Meta (já tem se Meta tá configurada)
> 2. CRM (Kommo/RD/HubSpot) — opcional
> 3. Pra quem manda o relatório (Telegram teu ou direto pro cliente)
> 4. Que dia/hora dispara
> 5. Identidade visual brandizada
>
> Vamos? (vai/cancelar)"

### Passo 2 — Configurar destino dos relatórios

> "Pra quem o relatório vai? Tem 3 opções:
>
> 1. **Pra mim** (gestor) — eu reviso e mando manual pro cliente
> 2. **Direto pro cliente** — chega no Telegram dele
> 3. **Misto** — mandar pra mim primeiro, eu aprovo, aí dispara pro cliente
>
> Qual? (1/2/3)"

Salvar:
```bash
echo "REPORT_DESTINO={{1|2|3}}" >> ~/Cockpit/.env
```

### Passo 3 — Configurar CRM (opcional)

> "Tu usa CRM? (sim/não)
>
> Se sim, qual? (Kommo/RD/HubSpot/outro)"

Se Kommo:
```bash
echo "Pra conectar Kommo, preciso de:"
echo "1. Subdomínio (ex: minhaagencia.kommo.com → 'minhaagencia')"
echo "2. Token (em Configurações → Integrações → Token longo)"
```

Salvar:
```bash
cat >> ~/Cockpit/.env << EOF
KOMMO_SUBDOMAIN={{subdomain}}
KOMMO_TOKEN={{token}}
EOF
```

### Passo 4 — Configurar cron

> "Quando o relatório dispara automaticamente?
>
> Padrão: **toda segunda às 8h**
>
> Tu quer:
> 1. Padrão (segunda 8h)
> 2. Outro dia/horário
> 3. Manual (rodo quando quero)"

Se 2: perguntar dia da semana e horário. Configurar cron:
```bash
crontab -l | { cat; echo "0 8 * * 1 cd ~/Cockpit && claude /cockpit-report todos"; } | crontab -
```

### Passo 5 — Brandização

> "Vou usar tua identidade visual nos relatórios.
>
> Tu tem:
> - Logo? (caminho do arquivo)
> - Cor principal? (hex)
> - Cor secundária? (hex)
> - Fonte preferida? (ou padrão)
>
> Manda os dados ou diz 'pula' pra usar padrão neutro."

Salvar em `~/Cockpit/marca/design-guide.md`.

### Passo 6 — Teste de validação

> "Vou gerar um relatório de teste agora pra ti ver."

Rodar com dados de 1 cliente real ou exemplo. Mostrar output.

### Passo 7 — Confirmação + próximos passos

> "✅ **Cockpit Report configurado.**
>
> Comandos:
> - `/cockpit-report [cliente] últimos 7 dias` — manual
> - `/cockpit-report todos` — gera de todos clientes ativos
>
> Cron rodando {{dia/hora}}.
>
> **Próxima skill:**
>
> ```bash
> cd ~/Cockpit/.claude/skills && git clone https://github.com/matheusmja1998-droid/cockpit-creative.git
> ```
>
> Roda `/cockpit-creative` pra começar o setup."

---

# Skill: Relatório Semanal de Cliente

Gera relatório executivo dos últimos 7 dias por cliente, cruzando todas as fontes de dados disponíveis. Substitui aquela hora chata de toda segunda compilando manualmente.

## Quando usar

- **Manual:** Matheus pede "faz o relatório do [cliente]"
- **Automático:** rodar via `/schedule` toda segunda 8h pra todos clientes ativos

## Fluxo

### Passo 1 — Identificar cliente e período

1. Perguntar qual cliente (ou rodar pra lista pré-definida se for cron)
2. Período padrão: **últimos 7 dias** (segunda a domingo da semana anterior)
3. Se Matheus quiser período diferente (ex: "últimos 14 dias"), aceitar

### Passo 2 — Ler contexto do cliente

1. Ler `[agencia]/clientes/[slug]/CLAUDE.md` pra saber:
   - Tipo de serviço (lançamento? perpétuo? comercial?)
   - Produto principal e preço
   - Meta atual (se tiver lançamento ativo)
   - Compliance / restrições
2. Ler memórias relevantes (lançamento ativo, métricas alvo)

### Passo 3 — Coletar dados das fontes disponíveis

**Sempre que aplicável, puxar:**

#### A. Meta Ads (se cliente tem tráfego pago)
Usar skill `meta-ads-ratos`:
```bash
python3 ~/.claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id [act_XXX] --date-preset last_7d --level campaign
```

Extrair:
- Gasto total da semana
- Leads/conversões
- CPL médio
- Variação vs semana anterior
- Top 3 campanhas (melhores)
- Top 3 piores (CPL alto)
- Frequência média (sinal de saturação)

#### B. Kommo (se cliente é L.M ou tem CRM Kommo)
Usar skill `kommo-crm`:
- R1s realizadas na semana
- R2s realizadas
- Contratos fechados
- Leads novos no funil
- Leads que avançaram de etapa
- Leads parados / perdidos

#### C. Lançamento ativo (se aplicável)
- Leads captados no acumulado vs meta
- Dias passados / dias restantes
- Ritmo necessário pra bater meta
- Status da conta Meta (saúde)

#### D. Conteúdo publicado
Verificar `[cliente]/conteudo/` por arquivos novos na semana:
- Carrosséis publicados
- Pautas executadas
- Vídeos gravados/editados

#### E. Atividades manuais (input do Matheus)
Perguntar:
- "Teve alguma reunião importante essa semana?"
- "Algum problema/win que não tá nos dados?"

### Passo 4 — Análise com Claude

Não despejar dados brutos. **Analisar e tirar conclusão.** Usar Claude pra:

1. **Identificar padrão da semana** — "CPL caiu 15% comparado à semana anterior, principalmente puxado pela campanha X"
2. **Detectar anomalias** — "Frequência subiu pra 4.2 na campanha Y, sinal de saturação criativa"
3. **Sugerir ações** — "Recomendo: subir 3 criativos novos nessa segunda; aumentar budget em 20% na campanha Z (CPL 30% abaixo do target)"
4. **Comparar com meta** — "Tá 12% acima da meta semanal, no ritmo bate"

### Passo 5 — Gerar relatório formatado

Estrutura padrão (adaptar ao tipo de cliente):

```markdown
# Relatório Semanal — [Cliente]
**Período:** [DD/MM] a [DD/MM/YYYY]

## 📊 Resumo executivo
[1 parágrafo direto — o que aconteceu, como tá vs meta, próxima ação]

## 💰 Tráfego pago (se aplicável)
| Métrica | Esta semana | Semana anterior | Variação |
|---|---|---|---|
| Gasto | R$ X | R$ Y | ↑/↓ Z% |
| Leads | N | M | ↑/↓ % |
| CPL | R$ X | R$ Y | ↑/↓ % |
| Frequência | X | Y | — |

**Destaque positivo:** [campanha/criativo que voou]
**Atenção:** [campanha/criativo problemático]

## 📞 Comercial (se L.M)
- R1s realizadas: X
- R2s realizadas: Y
- Contratos fechados: Z (R$ XX faturados)
- Leads novos no funil: N
- Leads parados >7 dias: M (precisa reativar)

## 🎯 Lançamento ativo (se aplicável)
- Leads captados: X / META Y (% da meta)
- Dias passados: A / Restantes: B
- Ritmo necessário: N leads/dia
- Status: [no ritmo / abaixo / crítico]

## 📱 Conteúdo
- Posts publicados: X
- Carrosséis: Y
- Vídeos: Z

## 🚨 Riscos e bloqueios
[Coisas que podem dar problema na próxima semana]

## ✅ Recomendações pra próxima semana
1. [Ação concreta 1]
2. [Ação concreta 2]
3. [Ação concreta 3]

---
*Gerado pelo Guardião WinVision — [data]*
```

### Passo 6 — Salvar e enviar

1. **Salvar** em `[cliente]/relatorios/YYYY-MM-DD-relatorio-semanal.md`
2. **Mostrar ao Matheus** o relatório completo
3. **Perguntar** o destino:
   - **Só salvar** (Matheus lê depois)
   - **Telegram do Matheus** (envia via bot do Guardião)
   - **WhatsApp/email do cliente** (Matheus envia, ou via API se configurado)
4. Se for pra Telegram, formatar pra HTML simples (`<b>`, `<i>`)

### Passo 7 — Atualizar contexto

- Adicionar entrada no `tarefas.md` se houver ação recomendada urgente
- Atualizar memória se descobriu padrão importante (ex: "campanha X sempre tem CPL melhor às terças")

## Configuração pra rodar automático

Se Matheus pedir pra automatizar:

1. Confirmar lista de clientes que entram no relatório semanal
2. Criar via `/schedule`:
   - Cron: `0 11 * * 1` (toda segunda 8h horário Brasília = 11h UTC)
   - Comando: rodar essa skill pra cada cliente da lista
   - Destino padrão: Telegram do Matheus
3. Salvar config em `.claude/skills/relatorio-semanal-cliente/config.json`:
```json
{
  "clientes_automaticos": ["fernanda-serraglia", "prof-caio-pickcius"],
  "destino_padrao": "telegram_matheus",
  "horario_envio": "monday_08h"
}
```

## Regras importantes

1. **Não inventar números** — se uma fonte não tá disponível ou retornou erro, escrever "[Dados não disponíveis]" em vez de chutar
2. **Análise > dados brutos** — relatório com 50 números e 0 conclusão é inútil; sempre interpretar
3. **Recomendações precisam ser concretas** — "Aumentar budget" é ruim. "Aumentar budget da campanha X em 20% (de R$500 pra R$600/dia) porque o CPL tá R$8 contra target de R$14" é bom
4. **Compliance respeitado** — se cliente tem restrição (Fernanda NZ), recomendações precisam respeitar
5. **Tom adaptado ao destino** — relatório pro Matheus pode ser mais técnico; relatório pro cliente é mais executivo
6. **Anti-spam** — se rodar automático, salvar log do que foi enviado pra não duplicar

## Caso de uso típico

**Matheus (segunda 8h):** "faz o relatório do Caio"

**Claude:**
1. Lê CLAUDE.md do Caio (lançamento ANE_MAI_26 ativo)
2. Puxa Meta Ads da semana
3. Verifica Kommo (Caio não usa)
4. Vê dashboard de captação
5. Verifica conteúdo publicado em `prof-caio-pickcius/conteudo/`
6. Gera relatório com análise + 3 recomendações
7. Mostra pro Matheus
8. Salva em `prof-caio-pickcius/relatorios/2026-04-26-relatorio-semanal.md`
9. Envia no Telegram do Matheus

**Tempo total:** ~2 minutos (vs 1h fazendo manual).
