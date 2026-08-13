---
name: otimizacao-campanhas
description: Analisa campanhas Meta Ads de captacao do cliente e sugere otimizacoes via Telegram. Roda 1x/hora na VPS via cron, mas pode ser invocado sob demanda. Hoje cobre AGV_JUN_26 da Fernanda. Use quando o Matheus disser "/otimizacao-campanhas", "analisa a Fernanda agora", "como ta o JUN_26", "manda snapshot pro Telegram", "roda otimizacao".
---

# /otimizacao-campanhas

Skill que opera o "agente" da Fernanda. Le metricas Meta, aplica hierarquia de decisao do cliente (CPL > CPM > Connect Rate > contexto), e devolve snapshot + sugestoes no Telegram.

## Como rodar

```bash
# Pipeline completo (coleta + diagnostica + Telegram)
python3 motor/rodar.py fernanda

# So ver, sem mandar Telegram
python3 motor/rodar.py fernanda --dry

# Etapas separadas
python3 motor/coletar.py fernanda
python3 motor/diagnosticar.py fernanda
python3 motor/reportar.py fernanda
```

## Onde mora o que

- `clientes/<slug>.yaml` — regras especificas do cliente (thresholds, guardrails, compliance)
- `motor/coletar.py` — puxa Meta API, salva snapshot
- `motor/diagnosticar.py` — aplica regras, gera sugestoes
- `motor/reportar.py` — monta Opcao B e manda Telegram
- `dados/<slug>/historico/` — snapshots brutos por hora (banco de fatos)
- `dados/<slug>/diagnosticos/` — diagnosticos + sugestoes
- `dados/<slug>/aprendizado.md` — correcoes manuais do Matheus (atualizado quando ele rejeita sugestao)

## Variaveis de ambiente esperadas

Lidas do `.env` (local: `/Users/matheusjardim/claude/Ratos OS/.env` · VPS: `/root/agente/.env`):

- `META_TOKEN_FERNANDA` — token Meta da Fernanda
- `TELEGRAM_BOT_TOKEN` — bot `@rota_wv_bot`
- `TELEGRAM_CHAT_ID` — chat do Matheus (956206959)

## Fase atual

**Modo: sugerir.** Skill NUNCA executa acao na Meta sozinha. So sugere no Telegram, Matheus aprova/rejeita.

Acoes futuras (proximas fases): pausar ad/adset, subir/baixar budget, duplicar adset com novo publico.

## Aprendizado

Sempre que o Matheus rejeitar uma sugestao via Telegram, perguntar o motivo e salvar em `dados/<slug>/aprendizado.md` com data + sugestao rejeitada + motivo.

A cada 7 dias, revisar `aprendizado.md` e propor novas regras pro `.yaml` (com aprovacao explicita do Matheus antes de virar regra dura).

## Cliente atual

Fernanda Serraglia — AGV_JUN_26
- Captacao ativa em 27/05/2026
- Carrinho: 22-24/06
- Meta: 12.000 leads
- CPL alvo R$14 / teto R$20
- Connect Rate min 85%
- Hierarquia: CPL manda em tudo. Se CPL bom, ignora outras metricas.
- Guardrails: nao subir criativo novo sem o anterior ter sido aprovado; nao repetir criativo entre campanhas; compliance NZ + Meta financeiro.
