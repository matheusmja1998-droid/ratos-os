# Prompt pra Lovable — Adicionar `watchers_padrao` em templates e recorrentes

Cola na conversa da Lovable do projeto Rota (rota-flow-75):

---

Quero adicionar suporte a múltiplos responsáveis padrão nos templates de tarefa, pra quando o sistema materializar tarefas em um novo lançamento, ele já preencha tanto o responsável principal quanto os watchers automaticamente.

## 1. Mudança no schema

Adicionar coluna `watchers_padrao` (array de UUIDs de users) em duas tabelas:

```sql
alter table templates_tarefa
  add column watchers_padrao uuid[] default '{}';

alter table tarefas_recorrentes
  add column watchers_padrao uuid[] default '{}';
```

## 2. Mudança na lógica de materialização

Quando o cron/sistema cria uma `tarefa` a partir de um `template_tarefa` (ao criar lançamento novo) ou de uma `tarefas_recorrente` (cron diário):

- Hoje provavelmente já copia `responsavel_padrao_id` → `responsavel_id`
- Adicionar: copiar `watchers_padrao` → `watchers`

## 3. Mudança nos endpoints da API admin

- `POST /api/admin/templates-tarefa` e `PATCH /api/admin/templates-tarefa/:id` — aceitar campo `watchers_padrao` (array de UUIDs) no body
- `POST /api/admin/tarefas-recorrentes` e `PATCH /api/admin/tarefas-recorrentes/:id` — aceitar `watchers_padrao`
- `GET` desses endpoints — retornar o campo

Validação: array de UUIDs válidos de users existentes. Se vazio, ok (`'{}'`).

## 4. UI

Na tela admin onde edita template/recorrente, adicionar campo multi-select de users como "Watchers padrão" (além do "Responsável padrão" que já existe).

---

Confirma que vai implementar tudo isso e me mostra o diff.
