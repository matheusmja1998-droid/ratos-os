# Skill: Kommo CRM

Integração com os CRMs Kommo do Matheus Jardim. Há **duas contas** configuradas:

## Contas

| Conta | Quando usar | Subdomínio | Token (.env) | Account ID |
|---|---|---|---|---|
| **WinVision** (Matheus Jardim) | CRM próprio das agências, leads internos, comercial WinVision/LM | `new1732871976` | `.env` | 33866015 |
| **Jonas / Hipertech** (JFD Solar) | Cliente LM — análise comercial do funil solar do Jonas | `jfdsolar` | `.env.jonas` | 36046395 |

**Regra de roteamento:** se o pedido mencionar "Jonas", "JFD", "Hipertech", "solar" ou "cliente" → usar conta do Jonas. Caso contrário, usar WinVision. Se houver ambiguidade, **perguntar antes** qual CRM consultar.

## Como usar

Definir as variáveis no início conforme a conta:

```bash
# WinVision
TOKEN=$(cat "/Users/matheusjardim/claude/Ratos OS/.claude/skills/kommo-crm/.env")
BASE="https://new1732871976.kommo.com/api/v4"

# Jonas / JFD Solar
TOKEN=$(cat "/Users/matheusjardim/claude/Ratos OS/.claude/skills/kommo-crm/.env.jonas")
BASE="https://jfdsolar.kommo.com/api/v4"
```

## Endpoints principais

### Leads
```bash
# Listar leads (com filtros opcionais)
curl -H "Authorization: Bearer $TOKEN" "$BASE/leads?limit=50&page=1"

# Leads por pipeline
curl -H "Authorization: Bearer $TOKEN" "$BASE/leads?filter[pipeline_id]=PIPELINE_ID"

# Leads por status/etapa
curl -H "Authorization: Bearer $TOKEN" "$BASE/leads?filter[status_id]=STATUS_ID"

# Criar lead
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$BASE/leads" -d '[{"name":"Nome do Lead","price":0,"pipeline_id":ID,"status_id":ID}]'

# Atualizar lead
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$BASE/leads/LEAD_ID" -d '{"price":5000,"status_id":ID}'
```

### Contatos
```bash
# Listar contatos
curl -H "Authorization: Bearer $TOKEN" "$BASE/contacts?limit=50"

# Criar contato
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$BASE/contacts" -d '[{"name":"Nome","custom_fields_values":[{"field_code":"PHONE","values":[{"value":"11999999999"}]}]}]'
```

### Pipelines e etapas
```bash
# Listar pipelines e etapas
curl -H "Authorization: Bearer $TOKEN" "$BASE/leads/pipelines"
```

### Tarefas
```bash
# Criar tarefa
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$BASE/tasks" -d '[{"task_type_id":1,"text":"Descrição","complete_till":TIMESTAMP_UNIX,"entity_id":LEAD_ID,"entity_type":"leads"}]'
```

### Notas
```bash
# Adicionar nota a um lead
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$BASE/leads/LEAD_ID/notes" -d '[{"note_type":"common","params":{"text":"Texto da nota"}}]'
```

## Análises que consigo fazer

Quando pedir análise, puxar os dados via API e processar com Python/jq:

- **Funil de conversão** — quantos leads em cada etapa, % de avanço
- **Leads parados** — sem movimentação há X dias
- **Ticket médio** — média de valor dos negócios por etapa
- **Performance por responsável** — quantos leads cada usuário tem e em qual etapa
- **Projeção de receita** — soma dos valores no pipeline por probabilidade
- **Tempo de ciclo** — média de dias do primeiro contato até fechamento

## Fluxo padrão

1. Puxar pipelines pra descobrir os IDs (`/leads/pipelines`)
2. Puxar leads com filtros relevantes
3. Processar os dados com Python inline
4. Apresentar análise em formato limpo, sem jargão técnico

## Observações

- Paginação: usar `?limit=250&page=N` pra puxar volumes grandes
- Datas: Kommo usa timestamps Unix
- Campos customizados: acessar via `custom_fields_values` no retorno do lead
