# IA de Atendimento pra Clínicas — Projeto

**Casa:** L.M Agência (50/50 Matheus + Valentino)
**Criado:** 08/07/2026
**Objetivo:** SaaS vertical de IA no WhatsApp pra clínicas médicas. Plugou o número, plugou as infos, tá rodando.

---

## O que o produto faz (pitch de uma frase)

Uma IA no WhatsApp da clínica que atende o paciente, agenda a consulta, confirma um dia antes, e depois da consulta pede avaliação no Google. Tudo sozinha.

## O número que vende (não é "IA que atende")

**No-show.** Clínica com consulta de R$300 que recupera 10 faltas/mês com a confirmação D-1 ganha R$3.000. O produto (R$500/mês) se paga 6x. É esse número que mostra na demo, não a tecnologia.

---

## Modelo comercial

- **Mensalidade:** R$500/clínica/mês
- **Taxa de implantação:** R$997–1.497 (paga o acompanhamento das primeiras + filtra curioso)
- **Custo marginal por clínica:** ~R$100/mês (uazapi + Claude Haiku + infra rateada)
- **Margem:** alta. 30 clínicas = ~R$15k MRR com ~R$12k de margem
- **Meta de encaixe:** pedaço relevante do gap de R$36k/mês da operação

---

## Decisões travadas (08/07/26)

| Decisão | Escolha |
|---|---|
| Agenda | **Própria no painel** + sync Google Calendar do médico. Painel é a fonte da verdade. |
| Escopo MVP | **Fluxo completo:** atende + agenda + confirma D-1 + pós-consulta com review Google |
| Casa do produto | **L.M Agência** (50/50 Valentino) |
| Plataforma WhatsApp | **uazapi** (multi-instância, API BR) |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│  PAINEL (Lovable + Supabase)  — mesmo padrão do Rota      │
│                                                           │
│  Cada CLÍNICA = 1 tenant                                  │
│   ├─ WhatsApp(s)     → 1 instância uazapi por número      │
│   ├─ Profissionais   → agenda + horários próprios         │
│   ├─ Base de conhec. → endereço, convênios, preços, FAQ   │
│   └─ Régua           → quando confirma, link do Google    │
└─────────────────────────────────────────────────────────┘
        │                        │                    │
        ▼                        ▼                    ▼
  ┌──────────┐         ┌──────────────┐      ┌──────────────┐
  │  uazapi  │◄───────►│ Backend (IA) │◄────►│   Supabase   │
  │ WhatsApp │ webhook │ Claude tools │      │  (fonte da   │
  └──────────┘         └──────────────┘      │   verdade)   │
                              │              └──────────────┘
                              ▼                      │
                       ┌─────────────┐               ▼ sync
                       │ Cron/n8n    │       ┌──────────────┐
                       │ réguas D-1  │       │Google Calendar│
                       │ pós-consulta│       │  do médico   │
                       └─────────────┘       └──────────────┘
```

### Como a conversa flui
1. Paciente manda mensagem → uazapi dispara webhook pro backend
2. Backend monta o contexto da clínica (system prompt vindo do cadastro) + histórico
3. Claude decide: responder, consultar agenda, marcar, remarcar, ou passar pra humano
4. Ação vira escrita no Supabase → sync pro Google Calendar do médico
5. Resposta volta pro paciente via uazapi

### Réguas (cron/n8n)
- **D-1 da consulta:** manda confirmação. Resposta atualiza status na agenda.
- **Não confirmou:** avisa a secretária (ou re-tenta).
- **Pós-consulta:** agradece + manda link de avaliação no Google.

---

## O que precisa de infra pra chegar no estado FINAL

### 1. Contas e credenciais (pré-requisito, sem código)
- [ ] **Conta uazapi** — plano que aguente as instâncias do piloto. Salvar `UAZAPI_URL` + `UAZAPI_TOKEN` no `.env`
- [ ] **Projeto Supabase novo** (não misturar com o do Rota). Salvar `SUPABASE_URL_CLINICAS` + `SUPABASE_SERVICE_KEY_CLINICAS`
- [ ] **ANTHROPIC_API_KEY** — já existe no `.env` ✅
- [ ] **Google Cloud project** com Calendar API + OAuth (pro sync da agenda do médico)
- [ ] **VPS ou host do backend** — pode ser a VPS que já roda os agentes (2.25.138.60) ou um projeto Vercel/Railway novo. Webhook precisa de URL pública estável.
- [ ] **Domínio** pro painel e pro webhook (ex: `atende.lmagencia.com.br` ou sslip.io no MVP)

### 2. Backend (o cérebro — precisa ser construído)
- [ ] Servidor que recebe webhook da uazapi (Node/Python na VPS ou serverless)
- [ ] Roteamento multi-tenant: identifica de qual clínica é a mensagem pelo número
- [ ] Montador de system prompt por clínica (lê o cadastro do Supabase)
- [ ] Loop de conversa com Claude + tools:
  - `consultar_disponibilidade(profissional, data)`
  - `agendar(paciente, profissional, data, hora)`
  - `remarcar` / `cancelar`
  - `passar_pra_humano` (avisa a secretária)
- [ ] Memória de conversa por paciente (tabela no Supabase)
- [ ] Modelo: **Haiku** pra 90% das conversas (custo baixo), escala pra Sonnet se precisar

### 3. Agenda + sync (precisa ser construído)
- [ ] Modelo de dados: clínicas, profissionais, horários de atendimento, consultas, pacientes
- [ ] Lógica de disponibilidade (respeita horário do profissional, duração da consulta, bloqueios)
- [ ] Sync bidirecional com Google Calendar (médico vê no celular; bloqueio manual dele volta pro painel)

### 4. Painel de cadastro (Lovable — precisa ser construído)
- [ ] Login e tenant por clínica
- [ ] Cadastro: dados da clínica, profissionais, convênios, preços, FAQ, tom de voz
- [ ] Conectar WhatsApp: QR code da uazapi dentro do painel (experiência "plugou")
- [ ] Conectar Google Calendar do médico (OAuth)
- [ ] Config da régua: horários de confirmação, link do Google Reviews
- [ ] Visão de agenda pra secretária usar como agenda oficial
- [ ] (v2) Dashboard: consultas confirmadas, no-shows evitados, reviews gerados

### 5. Réguas automáticas (cron/n8n — precisa ser construído)
- [ ] Job D-1: varre consultas de amanhã, dispara confirmação
- [ ] Handler de resposta de confirmação (atualiza status)
- [ ] Job pós-consulta: dispara pedido de review

### 6. Conformidade e robustez (não pular antes de escalar)
- [ ] **LGPD:** conversa de paciente = dado sensível de saúde. Guardar o mínimo, criptografar, ter política de retenção. Contrato com cláusula de tratamento de dados.
- [ ] Fallback: se a IA travar ou não souber, passa pra humano sem deixar o paciente no vácuo
- [ ] Monitoramento: alerta se uma instância uazapi cair (número banido = cliente furioso)
- [ ] Plano B pro WhatsApp: uazapi é não-oficial, risco de ban. Planejar migração/upsell pra Cloud API oficial quando validar.

---

## Plano de execução (chegar no estado vendável)

**Fase 0 — Infra base (1–2 dias)**
Conta uazapi, Supabase novo, Google Cloud, decidir host do backend. Sem isso nada anda.

**Fase 1 — Backend + fluxo cru (o coração)**
Webhook uazapi → Claude com tools → agenda no Supabase. Configuração de UMA clínica na mão (sem painel ainda). Objetivo: conversa real agendando de verdade.

**Fase 2 — Réguas**
Cron D-1 e pós-consulta funcionando. Agora o diferencial anti-no-show aparece.

**Fase 3 — Piloto real**
Rodar 30 dias grátis numa clínica da carteira LM. **Candidata óbvia: Clínica Comtato.** Medir: consultas confirmadas, no-shows evitados, reviews no Google. Esse é o case da demo.

**Fase 4 — Painel self-service**
Construir o cadastro no Lovable JÁ SABENDO o que precisa ser configurável (aprendido na Fase 3). É o que transforma implementação em formulário e libera a escala.

**Fase 5 — Vender com case na mão**
Chegar na clínica, mostrar o número do piloto (X no-shows evitados = R$Y recuperados) e a IA rodando ao vivo.

> **Atalho pra demo:** dá pra ter algo demonstrável já no fim da Fase 2, com uma clínica-demo fictícia configurada na mão. Não precisa do painel pronto pra impressionar — precisa do fluxo rodando num número de verdade.

---

## Pontos abertos pra decidir com o Valentino
- Divisão de quem constrói o quê (Matheus técnico? contratar dev? usar o Fábio do Vektra?)
- Esse produto conflita ou complementa o Vektra? (ambos são B2B de IA)
- Preço da implantação e política de piloto grátis
- Qual clínica entra como piloto (Comtato é a aposta)
