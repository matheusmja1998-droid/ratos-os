---
name: setup-lancamento-fernanda
description: >
  Setup completo de um lançamento novo da Fernanda Serraglia (Vem Doleta): planilha mãe
  com IMPORTRANGE autorizado via API, cruzamento PROCV das pesquisas, VPS (extração,
  régua, robôs, crons), n8n (Sendflow + ManyChat), dashboards (Central, captação,
  scoring), Rota e planilha de métricas. Processo validado no AGV_SET_26 (07/08/2026).
  Use quando o Matheus disser "setup do lançamento da Fernanda", "monta o próximo
  lançamento", "configura o AGV_[MES]", ou /setup-lancamento-fernanda.
---

# /setup-lancamento-fernanda — Setup de Lançamento (Vem Doleta)

Runbook completo, executado e validado no AGV_SET_26. Seguir na ordem — cada passo destrava o seguinte.

## Passo 0 — Parâmetros (confirmar antes de tudo)

Buscar na ata da reunião de alinhamento (pasta `winvision/clientes/fernanda-serraglia/reunioes/` e Obsidian). Se não houver, perguntar:

- **TAG**: `AGV_[MES]_[ANO]` (ex: AGV_SET_26)
- **Datas**: início da captação, semana de CPLs, carrinho (padrão: captação 21-30 dias antes do CPL)
- **Orçamento total** (padrão R$70k: 80% captação / 20% rmkt) e **meta de leads** (= captação ÷ CPL alvo)
- **CPL**: alvo R$10 / bom R$12 / teto R$14 · **Ticket**: usar o realizado do último lançamento
- **Planilhas do time** (pedir os 4 links): Leads TRF, Leads ORG, Pesquisa TRF, Pesquisa ORG — são criadas pela equipe da Fernanda (Fillout/checkout escrevem nelas)

## Contas e credenciais (fixo)

| O quê | Valor |
|---|---|
| Conta Meta principal | `act_362367444` · token `META_TOKEN_FERNANDA` no `.env` |
| SA (Sheets, leitura+escrita) | `vps-caio-spend@sheets-n8n-432717.iam.gserviceaccount.com` · json `/root/agente/sa_caio_spend.json` na VPS |
| SA do n8n | `n8nvalvula@n8n-novo-projeto-485713.iam.gserviceaccount.com` |
| OAuth do Drive (dono das mães) | rclone `gdrive-mjta` (matheus@mjta.com.br). Token: `rclone about gdrive-mjta:` (refresh) e `rclone config dump` |
| VPS | host ssh `vps-fernanda` (2.25.138.60) |
| n8n | `n8n.valvularocket.com` · `N8N_API_KEY` no `.env` |
| ManyChat (Atendimento 09) | `credenciais/manychat.env` |
| Rota | `ROTA_BASE_URL`/`ROTA_API_KEY` no `.env` · cliente Fernanda `c913976a-4062-410e-9e53-53a86e9543af` |

**Gotchas de infraestrutura (aprendidos na prática):**
- O projeto do rclone NÃO tem Sheets API — mjta só faz Drive API (clone, permissões, autorizar IMPORTRANGE). Toda leitura/escrita de células é via SA na VPS.
- Drive API do rclone toma rate-limit fácil (client_id compartilhado) → sempre retry com backoff de 35-40s.
- Scripts remotos com aspas complexas quebram no heredoc ssh → escrever o .py local, `scp`, executar.
- NUNCA usar IMPORTRANGE sem autorizar via API (ver Passo 2) — no AGO a mãe apodreceu em `#REF!` por permissão perdida.

## Passo 1 — Planilha mãe nova

1. **Clonar** a mãe do lançamento anterior via Drive API (token mjta):
   `POST https://www.googleapis.com/drive/v3/files/{MAE_ANTERIOR}/copy` body `{"name":"[FER] {TAG} — Planilha Mãe"}`
2. **Compartilhar** (Drive API, mjta, `sendNotificationEmail=false`): SA da VPS (writer), SA do n8n (writer), matheusmja1998@gmail.com (writer)
3. **Limpar e configurar** (via SA na VPS): clear das abas Meta_Ads/Leads_TRF/Leads_ORG/Pesquisa_1/Pesquisa_2/Grupo_Wpp/Sendflow_Status (linha 2+; Config inteira) e escrever Config novo: tag, data_inicio, data_fim, meta_leads, cpl_alvo/max/ruim/bom/otimo, ticket, ad_account_id, orcamento_total, orcamento_rmkt

Schema das abas: Config, Meta_Ads, Leads_TRF, Leads_ORG, Pesquisa_1, Pesquisa_2, Grupo_Wpp, Sendflow_Status. Headers de leads: `E-mail, Telefone, date lead, utm_source, utm_campaign, utm_medium, utm_content, utm_term` (A:H).

## Passo 2 — IMPORTRANGE na mãe (com autorização via API)

Nas abas Leads_TRF, Leads_ORG, Pesquisa_1, Pesquisa_2 da mãe (via SA, `USER_ENTERED`, célula A1, aba limpa antes):

```
=IMPORTRANGE("https://docs.google.com/spreadsheets/d/{ID_FONTE}/edit";"A:H")   ← leads
=IMPORTRANGE("https://docs.google.com/spreadsheets/d/{ID_FONTE}/edit";"A:Z")   ← pesquisas
```

**Autorizar cada donor SEM clique manual** (token mjta, que precisa ter acesso ao donor e edição no destino):

```
POST https://docs.google.com/spreadsheets/d/{MAE}/externaldata/addimportrangepermissions?donorDocId={FONTE}
Authorization: Bearer {token mjta}    → HTTP 200 = autorizado
```

Validar lendo A1:C3 de cada aba via SA (deve mostrar os headers da fonte, não `#REF!`).

## Passo 3 — Cruzamento PROCV nas planilhas de PESQUISA

As respostas de pesquisa não vêm com UTM. Em CADA planilha de pesquisa (TRF e ORG):

1. Compartilhar com a SA (writer, via mjta Drive API)
2. Criar aba `Leads_TRF` (na pesquisa de tráfego) / `Leads_ORG` (na orgânica) com IMPORTRANGE da planilha de leads correspondente (A:H) + autorizar donor (mesmo endpoint do Passo 2)
3. Na `Página1`, escrever ARRAYFORMULA de auto-preenchimento (não arrastável, atualiza sozinha) nas colunas I–Q — o layout do time já vem com esses headers:

```
I1: ={"email"; ARRAYFORMULA(SE(B2:B="";"";B2:B))}
J1..O1 e Q1: ={"<header>"; ARRAYFORMULA(SE(B2:B="";"";SEERRO(PROCV(B2:B;Leads_XXX!A:H;{col};FALSO);"")))}
   telefone=2 · utm_source=4 · utm_campaign=5 · utm_medium=6 · utm_content=7 · utm_term=8 · DATA CERTA=3
```

(B2:B = e-mail da resposta. Locale BR: separador `;`, funções PT. PROCV é case-insensitive.)

Bônus: como a mãe importa Pesquisa!A:Z, as UTMs cruzadas chegam na mãe → lead scoring por criativo funciona.

## Passo 4 — VPS (tudo por env var/sed, sem reescrever código)

```bash
# wrappers — trocar SHEET e TAG:
/root/agente/run_captacao_fernanda.sh          (CAPTACAO_SHEET, CAPTACAO_TAG)
/root/agente/run_regras_captacao_fernanda.sh   (CAPTACAO_TAG, CAP_INICIO=data_inicio)
/root/planilha-acompanhamento-fernanda/run.sh  (MAE_SHEET, CAPTACAO_TAG, META_LEADS)
# configs:
/root/agente/.claude/skills/otimizacao-campanhas/clientes/fernanda.yaml   (lancamento_ativo, tag, meta)
/root/agente/.claude/skills/otimizacao-campanhas/motor/pace_paises.py     (MAE_SHEET, TAG default agv_xxx_26)
```

**Crons** (recriar preservando os do Caio — eles somem entre lançamentos, sempre conferir):

```cron
15 */2 * * * /root/agente/run_captacao_fernanda.sh                       # extração Meta → aba Meta_Ads
20 */6 * * * /root/agente/run_regras_captacao_fernanda.sh poda           # régua (formato Caio)
40 23 * * * /root/agente/run_regras_captacao_fernanda.sh orcamento
5 9 * * * /root/planilha-acompanhamento-fernanda/run.sh                  # relatório funil Telegram
0 9 * * * /root/planilha-acompanhamento-fernanda/run_metricas.sh         # preenche Metricas vd
```

A régua é o fork do Caio (mesmo formato de feedback: saúde + "Campanhas (hoje)" + ações). `--dry` no wrapper = modo alerta (só sugere). Tirar o `--dry` religa a execução automática.

**Teste de fogo:** rodar `run_captacao_fernanda.sh` e conferir a aba Meta_Ads da mãe; rodar a régua e conferir o Telegram.

## Passo 5 — n8n

1. **Tags ManyChat novas** (conta Atendimento 09): `POST https://api.manychat.com/fb/page/createTag` → `{TAG}_TRF` e `{TAG}_ORG`. Guardar os IDs.
2. **Workflows** (GET → substituir strings → PUT): Sendflow `9BCA7hS5DaKdAbjj` (documentId → mãe nova, grava aba Grupo_Wpp) · Obrigado TRF `EgJBeHBFgbHXuEpX` · Obrigado ORG `Qkfz4oeaMqUkIKBK` (tag_id antigo → novo; nome do workflow com a tag nova). Reativar os 3.
   - GOTCHA: NÃO renomear nodes (conexão é por nome). PUT: `settings` só com chaves whitelisted.
3. **Manual do Matheus**: apontar o gatilho da automação no PAINEL do ManyChat pras tags novas (API não faz).

## Passo 6 — Dashboards

- **Central** (`central/lib/lancamentos.ts`): adicionar `{ id, label, tag, status:"ativo", planilhaMae: MAE_NOVA, scoring:"mae" }` no topo do FALLBACK; lançamento anterior → `status:"encerrado"` (+ debriefKey/criativosKey quando tiver debrief). Build + `vercel --prod`.
- **fernanda-dashboard** (`dashboard/app/api/sheets/route.ts`): `SHEETS_BY_LANCAMENTO` + `DEFAULT_LANCAMENTO`. Build + deploy.
- Validar: `curl fernanda-central.vercel.app/api/captacao?lancamento={id}` → meta certa, inscritos 0.
- Env: os projetos Vercel precisam de `GOOGLE_SA_CLIENT_EMAIL`/`GOOGLE_SA_PRIVATE_KEY` (do sa_caio_spend; key com `\n` literais).

## Passo 7 — Rota

- `POST /api/admin/lancamentos` `{cliente_id, codigo: TAG, status:"ativo", data_carrinho_abre, data_carrinho_fecha}`
- Lançamento anterior → `PATCH {status:"concluido"}` (⚠️ "encerrado" NÃO existe no schema)
- `POST /api/admin/recursos` com a URL da mãe (tipo "planilha")

## Passo 8 — Planilha de métricas (Metricas vd)

A planilha é do TIME (pedir o link). Estrutura VISÃO GERAL: A Data · B Invest TFG · C Invest API · D Cliques · E Leads TFG · F Leads API · G Leads ORG · H/I fórmulas.

1. Compartilhar com a SA (writer) — via mjta se ele tiver `canShare`
2. Robô: `/root/planilha-acompanhamento-fernanda/preencher_set.py` — atualizar `SHEET_ID` (métricas), `TAG`, `TRF_SHEET`/`ORG_SHEET` = MÃE (abas Leads_TRF/Leads_ORG). Preenche B/D/E/G de ontem+hoje às 9h, acha a linha por data (aceita dd/mm e ISO), avisa no Telegram.

## Passo 9 — Meta Ads

**NÃO criar campanhas sem confirmar com o Matheus — ele costuma subir as dele** (no SET_26 ele já tinha criado a C01 e as minhas foram excluídas). Se ele pedir:

- Nomenclatura: `[{TAG}] - [LEADS] - [ESCALA|TESTE_CRIATIVO] - [C{N}]` (régua classifica por ESCALA/TESTE no nome)
- Config validada: OUTCOME_SALES · CBO (teste R$200/dia) · adset OFFSITE_CONVERSIONS + IMPRESSIONS · pixel `667164073424190` + COMPLETE_REGISTRATION · atribuição 1d clique · 25-65, todos os gêneros · 12 países `[US,IE,IT,NL,CA,ES,CH,GB,DK,PT,FR,DE]` · advantage_audience 1 · criado PAUSADO
- Criativo: SÓ versão FEED, simples (object_story_spec + video_data), page `1036592516205101`, **`instagram_user_id` `17841435650733671`** (⚠️ `instagram_actor_id` morreu na v25), CTA LEARN_MORE, LP `https://lps.vemdoleta.com.br/inscrever-agv-trf-v2/`, url_tags padrão (`utm_term={{campaign.name}}` etc.)
- Priorizar os criativos validados do debrief anterior (candidatos com melhor ROAS)
- Manual do Matheus: DSA/"Anunciante" (Valvula Rocket Agency LTDA) em cada ad novo

## Checklist final (o que fica com o Matheus)

- [ ] Gatilho ManyChat no painel → tags novas
- [ ] Ativar campanhas no dia 1 da captação + orçamento
- [ ] DSA manual nos ads
- [ ] Criativos novos da editora na fila
- [ ] Régua: decidir alerta (`--dry`) ou execução automática

## Referências

- Debrief e histórico: `winvision/clientes/fernanda-serraglia/lancamentos/`
- Dashboards: fernanda-central.vercel.app (board geral) · /debrief · fernanda-criativos.vercel.app
- Compliance NZ: toda copy nova passa pelos critérios do CLAUDE.md do cliente
