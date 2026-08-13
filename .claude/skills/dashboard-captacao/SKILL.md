---
name: dashboard-captacao
description: Adiciona um novo lançamento ao dashboard de captação de um cliente WinVision/LM (ex.: Caio, Fernanda). Recebe o ID da Planilha Mãe já configurada e cuida de: apontar workflows do n8n pra ela, ajustar filtros Meta Ads (tag + janela), adicionar tab no dashboard e fazer deploy. Use quando o Matheus disser "adiciona lançamento novo no dashboard de captação", "novo lançamento do Caio no dashboard", "atualiza o dashboard pro [lançamento]", "criar aba [lançamento]", ou /dashboard-captacao.
---

# Skill: Adicionar lançamento novo no dashboard de captação

## Quando usar
Quando o Matheus já criou a **Planilha Mãe nova** do lançamento (copiando o template, com as 8 abas: Config, Meta_Ads, Leads_TRF, Leads_ORG, Pesquisa_1, Pesquisa_2, Grupo_Wpp, Sendflow_Status) e quer plugar ela no dashboard existente.

A Planilha Mãe já deve ter:
- Aba **Config** preenchida (tag, data_inicio, data_fim, meta_leads, cpl_alvo, cpl_max, ticket, ad_account_id, sf_release_trf, sf_release_org, sheet_trf_origem, sheet_org_origem, sheet_pesq1_origem, sheet_pesq2_origem)
- Abas **Leads_TRF**, **Leads_ORG**, **Pesquisa_1**, **Pesquisa_2** com IMPORTRANGE configurado pros IDs do Config
- Abas **Meta_Ads**, **Grupo_Wpp**, **Sendflow_Status** com cabeçalhos certos (serão populadas pelo n8n)

## Inputs que precisa pedir
1. **URL ou ID da Planilha Mãe nova**
2. **Cliente** (Caio, Fernanda, etc.) — pra saber qual repo de dashboard mexer

## Repos por cliente (path absoluto)
- **Caio (Mecânico Expert)**: `winvision/clientes/prof-caio-pickcius/dashboard-captacao/`
  - Vercel project: `caio-captacao-ane26`
- **Fernanda (Vem Doleta)**: `winvision/clientes/fernanda-serraglia/dashboard/`
  - Vercel project: ver `.vercel/project.json`

## Passo a passo

### 1. Ler Config da nova Planilha Mãe
Validar tag, datas, ad_account_id. Salvar esses valores pra usar nos próximos passos.

```bash
cd <repo-dashboard>
# pull do .env do Vercel se não existir
[ ! -f .env.local ] && vercel env pull .env.local --yes
export $(grep -E "GOOGLE_SHEETS" .env.local | xargs)
curl -s "https://sheets.googleapis.com/v4/spreadsheets/<SHEET_ID>/values/Config!A1:B30?key=$GOOGLE_SHEETS_API_KEY"
```

Validar que tem: `tag`, `data_inicio`, `data_fim`, `ad_account_id`. Se faltar, parar e avisar o usuário.

### 2. Editar workflows do n8n
Os workflows do dashboard de captação ficam no n8n. Buscar:

```bash
source "/Users/matheusjardim/claude/Ratos OS/.env"
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/workflows?limit=250" \
  | python3 -c "import json,sys; [print(w['id'],'|',w['name']) for w in json.load(sys.stdin).get('data',[]) if any(k in w['name'].lower() for k in ['sendflow','dashboard captac','sync'])]"
```

Workflows do **Caio** (atualizar SEMPRE estes 2 ao trocar de lançamento):
- `kqZCI90BiBTqQmxg` — `[GERAL] - [WEBHOOK SENDFLOW MEMBROS GRUPO]` — grava em `Grupo_Wpp`
- `353gJJX7fnOqUtVG` — `[GERAL] - [DASHBOARD CAPTAÇÃO - SYNC]` — grava em `Meta_Ads` e `Sendflow_Status`, e tem o filtro Meta Ads e time_range hardcoded

**IMPORTANTE — formato do PUT no n8n**: body só aceita `name`, `nodes`, `connections`, `settings`. E em `settings`, só campos da whitelist (`executionOrder`, `saveExecutionProgress`, `saveManualExecutions`, `callerPolicy`, `errorWorkflow`, `timezone`, `saveDataErrorExecution`, `saveDataSuccessExecution`, `executionTimeout`). Qualquer outra propriedade dá 400. Ver `templates/atualizar_workflow.py`.

#### 2.1 Webhook Sendflow Membros (Grupo_Wpp)
Trocar `documentId.value` do node `Append Grupo_Wpp` pro novo SHEET_ID.

#### 2.2 Workflow SYNC (Meta_Ads + Sendflow_Status)
Trocar:
- `documentId.value` dos nodes `Write Meta_Ads` e `E4 - Write Sendflow_Status` pro novo SHEET_ID
- No node `A1 - Meta insights` (httpRequest), trocar 2 queryParameters:
  - `filtering` → `=[{"field":"campaign.name","operator":"CONTAIN","value":"<tag>"},{"field":"campaign.name","operator":"CONTAIN","value":"LEADS"}]`
  - `time_range` → `={"since":"<data_inicio>","until":"<data_fim>"}`
- Atualizar URL Meta com o `ad_account_id` se mudou: `https://graph.facebook.com/v21.0/<ad_account_id>/insights`
- Nodes `E1 - SF Release TRF` e `E2 - SF Release ORG` (httpRequest do Sendflow): trocar URL pro novo release ID se `sf_release_trf` / `sf_release_org` mudaram: `https://sendflow.pro/sendapi/releases/<id>`

Usar script `templates/atualizar_workflow.py` (anexo abaixo).

### 3. Editar `app/api/sheets/route.ts` do dashboard
Adicionar entrada no mapa `SHEETS_BY_LANCAMENTO` e atualizar `DEFAULT_LANCAMENTO`:

```ts
const SHEETS_BY_LANCAMENTO: Record<string, string> = {
  "mai-26": "1ABTvGRPwkTPqLxTjV1yxYS0yZZfcG16TOzayQC9nuhw",
  "jun-26": "1LSCgd0CurfuNyt66rxJ_xOstLnK6k4XVV8SCvvVObkM",
  "<slug-novo>": "<SHEET_ID>",
};
const DEFAULT_LANCAMENTO = "<slug-novo>";
```

Convenção de slug: `<mês-3letras>-<2dígitos-ano>` (jun-26, ago-26, set-26).

### 4. Editar `app/page.tsx` do dashboard
Adicionar entrada no array `LANCAMENTOS` (ordem: mais recente primeiro):

```ts
const LANCAMENTOS: { id: Lancamento; label: string }[] = [
  { id: "<slug-novo>", label: "<LABEL>" },  // ex: ANE AGO/26
  { id: "jun-26", label: "ANE JUN/26" },
  { id: "mai-26", label: "ANE MAI/26" },
];
```

E atualizar o tipo:
```ts
type Lancamento = "<slug-novo>" | "jun-26" | "mai-26";
```

E o default state: `useState<Lancamento>("<slug-novo>")`.
E o guard do `useEffect`: aceitar o novo slug também.

### 5. Build + deploy
```bash
cd <repo-dashboard>
npx next build 2>&1 | tail -10  # validar
vercel deploy --prod --yes 2>&1 | tail -5
```

### 6. Validar
1. Abrir o dashboard, verificar que a tab nova aparece e é o default
2. Validar que está puxando dados da Planilha Mãe nova (tag no header)
3. Esperar próximo cron do SYNC (a cada 2h no minuto 30) ou pedir pro Matheus rodar manual no n8n pra popular Meta_Ads imediatamente — **a API pública do n8n não permite execute, só a UI**

## Pegadinhas conhecidas

1. **n8n PUT body**: só `name`, `nodes`, `connections`, `settings` — e `settings` com whitelist (ver acima). Qualquer extra dá 400.
2. **Sendflow_Status** pode mostrar `name` do lançamento antigo (ex.: `ANE_MAI_26_TRF`) se o usuário não renomeou o release no Sendflow. Isso não impacta dashboard (filtro do Grupo_Wpp é por `campaignName`, não `name` do release).
3. **campaignName no Grupo_Wpp** vem do Sendflow com espaço inicial (` ANE_JUN_26_TRF`). O filtro no `route.ts` usa `.includes(tag.toUpperCase())` — case insensitive, OK.
4. **IMPORTRANGE** das abas Leads/Pesquisa: o usuário precisa autorizar manualmente na primeira vez (clique "Permitir acesso" na planilha). Se as abas Leads_TRF/ORG/Pesquisa estiverem vazias mesmo com Config preenchida, é isso.
5. **API key Google Sheets é read-only**. Pra escrever em Sheets, ou usa OAuth (chato) ou dispara via webhook n8n (Sendflow Membros já grava em Grupo_Wpp via service account).
6. **Disparar workflow manual**: a API pública do n8n não tem endpoint `/execute`. Só clicando "Execute Workflow" na UI ou esperando o cron.
7. **Schedule do SYNC**: roda a cada 2h no minuto 30 (00:30, 02:30, 04:30...). Se quiser populado já, pedir pro Matheus rodar na UI.

## Memórias relevantes (Ratos OS)
- `reference_n8n_api.md` — URL e API key do n8n
- `reference_n8n_sheets_service_account.md` — service account que precisa ser Editor da Planilha Mãe nova
- `reference_dashboard_planilha_mae.md` — headers das 7 abas, padrão replicável
- `feedback_meta_token_strategy.md` — System User token Caio em `EAANl6Lr...`
- `reference_meta_ad_accounts.md` — IDs das contas Meta dos clientes
