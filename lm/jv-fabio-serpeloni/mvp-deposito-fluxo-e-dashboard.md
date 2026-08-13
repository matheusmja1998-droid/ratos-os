# MVP Depósito de Construção — Fluxo + Dashboard

> Contexto: nova JV Matheus + Valentino + Fábio Serpeloni (33/33/33). Primeiro MVP: depósito de construção da diretora (Londrina), porta de entrada pros 250 depósitos da rede.

---

## Fluxo do MVP — passo a passo

### Etapa 1 — Mensagem chega no WhatsApp

Cliente (mestre de obra, pedreiro, dono de obra) manda mensagem pro número comercial do depósito.

Pode ser:
- **Texto:** "manda 10 saco de cimento e 3 metro de areia média"
- **Áudio:** 40 segundos listando 8 itens
- **Foto de lista escrita à mão** (v2, não entra agora)

A Evolution API (rodando na VPS) recebe a mensagem e dispara webhook pro n8n.

Se for áudio, o Whisper transcreve pra texto antes de seguir.

---

### Etapa 2 — IA atende

O n8n carrega o histórico da conversa (Redis) e manda pro Claude com o system prompt da Sofia.

A Sofia:
- Cumprimenta se for primeira mensagem
- Identifica que é pedido
- Pergunta o que faltar (quantidade clara, especificação)

Exemplo:

> **Cliente:** "preciso de cimento"
> **Sofia:** "Bom dia! Quantos sacos você precisa? Temos CP-II 50kg e CP-IV 50kg."
> **Cliente:** "20 saco do cp2"

---

### Etapa 3 — IA faz o orçamento

Pra cada item mencionado, a Sofia chama a tool `consultar_produto`, que bate no ERP e devolve preço e estoque.

A Sofia monta a cotação organizada e manda pro cliente:

> **Sofia:**
> ```
> Segue a cotação:
>
> 📦 Itens:
> • 20 sacos cimento CP-II 50kg — R$ 35,00 cada — R$ 700,00
> • 3m³ areia média — R$ 60,00 cada — R$ 180,00
>
> Total: R$ 880,00
>
> Pra fechar, me passa:
> 1. Nome
> 2. Endereço de entrega
> 3. Forma de pagamento (pix, boleto, dinheiro, cartão)
> ```

Cliente responde:

> **Cliente:** "João Silva, Rua das Flores 123 Jardim Higienópolis, pix"

A Sofia confirma:

> **Sofia:**
> ```
> Confirmando:
>
> João Silva
> Rua das Flores 123, Jardim Higienópolis
> Pagamento: PIX
>
> 20 cimento CP-II + 3m³ areia média
> Total: R$ 880,00
>
> Pode fechar?
> ```

---

### Etapa 4 — IA gera o pedido no ERP

Cliente confirma ("pode fechar", "fecha aí", "manda ver").

A Sofia chama a tool `criar_pedido`, que bate no ERP do depósito com:
- Itens (código + quantidade + preço)
- Dados do cliente
- Endereço
- Forma de pagamento

O ERP processa e devolve:
- Número da comanda (ex: #45821)
- Prazo de entrega (calculado pelo ERP)
- Confirmação

---

### Etapa 5 — IA avisa o cliente no WhatsApp

A Sofia manda a comanda formatada pro cliente:

> **Sofia:**
> ```
> ✅ Pedido confirmado!
>
> Comanda nº 45821
>
> Itens:
> • 20 sacos cimento CP-II 50kg
> • 3m³ areia média
>
> Total: R$ 880,00
> Pagamento: PIX (chave será enviada em seguida)
> Entrega: amanhã, período da manhã
> Endereço: Rua das Flores 123, Jardim Higienópolis
>
> Qualquer coisa, é só chamar.
> ```

E em paralelo, manda notificação pro balconista no WhatsApp interno do depósito:

> ```
> 🔔 Novo pedido #45821
> Cliente: João Silva
> Total: R$ 880,00
> Entrega: amanhã manhã
> Pagamento: PIX
>
> Ver no sistema do depósito
> ```

**Fim do fluxo.** Tudo isso em menos de 5 minutos de conversa.

---

## Dashboard de Relatórios — métricas que importam

Depois do MVP rodar, monta dashboard com **3 visões**, cada uma pra um público diferente.

### Visão 1 — Diretora do depósito (a cliente)

Ela paga R$ 2.000/mês. Precisa enxergar valor pra renovar. Métricas:

**Volume e receita**
- Pedidos fechados via IA (dia, semana, mês)
- Faturamento gerado via IA (R$)
- Ticket médio dos pedidos da IA
- Comparativo: pedidos via IA vs. pedidos via balcão tradicional

**Qualidade**
- Taxa de conversão: conversas iniciadas → pedidos fechados (meta: 70%)
- Tempo médio de resposta: da mensagem do cliente até a cotação (meta: < 30s)
- Tempo médio até fechar pedido: do "oi" até a comanda gerada (meta: < 5min)
- Pedidos transferidos pra humano: quantos casos a Sofia não deu conta (quanto menor melhor)

**Comportamento do cliente**
- Top 20 produtos mais pedidos via IA
- Horários de pico de pedido (mostra que IA atende fora do expediente do balcão)
- Clientes recorrentes que voltaram a pedir
- Novos clientes que entraram pelo canal IA

**ROI direto**
- Receita IA no mês: R$ X
- Custo da assinatura: R$ 2.000
- ROI: X vezes o investimento

---

### Visão 2 — Balconista / operação (uso diário)

Pra quem trabalha com o pedido no chão. Métricas operacionais:

**Fila do dia**
- Pedidos aguardando separação (novos, ordem de chegada)
- Pedidos em separação (alguém já tá montando)
- Pedidos prontos pra entrega
- Pedidos entregues hoje

**Alertas**
- Pedido parado há mais de 2h sem ser movido de status
- Estoque baixo de produto pedido (cliente vai frustrar se pedir de novo)
- Pedido com problema (cliente reclamou, IA transferiu pra humano)

**Histórico**
- Últimas 50 conversas com filtro por cliente, valor, status
- Pedidos do cliente X (busca rápida)

---

### Visão 3 — Nós (Matheus, Valentino, Fábio) + Renan

Saúde do produto, custo, oportunidade de melhoria.

**Saúde técnica**
- Uptime da IA (% do mês respondendo)
- Uptime do ERP (quando ERP cai, IA fica cega)
- Uptime do WhatsApp (Evolution API conectada)
- Erros das últimas 24h com stack trace

**Custo**
- Gasto de Claude no mês (R$)
- Gasto de Whisper no mês (R$)
- Custo por pedido fechado (R$)
- Margem real (receita - custo operacional)

**Oportunidade**
- Produtos pedidos que NÃO estavam no catálogo (gargalo de venda)
- Conversas que não viraram pedido com motivo provável (preço, estoque, dúvida)
- Mensagens que travaram a IA (precisa calibrar prompt)
- Tempo médio de cada etapa (cumprimento, cotação, fechamento, geração)

**Crescimento**
- Curva de adoção: % do faturamento do depósito vindo da IA (mês a mês)
- Tendência de ticket médio: sobe ou cai?
- Retenção de clientes que usaram IA: voltam ou foi compra única?

---

## Stack do dashboard

| Camada | Tecnologia | Custo |
|---|---|---|
| Frontend | Lovable ou Next.js | R$ 0 (Vercel free) |
| Banco | Supabase | R$ 0-25/mês |
| Sincronização ERP → Supabase | n8n job a cada 15min | R$ 0 marginal |
| Auth | Supabase Auth | R$ 0 |

**Total adicional:** R$ 0-25/mês por depósito.

---

## Por que esse conjunto de métricas funciona

- **Diretora vê dinheiro** → renova assinatura
- **Balconista vê fila clara** → adota a ferramenta em vez de boicotar
- **Vocês veem oportunidade** → melhoram produto e fecham os próximos 249 depósitos com case real
- **Custo separado de receita** → tu sabe a margem de cada cliente, decide quando subir preço
