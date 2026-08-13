# Prompt pra Lovable — Dedup semântico em `/api/processar-reuniao`

Cola na conversa da Lovable do projeto Rota (rota-flow-75):

---

Quero ajustar a função `/api/processar-reuniao` pra evitar criar tarefas duplicadas. Hoje quando eu colo as tarefas combinadas na reunião, o sistema cria todas, mesmo que várias já existam no lançamento pra hoje (recorrentes diárias materializadas, one-shots do dia, etc.).

A regra nova:

**1. Antes de criar qualquer tarefa nova:**
- Buscar todas as tarefas existentes do lançamento (`cliente_id` + `lancamento_id`) com `prazo` na janela de "hoje" (00:00 → 23:59 do dia em que a reunião está acontecendo) e status diferente de `cancelado`/`concluido`.

**2. Pra cada item que veio do input da reunião:**
- Usar Claude (via Anthropic SDK que vocês já têm conectado) pra comparar **semanticamente** o título do item com cada uma das tarefas existentes do dia.
- Critério: se descrevem a mesma ação no mesmo escopo, é match. Exemplos:
  - "otimizar tráfego" ≈ "otimizar campanhas" → MATCH
  - "responder grupo" ≈ "responder mensagens no grupo do cliente" → MATCH
  - "criar PL email" ≠ "criar PPL email" → NÃO MATCH (são fases diferentes)
  - "subir campanha de vendas" ≠ "otimizar campanhas" → NÃO MATCH

**3. Decisão:**
- **Se NÃO tem match:** criar a tarefa nova normalmente, com `reuniao_id` setado.
- **Se TEM match:** NÃO criar tarefa nova. Em vez disso:
  - Pegar a tarefa existente
  - Acrescentar no `descricao_md` dela uma linha: `\n\n**Discutida em reunião de DD/MM/YYYY**` (data da reunião, formato brasileiro)
  - Manter o resto da tarefa intacto (não mexer em prazo, responsável, status, watchers, etc.)

**4. Resposta do endpoint:**
Devolver JSON com 3 listas pra debug:
```json
{
  "criadas": [{"id": "...", "titulo": "..."}],
  "linkadas_existentes": [{"id": "...", "titulo": "...", "match_com_input": "..."}],
  "total_input": N
}
```

**5. Prompt do Claude pra comparação semântica:**

Use algo como:
```
Você é um classificador. Vou te dar uma tarefa que o usuário acabou de mencionar numa reunião e uma lista de tarefas já existentes no sistema pra hoje. Diga se alguma das existentes descreve essencialmente a mesma ação (mesmo verbo + mesmo objeto + mesma fase do lançamento), ou se a nova é genuinamente diferente.

TAREFA NOVA: "{titulo_input}"

TAREFAS EXISTENTES HOJE:
{lista numerada com id + titulo + categoria}

Responda APENAS com JSON:
{"match": true/false, "match_id": "<uuid ou null>", "razao": "<explicação curta>"}
```

Use `claude-haiku-4-5` ou `claude-sonnet-4-6` — é classificação simples, não precisa de modelo grande.

---

## O que mudar no schema (se necessário)

Provavelmente não precisa alterar nada no DB — `tarefas.descricao_md` e `tarefas.reuniao_id` já existem.

Confirma que vai funcionar e me mostra o diff dos arquivos que vão mudar.
