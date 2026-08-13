---
name: setup-lancamento-caio
description: >
  Setup completo de um lançamento novo do Prof. Caio Pickcius (Mecânico Expert):
  planilha mãe, extração Meta na VPS, webhook do grupo (Sendflow) e Manychat no n8n,
  Central (captação + lead scoring automáticos via Rota, sem deploy), agente de
  otimização e robôs. Processo executado e validado no ANE_AGO_26 (14/07/2026).
  Use quando o Matheus disser "setup do lançamento do Caio", "monta o próximo
  lançamento do Caio", "configura o ANE_[MES] / IE30_[MES]", ou /setup-lancamento-caio.
---

# /setup-lancamento-caio — Setup de Lançamento (Mecânico Expert)

Runbook completo, executado no ANE_AGO_26. Seguir na ordem. Gabarito irmão: `setup-lancamento-fernanda` (mesma VPS/infra; diferenças do Caio marcadas abaixo).

## Passo 0 — Parâmetros (confirmar antes de tudo)

- **TAG**: `ANE_[MES]_26` (linha A Nova Era / Formação Elétrica) ou `IE30_[MES]_26` (linha Injeção Expert). Perguntar qual linha.
- **Modelo**: 4 aulas + carrinho depois (ANE) OU CPL único com carrinho na hora (IE30). Muda as datas.
- **Datas**: captação (início→fim, do Config), aula/CPL, carrinho. Padrão ANE: carrinho abre no dia do CPL e fecha 7 dias depois.
- **Metas** (todas no Config da mãe): `meta_leads`, `cpl_alvo/max/ruim/bom/otimo`, `ticket`, `orcamento_rmkt`. ⚠️ **Gotcha do Caio**: orçamento de captação = `meta_leads × cpl_alvo + orcamento_rmkt` (a central calcula assim; NÃO tem `orcamento_total` como a Fernanda).
- **Planilhas do time / fontes**: leads TRF/ORG e pesquisas (Tally) — normalmente já trazem UTM. Config: `sf_release_trf/org`, `sheet_*_origem`.

## Contas e credenciais (fixo — Caio)

| O quê | Valor |
|---|---|
| Conta Meta | `act_191737889662177` (RPC GARAGE MOTORCYCLES) · token `META_TOKEN_CAIO` |
| SA Sheets (leitura+escrita) | `vps-caio-spend@sheets-n8n-432717.iam.gserviceaccount.com` · json `/root/agente/sa_caio_spend.json` na VPS |
| SA do n8n | `n8nvalvula@n8n-novo-projeto-485713.iam.gserviceaccount.com` |
| OAuth Drive (clonar/compartilhar/autorizar IMPORTRANGE) | rclone `gdrive-mjta` (⚠️ projeto do rclone NÃO tem Sheets API — só Drive) |
| VPS | ssh `vps-fernanda` (2.25.138.60) — mesma VPS da Fernanda |
| n8n | `n8n.valvularocket.com` · `N8N_API_KEY` no `.env` |
| Manychat | credential no n8n **"ManyChat — Caio (RPC)"** (`h...`); endpoints `api.manychat.com/fb/subscriber/*` |
| Rota | `ROTA_BASE_URL`/`ROTA_API_KEY` no `.env` · **cliente Caio `a768ab66-68f1-416f-8ae0-8cce3235dc0b`** |
| Central | `caio-central.vercel.app` · código `central/` |

**Gotchas do Caio (aprendidos na prática):**
- ⚠️ **Tag no NOME da campanha varia**: o IE30 usou `[IE30]` curto, os ANE usam a tag completa (`[ANE_MAI_26]_...`). SEMPRE listar as campanhas ativas na Meta e conferir o prefixo real ANTES de setar `CAPTACAO_TAG` — filtrar pela tag errada zera as métricas.
- ⚠️ **Compartilhar a mãe com as 2 SAs** (`vps-caio-spend` + `n8nvalvula`, writer) senão a extração e o webhook dão **403** na escrita. A leitura (central) funciona com "anyone reader".
- ⚠️ **Manychat = `addTagByName`** (por NOME `{TAG}_TRF`/`{TAG}_ORG`), não mais `tag_id`. A tag precisa existir no painel com a automação vinculada (o `addTagByName` cria a tag se faltar, mas sem automação).
- ⚠️ **Scoring lê por HEADER** (não por índice) — funciona pra qualquer questionário (o ANE pergunta área/scooters/dificuldade/objetivos/impede; o IE30 pergunta oficina/equipe/diagnóstico). Se as colunas mudarem, não quebra.
- Aspas complexas quebram no heredoc ssh → escrever o `.py` local e `scp`, ou usar `<<'PYEOF'`.

## Passo 1 — Planilha mãe nova

Normalmente o Matheus já cria a cópia e manda o link (nesse caso pula a clonagem). Se precisar clonar:
1. **Clonar** a mãe anterior via Drive API (token mjta): `POST drive/v3/files/{MAE_ANTERIOR}/copy` `{"name":"Planilha mae do DASHBOARD - {TAG}"}`.
2. **Compartilhar** (Drive API, `sendNotificationEmail=false`): `vps-caio-spend` (writer), `n8nvalvula` (writer). Confirmar com `permissions.list`.
3. **Config** (via SA na VPS): tag, data_inicio, data_fim, meta_leads, cpl_alvo/max/ruim/bom/otimo, ticket, ad_account_id `act_191737889662177`, orcamento_rmkt (+ sf_release_*/sheet_*_origem quando existir).

Abas (8): Config, Meta_Ads, Leads_TRF, Leads_ORG, Pesquisa_1, Pesquisa_2, Grupo_Wpp, Sendflow_Status.

## Passo 2 — Fontes de leads/pesquisa

**Pesquisa_1/2** (Tally / OBRIGADO): IMPORTRANGE das planilhas OBRIGADO funciona direto. Autorizar cada donor via API (token mjta): `POST docs.google.com/spreadsheets/d/{MAE}/externaldata/addimportrangepermissions?donorDocId={FONTE}` → `{"success":true}`. Validar lendo A1:C3 (não pode ser `#REF!`). Já vêm com UTM, PROCV não é necessário.

⚠️ **Leads_TRF/ORG — IMPORTRANGE NÃO funciona (aninhado)**: as planilhas de leads têm IMPORTRANGE interno (puxam do AC), e IMPORTRANGE de IMPORTRANGE = `#REF!` (mesmo autorizado, fonte com dados, mjta com canEdit). No ANE_SET perdi tempo aqui. **Solução: sync via VPS** (a SA lê os VALORES já resolvidos da fonte e escreve na aba Leads da mãe):
- Compartilhar as fontes de leads com a SA `vps-caio-spend` (reader, via mjta Drive API).
- `/root/agente/sync_leads_caio.py` (env `SYNC_MAE`, `SYNC_FONTE_TRF`, `SYNC_FONTE_ORG`; descobre a 1ª aba da fonte sozinho) + `run_sync_leads_caio_set.sh` + cron `5,35 * * * *` (a cada 30 min). Rodar 1x na hora e conferir a mãe (Leads_TRF/ORG com dados, não `#REF!`).

## Passo 3 — Extração Meta na VPS

`/root/agente/run_captacao_caio.sh` (env vars, sem reescrever código):
```bash
export CAPTACAO_SHEET={ID_MAE_NOVA}
export CAPTACAO_TAG={TAG_NO_NOME_DA_CAMPANHA}   # ⚠️ conferir o prefixo REAL na Meta
export CAPTACAO_ONLY_LEADS=1                     # só campanhas [LEADS]
export CAPTACAO_SINCE={data_inicio}  ;  export CAPTACAO_UNTIL={data_fim}
```
Cron: `0 */2 * * * /root/agente/run_captacao_caio.sh` (a cada 2h → aba Meta_Ads).
Motor: `captacao_dashboard.py`. **Teste de fogo**: rodar o `run` e conferir `OK Meta_Ads` (sem 403). Enquanto as campanhas não subirem, retorna 0 — normal.

Outros robôs do Caio (rotacionar tag/mãe quando ativos): `spend_dashboard.py` (vendas WT+Checklist, cron 45 */4 — usa **reescrita-de-janela**, não append), `planilha-acompanhamento-caio/` (funil 9h), `checklist_caio.py` (CPV 9h), `regras_caio.py` (orçamento+poda 23:30).

## Passo 4 — n8n (webhook do grupo + Manychat)

1. **Webhook Sendflow membros** `kqZCI90BiBTqQmxg` (node `Append Grupo_Wpp`): trocar `documentId` → mãe nova (aba Grupo_Wpp fica). GET → PUT (settings whitelisted) → reativar. Backup antes. É `[GERAL]` mas na prática é o do Caio.
2. **Obrigado TRF** `EMzOnqocCLL7gxUU` + **ORG** `XN3yINOCAaT4m6j9`: no node `ManyChat — addTagByName`, trocar **SÓ o `tag_name`** do `jsonBody` pra `{tag}_trf` / `{tag}_org` (url `.../fb/subscriber/addTagByName`). Reativar.
   - ⚠️ **NUNCA renomear o node** (deixar o nome fixo `ManyChat — addTagByName`). No ANE_SET eu botava a tag no nome do node e isso QUEBROU a connection (n8n liga nodes por nome): o `createSubscriber` apontava pro nome antigo → o `addTag` ficou desconectado → lead entrava mas não recebia tag → automação não disparava. Fluxo correto: `Webhook → Parse Body + Phone → createSubscriber → addTagByName`.
   - ⚠️ **`addTagByName` é case-sensitive** — usar o case EXATO da tag criada no painel (ex minúsculas `ane_set_26_trf`), senão cria uma tag nova sem automação.
3. **Manual do Matheus**: criar as tags `{TAG}_TRF`/`{TAG}_ORG` no painel do Manychat e ligar o gatilho da automação nelas (API não faz).

## Passo 5 — Central (captação + lead scoring, SEM deploy)

Diferente da Fernanda: o registry do Caio (`central/lib/lancamentos.ts`) faz **merge com o Rota**, então basta o Passo 6 (Rota + recurso planilha) e a Central mostra Captação + Lead Scoring sozinha (revalida ~5min). NÃO edita FALLBACK nem deploya pra lançamento novo. `slugFromCodigo`: `ANE_AGO_26` → `ago-26`.

Validar: `curl caio-central.vercel.app/api/captacao?lancamento={slug}` (tag/período certos) e `/api/scoring?lancamento={slug}` (pontuações reais, não zeradas).

**Debrief** (só pós-carrinho, ESTE precisa deploy): rodar a skill de debrief → copiar o HTML pra `central/public/debrief/{slug}.html` → adicionar `debriefHtml` no FALLBACK + entrada no map `DEBRIEFS` da página → `vercel --prod --yes` em `central/`.

## Passo 6 — Rota

- `POST /api/admin/lancamentos` `{cliente_id: a768ab66..., codigo: TAG, status:"ativo", data_carrinho_abre, data_carrinho_fecha}` — cria fases/tarefas automáticas.
- `POST /api/admin/recursos` `{lancamento_id, nome:"Planilha mãe", tipo:"planilha", url: URL_MAE}` → **isto liga a Central**.
- Lançamento anterior → `PATCH {status:"concluido"}` (⚠️ "encerrado" não existe no schema).
- ⚠️ Rota tem WAF: POST via **curl** (urllib dá 403 code 1010).

## Passo 7 — Agente de otimização

Rotacionar `clientes/caio.yaml` (`lancamento_ativo`, `meta_ads.tag`, datas, cpl, meta_leads, ticket) + `caio_prompt.md` (cabeçalho do lançamento). Depois: `systemctl restart agente-listener-caio.service`. Bot `@rota_caio_bot`, cron `30 */4`. Modo sugere-e-aprova (o executor injeta cliente/tag/conta do slug — não mexer nisso).

## Passo 8 — Meta Ads

**NÃO criar campanhas sem confirmar — o Caio sobe as dele.** Se pedir: nomenclatura `[{TAG}]_[FASE XX]_[LEADS]_...` (a tag no nome = o que a extração filtra). Config validada da conta: OUTCOME_SALES otimizando COMPLETE_REGISTRATION (pixel `1838304866670642`), CBO+Advantage+ pra escala, ABO só teste, atribuição 1d clique, público só homens. Ver `reference_caio_comportamento_conta` e `feedback_caio_defaults_subir_campanha`.

## Checklist final (fica com o Matheus)

- [ ] Compartilhar a mãe com as 2 SAs (writer)
- [ ] Criar tags `{TAG}_TRF`/`{TAG}_ORG` no Manychat + gatilho da automação
- [ ] Confirmar o prefixo REAL da tag no nome das campanhas → ajustar `CAPTACAO_TAG`
- [ ] Passar as datas de carrinho reais (ajustar no Rota se estimei)
- [ ] Subir/ativar campanhas no dia 1 da captação

## Referências
- Memórias: `project_caio_central`, `project_caio_agente_otimizacao`, `project_caio_dashboard_vendas`, `project_caio_ie30_jul26`, `feedback_estruturas_separadas_por_cliente`
- Central: caio-central.vercel.app · Rota: cliente Caio `a768ab66-...`
- Dashboards legados (vivos, não desligar sem ordem): dashboard-alpha-lake-47, caio-captacao-ane26, lead-scoring-dashboard-gamma
