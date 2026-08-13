---
name: guardiao
description: Cria o sistema Guardião (monitoramento 24/7 de anúncios Meta Ads via n8n + Claude API + Telegram) pra um cliente da WinVision. Use quando o Matheus disser "cria um Guardião pra [cliente]", "monta o Guardião pro lançamento X", "quero monitorar os anúncios do [cliente]", "Guardião pro Caio/Kleber/EV/Jonas/Fábio". Também dispara com /guardiao.
---

# Skill: Guardião

Gera o sistema Guardião completo pra um cliente: Monitor 1 (anúncios estourados a cada 30min) + Monitor 2 (briefing de ritmo 6h/12h/16h) + Monitor 3 (saúde da conta a cada 2h). Cria credentials no n8n, sobe os 3 workflows via API, ativa e salva doc no Obsidian.

## Contexto do sistema

Arquitetura:
```
n8n (cron) → Meta Ads API → Claude Haiku 4.5 → Telegram Bot
```

Infraestrutura fixa da WinVision:
- **n8n**: `https://n8n.valvularocket.com` (plano Max da Válvula)
- **Telegram Bot**: `@guardiao_winvision_bot` (chat ID Matheus: `956206959`)
- **Claude API**: conta Anthropic do Matheus

Credenciais base já existem no n8n (compartilhadas entre clientes):
- `Guardiao - Telegram Bot` → id `3DUzKhPUpPLtDfOn`
- `Guardiao - Anthropic` → id `c4QkR1YwxtjwzYsZ`

A credencial de Meta Ads é **por cliente** porque muda o token/ad account. Nome padrão: `Guardiao - Meta Ads ([Cliente])`.

## Fluxo da skill

### Passo 1 — Entrevistar o Matheus

Sempre perguntar (nunca assumir):

1. **Cliente:** qual cliente? (consultar `contas.yaml` da skill `meta-ads-ratos` pra pegar ad account)
2. **Lançamento/filtro:** qual string aparece no nome das campanhas que devem ser monitoradas? (ex: `AGV_MAI_26`, `JII_JUN_26`)
3. **Período do lançamento:** data de início e fim da captação (ISO: `2026-04-17` a `2026-05-04`)
4. **Meta de leads:** quantos leads tem que captar no total?
5. **CPL target individual:** em reais (default: R$14)
6. **CPL viável de campanha:** limite de operação (default: R$16,17)
7. **Threshold de gasto pra alertar anúncio maduro:** default R$42 (3x CPL)
8. **Anti-spam:** quantas horas de cooldown entre alertas do mesmo ad? (default: 4h)
9. **Horários do briefing:** default 6h, 12h e 16h — confirmar se quer diferente
10. **Ativar na hora?** ou criar desativado pra revisar?

### Passo 2 — Verificar/criar credencial Meta do cliente

Consultar se já existe credencial `Guardiao - Meta Ads ([Cliente])` no n8n. Se não, pegar o token atual do `.env` da skill `meta-ads-ratos` e criar via API:

```bash
curl -X POST -H "X-N8N-API-KEY: $API_KEY" \
  "https://n8n.valvularocket.com/api/v1/credentials" \
  -d '{"name":"Guardiao - Meta Ads ([Cliente])","type":"facebookGraphApi","data":{"accessToken":"..."}}'
```

Guardar o `id` retornado pra usar nos workflows.

### Passo 3 — Criar Monitor 1

Usar o template `templates/monitor1.json` (nessa skill). Substituir placeholders:

| Placeholder | Substituir por |
|---|---|
| `{{WORKFLOW_NAME}}` | `Guardião [Cliente] — Monitor 1 (Anúncios Estourados)` |
| `{{AD_ACCOUNT}}` | `act_XXX` do cliente |
| `{{META_CRED_ID}}` | ID da credencial Meta |
| `{{ANTHROPIC_CRED_ID}}` | `c4QkR1YwxtjwzYsZ` |
| `{{TELEGRAM_CRED_ID}}` | `3DUzKhPUpPLtDfOn` |
| `{{CHAT_ID}}` | `956206959` |
| `{{LANCAMENTO_FILTRO}}` | string tipo `AGV_MAI_26` |
| `{{CPL_TARGET}}` | `14` |
| `{{CPL_VIAVEL}}` | `16.17` |
| `{{LIMITE_NOVO_GASTO}}` | `40` |
| `{{LIMITE_MADURO_GASTO}}` | `42` |
| `{{CPL_RUIM_MADURO}}` | `20` |
| `{{COOLDOWN_HORAS}}` | `4` |

POST em `https://n8n.valvularocket.com/api/v1/workflows`.

### Passo 4 — Criar Monitor 2

Usar `templates/monitor2.json`. Placeholders:

| Placeholder | Substituir por |
|---|---|
| `{{WORKFLOW_NAME}}` | `Guardião [Cliente] — Monitor 2 (Ritmo)` |
| `{{AD_ACCOUNT}}` | `act_XXX` |
| `{{META_CRED_ID}}` | ID Meta |
| `{{ANTHROPIC_CRED_ID}}` | `c4QkR1YwxtjwzYsZ` |
| `{{TELEGRAM_CRED_ID}}` | `3DUzKhPUpPLtDfOn` |
| `{{CHAT_ID}}` | `956206959` |
| `{{LANCAMENTO_FILTRO}}` | `AGV_MAI_26` |
| `{{DATA_INICIO}}` | `2026-04-17` |
| `{{DATA_FIM}}` | `2026-05-04` |
| `{{META_LEADS}}` | `8000` |
| `{{CPL_TARGET}}` | `14` |
| `{{CPL_VIAVEL}}` | `16.17` |
| `{{CRON_BRIEFING}}` | `0 6,12,16 * * *` |

### Passo 4.5 — Criar Monitor 3 (Saúde da conta)

Usar `templates/monitor3.json`. Placeholders:

| Placeholder | Substituir por |
|---|---|
| `{{WORKFLOW_NAME}}` | `Guardião [Cliente] — Monitor 3 (Saúde da Conta)` |
| `{{AD_ACCOUNT}}` | `act_XXX` |
| `{{META_CRED_ID}}` | ID Meta |
| `{{ANTHROPIC_CRED_ID}}` | `c4QkR1YwxtjwzYsZ` |
| `{{TELEGRAM_CRED_ID}}` | `3DUzKhPUpPLtDfOn` |
| `{{CHAT_ID}}` | `956206959` |

Detecta: conta desabilitada (status ≠ 1), saldo devedor > R$500 (atenção) ou > R$2.000 (crítico), e crescimento rápido de balance sem cobrança (indica falha no cartão). Roda a cada 2h. Anti-spam 6h por tipo de alerta.

### Passo 5 — Ativar workflows (se usuário confirmou)

```bash
curl -X POST -H "X-N8N-API-KEY: $API_KEY" \
  "https://n8n.valvularocket.com/api/v1/workflows/[ID]/activate"
```

Ativar os dois e confirmar via GET que `active: true`.

### Passo 6 — Notificar no Telegram

Mandar mensagem de confirmação pro Matheus:

```
🛡️ GUARDIÃO ATIVADO — [Cliente]

Monitor 1 (Anúncios) rodando a cada 30min das 8h-23h.
Monitor 2 (Briefing) rodando [horários].

Acompanhando [lançamento]. Bora.
```

### Passo 7 — Salvar doc no Obsidian

Criar/atualizar `/Users/matheusjardim/claude/obsidian/WinVision/Clientes/[Cliente]/Guardião — Sistema de Monitoramento.md` com:
- IDs dos workflows
- Credenciais usadas
- Parâmetros do cliente (lançamento, metas, CPLs)
- Data de criação
- Link pros workflows no n8n

Usar o arquivo da Fernanda como referência de estrutura: `WinVision/Clientes/Fernanda Serraglia/Guardião — Sistema de Monitoramento.md`.

## Regras importantes

1. **NUNCA criar workflow ativo diretamente** — criar desativado, testar via "Execute workflow" manual primeiro, depois ativar.
2. **Sempre perguntar antes de ativar** — ativação é deploy em produção.
3. **Se o cliente já tiver Guardião ativo**, não criar duplicata. Perguntar se é pra atualizar/substituir ou criar um segundo pra outro lançamento.
4. **Thresholds são defaults, não obrigações** — se o cliente tiver particularidades (ex: ticket baixo = CPL menor), ajustar.
5. **Monitor 2 depende de `date_preset` fixo** — o script JS calcula dias passados/restantes via `DATA_INICIO` e `DATA_FIM` hardcoded no node. Se o lançamento mudar de data, precisa editar o workflow.
6. **Horário de Brasília** — o n8n da Válvula está em UTC; verificar se cron precisa de ajuste (-3h). Se os horários estão rodando errado, é isso.
7. **Mensagem do Monitor 1 DEVE incluir `<b>Campanha:</b>`** — além do nome do anúncio, a mensagem precisa mostrar `campaign_name` (que já vem no alerta). Sem isso, Matheus não sabe de qual campanha pausar o criativo. O prompt do Claude no template já tem essa regra como obrigatória — se for editar, manter.

## Teste depois de criar

Antes de ativar, sempre testar manualmente via "Execute workflow" no n8n:

**Monitor 1:**
- Todos os 7 nodes devem ficar verdes
- Se tiver anúncio ruim de verdade na conta, mensagem chega no Telegram
- Se não tiver, o fluxo para no If "Tem Alerta?" (branch false) — isso é sucesso

**Monitor 2:**
- Todos os 6 nodes devem ficar verdes
- Mensagem com briefing chega no Telegram
- Validar se os números batem com o painel do Meta

## Troubleshooting comum

**Erro "Node 'X' hasn't been executed":** nodes em paralelo estão desconectados do node que os lê. Serializar: A → B → C em vez de (A + B) → C.

**Erro "JSON parameter needs to be valid JSON" no Claude:** o `jsonBody` tem que ser construído com `JSON.stringify({...})` envolvendo tudo, não concatenar strings.

**Erro Telegram "can't parse entities":** Claude gerou HTML inválido (`<!DOCTYPE>`, `<p>`, `<br>`). Apertar o prompt pra usar SÓ `<b>` e `<i>`.

**Credencial Anthropic "requires headerName":** passar `{"apiKey": "...", "url": "https://api.anthropic.com", "header": false}` em vez de só `{apiKey}`.

## Arquivos da skill

- `SKILL.md` — este arquivo
- `templates/monitor1.json` — template do Monitor 1 com placeholders
- `templates/monitor2.json` — template do Monitor 2 com placeholders
