# Vektra — Checklist Reunião com o Mário

> Contexto: primeiro MVP da Vektra (JV Matheus + Valentino + Fábio, 33/33/33). Mario Assistant — IA pessoal do Mário (irmão do Fábio, dono de distribuidora dental em Londrina), entrega em 13 dias antes da viagem dele pra China.

---

## 🔐 BLOCO 1 — Acessos técnicos (obrigatório pro dia 1)

### ERP / Sistema de gestão
- [ ] **URL base da API** (ex: `https://api.sistemax.com.br/v1`)
- [ ] **Token de autenticação** ou credenciais OAuth
- [ ] **Documentação dos endpoints** (link ou PDF)
- [ ] **Contato técnico do ERP** (nome + WhatsApp/email do suporte)
- [ ] **Confirmação dos endpoints disponíveis:**
  - GET vendas (por período, por vendedor, por cliente)
  - GET estoque (por produto, com nível mínimo)
  - GET clientes (lista + histórico)
  - GET pedidos (por status)
  - GET funcionários/usuários do sistema
  - GET tarefas/atividades (se o ERP tiver módulo de CRM)
- [ ] **Limite de requisições por minuto** (rate limit) da API
- [ ] **Webhooks disponíveis?** (pra alertas em tempo real sem precisar ficar consultando)
- [ ] **Ambiente de homologação/sandbox** existe? (pra testar sem mexer no real)

### WhatsApp do Mário
- [ ] **Número do WhatsApp pessoal/comercial do Mário** (o que ele usa pra trabalhar)
- [ ] **Confirmação que ele aceita conectar via WhatsApp Web** (Evolution API)
- [ ] **Celular ficar online no mínimo 12h/dia** (pra Evolution manter sessão)
- [ ] Se preferir API oficial (Cloud API): acesso à Business Manager dele

### WhatsApp dos funcionários (pra cobrança automática)
- [ ] **Números dos vendedores** (nome + número)
- [ ] **Números do financeiro, logística, compras**
- [ ] **Autorização do Mário pra Vektra mandar mensagens automatizadas pros funcionários** (alinhamento prévio com a equipe, senão vira problema interno)

---

## 📋 BLOCO 2 — Informações de negócio (essencial pra calibrar a IA)

### Sobre a empresa
- [ ] **Nome fantasia e razão social** da distribuidora
- [ ] **CNPJ** (pra documentar contrato)
- [ ] **Quantos funcionários** e em quais setores
- [ ] **Faturamento médio mensal** (pra calibrar o que é "pedido grande" — alerta)
- [ ] **Horário de operação** (8h-18h? Tem turno?)

### Sobre os vendedores
- [ ] **Lista completa:** nome, cargo, setor, telefone, hora de início e fim
- [ ] **Vendedores são comissionados?** (qual o % por venda)
- [ ] **Têm meta individual mensal?** (pra IA reportar % batido)
- [ ] **Qual o protocolo de follow-up?** (após quantos dias sem contato cobra cliente?)
- [ ] **Quais tarefas o vendedor faz no dia?** (visita, cotação, follow-up, fechamento, pós-venda)

### Sobre os clientes (protéticos)
- [ ] **Top 20 clientes VIP** (nome, CNPJ no ERP, vendedor responsável)
- [ ] **Critério de "VIP":** faturamento? frequência? margem? quem decide?
- [ ] **Frequência média de compra de cliente normal vs. VIP** (pra saber quando alertar "cliente sumiu")
- [ ] **Aniversário de cliente é importante?** (Mario Baby vai usar isso depois)
- [ ] **Quanto que o Mário libera de verba/voucher pra cliente top?** (R$ 500 que ele mencionou)

### Sobre o estoque
- [ ] **Quantos SKUs ativos** ele tem (10 mil? 5 mil?)
- [ ] **Categorias principais:** resinas, brackets, brocas, instrumental, próteses prontas, etc
- [ ] **Estoque mínimo está configurado no ERP por produto?** Ou Mário define caso a caso?
- [ ] **Quais produtos são curva A** (mais críticos pra alertar)
- [ ] **Tempo de reposição médio** (3 dias? 15 dias? importa pra alerta "produto vai acabar")
- [ ] **Quem cuida de compras?** (pra IA notificar essa pessoa quando estoque cair)

### Sobre o controle que o Mário quer
- [ ] **O que o Mário olha hoje todo dia de manhã, manualmente?** (replicar no relatório)
- [ ] **O que ele gostaria de saber mas não sabe?** (o que dói)
- [ ] **Em quais horários ele quer relatórios?** (só 8h? ou também 18h fechando o dia?)
- [ ] **Ele quer alertas no fim de semana?** (sábado o depósito vende?)
- [ ] **Quais decisões ele toma sozinho** vs **delega**? (pra IA saber quando avisar e quando cobrar)

### Sobre cobrança automática
- [ ] **Quais tarefas o Mário quer cobrar automaticamente?**
  - Follow-up atrasado?
  - Pedido parado em separação?
  - Boleto não cobrado?
  - Visita não agendada?
- [ ] **Quantos dias atrasada = atrasada?** (ele define o gatilho)
- [ ] **O tom da cobrança:** firme, amigável, formal?
- [ ] **A IA cobra automaticamente** ou **avisa Mário e ele autoriza?** (sugerimos a segunda no MVP)

### Sobre a viagem
- [ ] **Data exata de saída pra China**
- [ ] **Quantos dias fora**
- [ ] **Conseguirá ler WhatsApp na China?** (precisa VPN — confirmar logística)
- [ ] **Quem é o "segundo no comando" enquanto ele viaja?** (esposa Márcia? gerente?)
- [ ] **Em que situação a IA deve escalar pra esse segundo em vez de pro Mário?**

---

## 🎨 BLOCO 3 — Identidade e personalização

### Nome da IA
- [ ] **Mário tem preferência de nome?** (sugerimos: "Mara", "Bruno", "Aline" — ou nome neutro tipo "Vektra")
- [ ] **Gênero da IA:** feminino, masculino, neutro?
- [ ] **Tom de voz:** "você" ou "tu"? Formal ou informal?

### Estética dos relatórios
- [ ] **Mário gosta de emoji?** (alguns donos amam, outros odeiam)
- [ ] **Prefere relatório curto e seco ou detalhado?**
- [ ] **Quer ver número absoluto ou comparativo (% vs mês passado)?**
- [ ] **Quer ver gráfico (imagem) ou só texto?** (PDF anexo? print?)

---

## 📅 BLOCO 4 — Logística da reunião com o Mário

### Antes da reunião (Fábio prepara)
- [ ] **Fábio liga pro Mário** e pede 1h focada
- [ ] **Pede pro Mário ter em mãos:** credencial do ERP, lista de funcionários, top clientes
- [ ] **Fábio explica em 2 frases** o que é Vektra e o que o Mario Assistant resolve

### Durante a reunião (vocês conduzem)
- [ ] **Apresentação Vektra:** 5 minutos (Fábio fala que é sócio, vocês são os técnicos)
- [ ] **Demo conceitual:** mostrar mock do relatório das 8h e da conversa sob demanda
- [ ] **Discovery:** rodar a checklist desse documento
- [ ] **Combinado:** entrega em 13 dias, antes da viagem
- [ ] **Próximos passos:** Mário manda credencial ERP em 24h, vocês começam dia seguinte

### Depois da reunião
- [ ] **Termo de intenção** (1 página) por WhatsApp confirmando o acordo
- [ ] **Grupo no WhatsApp:** Mário + Fábio + Matheus + Valentino + Renan pra updates diários

---

## 🚨 BLOCO 5 — Cláusulas críticas (não esqueça)

- [ ] **Confidencialidade:** Vektra acessa dados de venda, cliente, financeiro do Mário. Precisa NDA simples
- [ ] **LGPD:** dados de cliente vão passar pela IA. Documentar tratamento
- [ ] **Propriedade do código:** o Mario Assistant é da Vektra, não do Mário. Ele assina o uso, não a tecnologia (importante pra poder replicar pra outros clientes depois)
- [ ] **Limite de uso:** quantas perguntas por dia? (sugiro deixar ilimitado no MVP pra ele se viciar)
- [ ] **Saída:** se Mário cancelar, dado dele é deletado em 30 dias

---

## Resumo executivo do que tu precisa sair da reunião com

**Mínimo viável pra começar a desenvolver no dia seguinte:**

1. Credencial API do ERP
2. WhatsApp do Mário confirmado
3. Lista de 5 funcionários principais com WhatsApp
4. 10 clientes VIP listados
5. Resposta a: "o que tu mais quer saber todo dia de manhã sem ter que perguntar pra ninguém?"

Sem esses 5, o desenvolvimento não começa. Com esses 5, dia 2 já tem código rodando.
