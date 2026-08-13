---
name: checklist-cliente-novo
description: Dispara o checklist completo de onboarding de um cliente novo na WinVision ou L.M Agência. Cria pasta, dossiê inicial, lista de acessos pra coletar, contrato, estrutura de marca, e te lembra de cada passo até o cliente estar 100% operacional. Use quando o Matheus disser "novo cliente entrou", "fechei o [cliente]", "preciso onboardar [cliente]", "checklist do [cliente novo]", ou /checklist-cliente-novo.
---

# Skill: Checklist de Cliente Novo

Quando entra cliente novo, sempre tem ~20 coisas pra fazer pra deixar a operação rodando. Essa skill cria a estrutura completa, gera o checklist personalizado por tipo de serviço, e acompanha o progresso até estar tudo pronto.

## Quando usar

- Cliente acabou de fechar contrato
- Matheus quer estruturar a operação dele do zero
- Migrar cliente de "informal" pra estrutura padrão da agência

## Fluxo

### Passo 1 — Dados básicos (entrevista rápida)

Perguntar:
1. Nome do cliente / razão social
2. Agência: WinVision ou L.M?
3. Tipo de serviço contratado:
   - **Lançamento** (Fernanda, Caio)
   - **Estruturação comercial B2B** (Jonas, Rafaelly)
   - **Tráfego pago + criativos** (EV, Liso)
   - **Consultoria pontual / projeto único**
   - **Mix** (descrever)
4. Valor do contrato e modelo (mensal, fee + performance, único)
5. Data de início
6. Stakeholder principal do lado do cliente (nome, cargo, WhatsApp, email)

### Passo 2 — Criar estrutura de pastas

Baseado na agência e tipo de serviço, criar:

**WinVision:**
```
winvision/clientes/[slug-cliente]/
├── CLAUDE.md (dossiê inicial — chama /dossie-cliente)
├── _contexto/
│   ├── contrato.md
│   ├── acessos.md
│   └── stakeholders.md
├── conteudo/
├── ads/ (se tiver tráfego)
├── lancamentos/ (se for lançamento)
├── relatorios/
└── reunioes/
```

**L.M Agência:**
```
lm/clientes/[slug-cliente]/
├── CLAUDE.md
├── _contexto/
│   ├── contrato.md
│   ├── acessos.md
│   └── stakeholders.md
├── comercial/
│   ├── scripts/
│   ├── r1s/ (transcrições)
│   └── docs-de-guerra/
├── conteudo/
├── relatorios/
└── reunioes/
```

### Passo 3 — Gerar checklist personalizado

Salvar em `[cliente]/_contexto/onboarding-checklist.md`. Estrutura:

```markdown
# Onboarding — [Nome Cliente]

**Início:** [data]
**Tipo:** [serviço]
**Stakeholder:** [nome] ([whatsapp])

## ✅ Estrutura interna (Matheus)
- [ ] Pasta criada em [agência]/clientes/[slug]/
- [ ] CLAUDE.md preenchido (rodar /dossie-cliente)
- [ ] Contrato salvo em _contexto/contrato.md
- [ ] Cliente adicionado em _contexto/empresa.md (lista geral)
- [ ] Pasta criada no Obsidian (WinVision/Clientes/ ou LM/Clientes/)

## ✅ Acessos a coletar do cliente
- [ ] Business Manager (Meta) — adicionar como Admin
- [ ] Conta de anúncio Meta — adicionar como Admin
- [ ] Página Facebook
- [ ] Conta Instagram (login ou via Meta Business)
- [ ] Google Ads (se aplicável)
- [ ] Google Analytics / Tag Manager
- [ ] Plataforma de venda (Hotmart, Bagy, Kiwify, etc)
- [ ] CRM (Kommo, ActiveCampaign, RD, etc)
- [ ] Email marketing
- [ ] Plataforma de webinar (se aplicável)
- [ ] Domínio / hospedagem do site
- [ ] WhatsApp Business / Cloud API

## ✅ Documentação a criar
- [ ] Doc de identidade visual (logo, cores, fontes) em marca/
- [ ] Tom de voz documentado
- [ ] Persona/avatar formal
- [ ] Bíblia de produto (todos os SKUs com preço, promessa, garantia)

## ✅ Setup técnico (se aplicável ao serviço)
- [ ] Pixel Meta instalado e validado
- [ ] Eventos de conversão configurados
- [ ] UTM tags padronizadas
- [ ] Webhook entre plataforma de venda e CRM
- [ ] Dashboard de métricas (Vercel/Sheets)
- [ ] Guardião configurado (rodar /guardiao se for cliente com Meta Ads)

## ✅ Comercial / Comunicação
- [ ] Stakeholder principal adicionado ao Telegram/WhatsApp do Matheus
- [ ] Frequência de reuniões definida (semanal, quinzenal, mensal)
- [ ] Canal oficial de comunicação combinado (WhatsApp/Slack/Notion)
- [ ] Escopo do mês 1 alinhado por escrito
- [ ] Reunião de kickoff agendada

## ✅ Próximos 30 dias (entregas)
- [ ] [definir baseado no serviço contratado]
- [ ] [exemplo lançamento: cronograma do lançamento entregue até dia X]
- [ ] [exemplo tráfego: 10 criativos rodando em até 14 dias]
- [ ] [exemplo comercial: scripts adaptados em até 7 dias]

## 📅 Checkpoints
- **D+7:** primeira call de status
- **D+30:** review do mês, ajustes
```

### Passo 4 — Pré-preencher o que dá

- Marcar como ✅ os itens de "Estrutura interna" que tu já fez (pasta, CLAUDE inicial, etc)
- Pedir ao Matheus pra confirmar quais acessos ele já tem vs quais precisa pedir
- Sugerir entregas dos primeiros 30 dias baseado no tipo de serviço

### Passo 5 — Gerar mensagem pra cliente

Criar template pronto pra enviar pro stakeholder pedindo os acessos. Salvar em `[cliente]/_contexto/email-acessos.md`:

```
Olá [Nome],

Pra começarmos a operação com tudo no lugar, preciso dos seguintes acessos:

1. Business Manager Meta — adicionar [email do Matheus] como Admin (link: business.facebook.com → Configurações → Pessoas)
2. [próximo acesso]
3. ...

Pra cada um, segue o passo a passo:
[instruções rápidas]

Qualquer dúvida, me chama. Assim que tiver tudo, te aviso e iniciamos.

Abraço,
Matheus
```

### Passo 6 — Atualizar contexto geral

1. Adicionar cliente em `_contexto/empresa.md` na seção da agência correta
2. Atualizar memória persistente (project memory) com o novo cliente
3. Adicionar entrada no `tarefas.md` com lembrete do D+7

### Passo 7 — Confirmar e finalizar

Mostrar ao Matheus:
- Pasta criada com estrutura completa
- Checklist gerado em `_contexto/onboarding-checklist.md`
- Email pronto pra enviar
- O que ainda falta ele fazer pessoalmente

Perguntar:
- "Quer que eu rode `/dossie-cliente` agora pra preencher o CLAUDE.md?"
- "Quer que eu agende o D+7 e D+30 como recorrentes via /schedule?"
- "Quer que eu mande no teu Telegram daqui a 7 dias pra te lembrar de fazer a call?"

## Regras importantes

1. **Não criar contrato fictício** — só salva contrato.md como `[cole aqui o contrato]` placeholder se Matheus não passou
2. **Acessos NUNCA são salvos como texto livre no repositório** — só nome do que precisa, não senha/token
3. **Adaptar checklist ao serviço** — cliente de consultoria pontual não precisa de Pixel Meta, por exemplo
4. **D+7 e D+30 são sagrados** — sempre incluir como checkpoint, mesmo em projetos curtos
5. **Stakeholder principal sempre identificado** — se Matheus não souber, perguntar antes de continuar
6. **Conectar com outras skills** — sempre oferecer rodar `/dossie-cliente` em seguida, e `/guardiao` se for tráfego pago

## Atalhos úteis

- Após onboarding completo: rodar `/relatorio-semanal-cliente` toda segunda
- Antes de R1 com novo prospect: rodar `/pre-call`
- Pós lançamento (se aplicável): rodar `/debrief-lancamento`
