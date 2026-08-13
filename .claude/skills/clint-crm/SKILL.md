---
name: clint-crm
description: Opera o CRM Clint via API REST oficial (https://api.clint.digital/v1). Lê e escreve contatos, deals (oportunidades), organizações, tags, origens, grupos, status de perda, usuários, dashboards, mensagens e canais. Cria automações, gera relatórios de funil e análises de pipeline. Use quando o usuário disser "Clint", "CRM do Caio", "leads do Clint", "deals", "oportunidades do CRM", "pipeline do Caio", "relatório do CRM", "criar contato no Clint", "mover etapa", "tags do Clint", ou /clint.
---

# Clint CRM — Skill

Skill pra operar o CRM Clint via API oficial. Atualmente configurada pra conta do **Caio Pickcius (WinVision)**.

## Configuração

- **Base URL:** `https://api.clint.digital/v1` (env: `CLINT_API_BASE`)
- **Auth header:** `api-token: <key>`
- **Key Caio:** env `CLINT_API_KEY_CAIO` (em `/Users/matheusjardim/claude/Ratos OS/.env`)
- **Plano:** Elite (única que dá acesso à API)

Pra carregar a env num shell:
```bash
set -a; source "/Users/matheusjardim/claude/Ratos OS/.env"; set +a
```

## Endpoints principais

### Contatos
- `GET /v1/contacts` — lista (paginado, suporta filtros)
- `POST /v1/contacts` — cria
- `GET /v1/contacts/{id}` — detalhe
- `POST /v1/contacts/{id}` — atualiza
- `DELETE /v1/contacts/{id}` — remove
- `POST /v1/contacts/{id}/tags` — adiciona tags
- `DELETE /v1/contacts/{id}/tags` — remove tag
- `GET /v1/contacts/{id}/attachments` — anexos

### Deals (oportunidades)
- `GET /v1/deals`, `POST /v1/deals`
- `GET /v1/deals/{id}`, `POST /v1/deals/{id}`, `DELETE /v1/deals/{id}`

### Outros grupos
Organizations, Groups, Lost Status, Origins, Tags, Users, Channel Accounts, Message Templates, Chats, Messages, Dashboards, Account, Custom Fields.

Doc completa: https://clint-api.readme.io/reference/get_v1-contacts

## Limitações da API

- Não suporta **Activities** (tarefas/compromissos) — só pela interface
- Não envia mensagens via WhatsApp/Instagram/email pela API pública (só via Channel Accounts em beta)

## Padrão de uso (curl)

```bash
# Listar contatos
curl -s -H "api-token: $CLINT_API_KEY_CAIO" \
  "$CLINT_API_BASE/contacts?limit=20&page=1"

# Buscar contato por email
curl -s -H "api-token: $CLINT_API_KEY_CAIO" \
  "$CLINT_API_BASE/contacts?email=fulano@x.com"

# Criar contato
curl -s -X POST -H "api-token: $CLINT_API_KEY_CAIO" \
  -H "Content-Type: application/json" \
  -d '{"name":"Fulano","email":"x@y.com","ddi":"55","phone":"47999999999"}' \
  "$CLINT_API_BASE/contacts"

# Listar deals
curl -s -H "api-token: $CLINT_API_KEY_CAIO" \
  "$CLINT_API_BASE/deals?limit=20"

# Listar tags
curl -s -H "api-token: $CLINT_API_KEY_CAIO" "$CLINT_API_BASE/tags"
```

## Resposta padrão (paginação)

```json
{
  "status": 200,
  "totalCount": 30700,
  "page": 1,
  "totalPages": 30700,
  "hasNext": true,
  "hasPrevious": false,
  "data": [ ... ]
}
```

## Fluxo recomendado

1. Antes de qualquer operação destrutiva (DELETE, atualização em massa), sempre listar primeiro e confirmar com o Matheus.
2. Pra relatórios, paginar com `limit=200` (max comum) e iterar.
3. Pra cruzar com Meta Ads / dashboards do Caio, usar tags como ponte (tags por lançamento já existem: `BLACK INFINITY 2025`, `ane_28`, etc).
4. Pra automações recorrentes, considerar mover pro n8n (workflow tagueado com `caio` + tipo).

## Multi-cliente (futuro)

Estrutura preparada pra adicionar outros clientes depois:
- `CLINT_API_KEY_CAIO` — Caio (WinVision) ✅ ativa
- `CLINT_API_KEY_<CLIENTE>` — adicionar conforme necessário

Sempre perguntar **qual conta** se houver mais de uma configurada.
