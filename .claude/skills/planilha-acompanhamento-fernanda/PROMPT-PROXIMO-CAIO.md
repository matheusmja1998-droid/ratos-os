# Ligar o robô da planilha de acompanhamento do CAIO (próximo lançamento)

> A estrutura JÁ ESTÁ pronta e na VPS, desligada (sem cron). Falta só preencher
> 4 campos (tag + 3 IDs) e ligar o cron. Cola o bloco abaixo pra mim quando o
> próximo lançamento do Caio começar a captar.

## O que já está pronto (feito em 10/06/2026)
- `preencher.py` do Caio na VPS: `/root/planilha-acompanhamento-caio/preencher.py`
  (cópia da Fernanda, só constantes trocadas; cópia local em
  `.claude/skills/planilha-acompanhamento-fernanda/preencher_caio.py`)
- `run.sh` na VPS: `/root/planilha-acompanhamento-caio/run.sh` (log em `/root/agente/logs/planilha_caio.log`)
- Validado: SA `sa_caio_spend.json` autentica no Sheets, `META_TOKEN_CAIO` e bot
  `@rota_caio_bot` (`TELEGRAM_BOT_TOKEN_ROTA_CAIO` + `TELEGRAM_CHAT_ID_MATHEUS`) carregam e enviam.
- ad_account já fixo: `act_191737889662177`.
- Trava de segurança: enquanto houver `__PREENCHER__` no script, ele aborta (exit 2) sem escrever nada.
- Cron NÃO criado ainda (é o último passo, depois de validar).

## Faltam só estes 4 valores (do próximo lançamento)
- `SHEET_ID` — ID da planilha de acompanhamento (aba "VISÃO GERAL")
- `TAG` — nome das campanhas de captação na Meta (ex: `ANE_AGO_26`)
- `TRF_SHEET` — ID da planilha LEADS-TRF
- `ORG_SHEET` — ID da planilha LEADS-ORG

---

Cola pra mim:

Liga o robô da planilha de acompanhamento do Caio (estrutura já tá na VPS em
`/root/planilha-acompanhamento-caio/`, é só preencher e validar). Dados do lançamento novo:
- Planilha de acompanhamento (VISÃO GERAL): 👉 `COLE_O_ID`
- Tag das campanhas de captação: 👉 `ANE_XXX_26`
- Planilha LEADS-TRF: 👉 `COLE_O_ID_TRF`
- Planilha LEADS-ORG: 👉 `COLE_O_ID_ORG`

Faça nesta ordem e me mostre cada passo:
1. Edita os 4 `__PREENCHER__` no `preencher.py` da VPS (e na cópia local). Confirma o
   título das planilhas TRF/ORG e qual coluna tem a data lendo o header — ajusta
   `LEADS_DATE_COL`/`LEADS_TAB` se não for `C`/`Página1`.
2. LÊ a planilha de acompanhamento e confirma o layout (B/D/E/G + fórmulas H:N +
   coluna A datada `dd/mm - dia.`). Se mudou, me mostra o mapa antes de seguir.
3. Valida contra um dia já preenchido na mão: invest + `inline_link_clicks` (NUNCA
   `clicks` totais) + leads TRF/ORG têm que bater.
4. Acha a linha por busca de texto `dd/mm` na coluna A (nunca offset). Roda `date` na VPS antes.
5. Roda 1x escrevendo de verdade ontem+hoje + arrasta fórmulas + me avisa no Telegram do Caio.
6. Só então cria o cron `0 8 * * * /root/planilha-acompanhamento-caio/run.sh # planilha-acompanhamento Caio 8h`,
   preservando os crons existentes.
7. Atualiza a memória `project_caio_planilha_acompanhamento_8h` com o lançamento ativo.
