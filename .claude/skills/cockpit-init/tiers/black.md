# Cockpit Black — Passo a Passo da Instalação

**Duração estimada:** 7h (3 sessões: 4h + 2h + 1h ao longo de 30 dias)
**Ticket:** R$3.997
**Pré-requisitos:** Tudo do Operation + dono da agência presente em todas sessões

## Visão geral

```
═══ SESSÃO 1 — 4h ═══
[3h]   Tudo do Operation (Setup + 9 skills + Brain)
[1h]   Bloco 15 — Sessão de Estratégia Operacional

═══ ENTRE SESSÕES — 7-14 dias ═══

═══ SESSÃO 2 — 2h (7-14 dias depois) ═══
[1h]   Bloco 16 — Customização da stack pros clientes específicos da agência
[30 min] Bloco 17 — Pasta operacao/ (gestão da agência)
[30 min] Bloco 18 — Cockpit Brain Pro (SOPs + dashboards)

═══ ENTRE SESSÕES — 30 dias ═══

═══ SESSÃO 3 — 1h (30 dias depois) ═══
[1h]   Bloco 19 — Check-in 30 dias + ajustes
```

---

## ⏱️ Blocos 1-12 — Tudo do Operation (sessão 1, primeiras 3h)

> Executar `tiers/operation.md` blocos 1 a 12 (NÃO o bloco 13 e 14 — Operation faz em sessão 2 separada).

No Black, fazemos tudo do Install + Brain básico na **mesma sessão 1** + estratégia operacional.

---

## ⏱️ Bloco 15 — Sessão de Estratégia Operacional — 1h (Sessão 1)

### O que falar

> "Agora a gente sai do operacional. Vamos desenhar tua agência inteira: como cliente entra, como roda, como sai. SLA, processo, equipe, fluxo. No fim dessa hora, tu vai ter um mapa da tua agência que muita agência grande não tem."

### Passos

**1. Diagnóstico atual (15 min):**

Perguntas:
- Como cliente novo entra hoje? (lead → reunião → fechamento → onboarding → operação)
- Quanto demora cada etapa?
- Quantos clientes ativos?
- Quem faz o quê (se tem equipe)?
- Onde tá o gargalo?
- O que mais consome teu tempo hoje?

Anotar tudo em `~/Cockpit/_contexto/diagnostico-inicial.md`.

**2. Desenho do fluxo ideal (25 min):**

Usar Excalidraw (plugin Obsidian) ou desenhar em quadro branco compartilhado.

Mapear:
```
LEAD → QUALIFICAÇÃO → REUNIÃO → PROPOSTA → FECHAMENTO →
ONBOARDING → SETUP → OPERAÇÃO RECORRENTE → REPORT → REVISÃO MENSAL
```

Pra cada etapa:
- Quanto tempo deve levar (SLA)
- Quem é responsável
- Que skill do Cockpit ajuda
- O que produz (entregável)

Salvar em `~/Cockpit/operacao/fluxo-agencia.md` (também versão visual em `.excalidraw`).

**3. Customização da stack pro fluxo (20 min):**

Pra cada etapa, definir comandos e skills:

| Etapa | Skill/comando | Output |
|---|---|---|
| Qualificação | `/cockpit-qualifica` (criar) | Score do lead |
| Onboarding | `/cockpit-onboarding` | Pasta + acessos |
| Setup técnico | `/cockpit-init --tier-cliente` | Stack do cliente rodando |
| Operação | `/cockpit-meta`, `/cockpit-guardiao` | Campanhas rodando |
| Report | `/cockpit-report` (cron seg 8h) | PDF semanal |
| Revisão | `/cockpit-debrief mensal` | Análise estratégica |

**4. Salvar fluxo desenhado:**
```bash
cd ~/Cockpit
git add operacao/
git commit -m "feat: fluxo da agência desenhado (black sessão 1)"
```

---

## 🛑 Fim da Sessão 1 (4h) — Pausa de 7-14 dias

### O que falar pra fechar

> "Tu tem hoje: stack completa + Brain + fluxo desenhado da agência. Daqui 7-14 dias a gente faz a sessão 2 onde a gente customiza a stack pros teus clientes específicos e monta gestão interna da agência. Use a semana pra rodar e anotar tudo que travar."

---

## ⏱️ Bloco 16 — Customização por Cliente — 1h (Sessão 2)

### O que falar

> "Hoje vamos customizar a stack pros teus clientes específicos. Cada nicho que tu atende tem peculiaridades. A gente faz comandos próprios pra cada um."

### Passos

**1. Listar nichos atendidos:**

Pedir lista dos nichos. Tipicamente:
- Solar
- Saúde (médicos, clínicas)
- E-commerce
- Infoproduto
- Imobiliária
- Restaurante/food

**2. Pra cada nicho, criar comando customizado:**

Exemplo (nicho solar):
```
/cockpit-meta solar criar campanha [empresa]
```

A customização aprende:
- Públicos típicos do nicho
- Ofertas-padrão (ex: "Energia solar 0% entrada")
- Criativos que funcionam (testimonial, before/after de fatura)
- Métricas-meta (CPL R$30-60 no solar)
- Compliance específico (regulamentação ANEEL)

Salvar em `~/Cockpit/.claude/skills/cockpit-meta/nichos/solar.md`.

**3. Repetir pros 2-3 nichos principais.**

> "Da próxima vez que pegar cliente novo nesses nichos, é só rodar o comando customizado e ele já entra com público e criativo certos."

**4. Templates brandizados de relatório:**

Pra cada nicho: variação do template de relatório com seções específicas.
- Solar: incluir "potência instalada", "economia projetada"
- Saúde: incluir "agendamentos", "ticket médio"
- E-com: incluir "ROAS", "ticket médio"

Salvar em `marca/templates-relatorio/[nicho].md`.

**5. Commit:**
```bash
git commit -m "feat: customizações por nicho (solar, saude, ecom)"
```

---

## ⏱️ Bloco 17 — Pasta operacao/ — 30 min (Sessão 2)

### O que falar

> "Agora vamos montar a gestão interna da tua agência. Tarefas, financeiro, equipe, daily, weekly. Tudo no mesmo lugar."

### Passos

**1. Criar estrutura:**

```bash
cd ~/Cockpit/operacao
mkdir -p diarios semanais mensais financeiro equipe
touch tarefas.md financeiro/visao-geral.md equipe/membros.md
```

**2. Templates de daily/weekly/mensal:**

`templates/diario.md`:
```markdown
# {{date:YYYY-MM-DD}} — Diário

## 🎯 Foco do dia (3 prioridades)
1.
2.
3.

## 📅 Reuniões
-

## ✅ Feito
-

## 🚧 Travou
-

## 🔮 Amanhã
-

## 💡 Insight
```

`templates/semanal.md` — review da semana
`templates/mensal.md` — review estratégico

**3. Configurar Daily Notes do Obsidian:**

Settings → Daily notes:
- Folder: `operacao/diarios/`
- Template: `templates/diario.md`
- Open daily note on startup: ON

**4. Tarefas centralizadas:**

`operacao/tarefas.md` com queries Dataview que puxam tarefas de todos os arquivos:

````
```dataview
TASK
FROM "clientes" OR "operacao"
WHERE !completed
GROUP BY file.folder
```
````

**5. Financeiro:**

`operacao/financeiro/visao-geral.md` com:
- Receita por cliente (MRR)
- Custos fixos
- Margem por cliente
- Projeção 90 dias

Templates manuais ou conectar com planilha (depende do que cliente usa).

**6. Equipe (se tem):**

`operacao/equipe/[nome].md` por pessoa:
- Função
- Clientes responsáveis
- KPIs
- 1:1 mensal

---

## ⏱️ Bloco 18 — Cockpit Brain Pro — 30 min (Sessão 2)

### O que falar

> "Última coisa hoje: SOPs documentados e backup automático no GitHub privado. Tua agência vira ativo institucional. Pode contratar gente nova e ela acessa todo conhecimento. Pode vender a agência um dia. Pode delegar 100% e viajar 6 meses."

### Passos

**1. SOPs (Standard Operating Procedures):**

Criar pasta `operacao/sops/` com 1 arquivo por processo:
- `sop-prospeccao.md`
- `sop-qualificacao.md`
- `sop-reuniao-r1.md`
- `sop-reuniao-r2-fechamento.md`
- `sop-onboarding-cliente.md`
- `sop-setup-cliente.md`
- `sop-operacao-semanal.md`
- `sop-relatorio-cliente.md`
- `sop-revisao-mensal.md`
- `sop-encerramento-cliente.md`

Cada SOP tem: objetivo, responsável, input, passo a passo, output, KPIs, casos de exceção.

> "Da próxima vez que tu contratar alguém, é só passar o SOP. Ele aprende em 2h o que tu levou 2 anos pra desenvolver."

**2. Dashboards Executivos (Obsidian + Dataview):**

`dashboard-executivo.md` com queries:
- Receita do mês vs meta
- Churn (clientes que saíram)
- Pipeline (leads → qualificados → propostas → fechados)
- Margem por cliente
- Top 3 clientes em performance
- Bottom 3 clientes em risco

**3. GitHub privado pra backup automático:**

> "Vamos garantir que tua agência inteira tá versionada e segura."

Cliente cria repo privado no GitHub: `cockpit-[agencia]`

```bash
cd ~/Cockpit
git remote set-url origin https://github.com/[cliente]/cockpit-[agencia].git
git push origin main
```

**Configurar push automático:**

Criar git hook ou cron job pra commitar e dar push automático todo dia 23h:

```bash
crontab -e
# Adicionar:
0 23 * * * cd ~/Cockpit && git add . && git commit -m "auto-sync $(date +\%Y-\%m-\%d)" && git push origin main
```

> "Pronto. Toda noite, automático, tua agência sobe pra GitHub. Se teu computador queimar amanhã, tu não perde nada."

**4. Commit final sessão 2:**
```bash
git add .
git commit -m "feat: cockpit brain pro completo (black sessão 2)"
git push
```

---

## 🛑 Fim da Sessão 2 — Pausa de 30 dias

### O que falar pra fechar

> "Tu tem hoje a operação completa: stack + brain + fluxo + SOPs + gestão interna + backup automático. Em 30 dias a gente faz check-in pra ajustar o que precisar e identificar oportunidades de escala."

---

## ⏱️ Bloco 19 — Check-in 30 dias — 1h (Sessão 3)

### Passos

**1. Revisão do que foi usado (15 min):**

Perguntas:
- Quais skills tu usa todo dia?
- Quais nem encostou?
- O que travou?
- Que resultado tu tá vendo? (ex: "economizei 5h/semana", "pausei criativo morto antes que queimasse R$2k")

**2. Métricas reais (15 min):**

Se cliente topar, puxar dados:
- Quantos alertas o Watch disparou?
- Quanto tempo médio de relatório (antes vs depois)?
- ROAS médio dos clientes (antes vs depois)?
- Crescimento de cliente novo no mês?

Salvar em `operacao/metricas/2026-XX-checkin-mes.md`.

**3. Ajustes finais (15 min):**

Resolver pendências, ajustar comandos, refinar SOPs.

**4. Pitch pro White-Label (10 min):**

> "Tá rodando bem. Quer pular pro próximo nível? White-Label: a gente roda toda a infra pra ti. Tu só vê os dashboards e atende cliente. Sai R$5k/mês, mínimo 6 meses. Quem fecha esse caminho geralmente cresce 2-3x em 12 meses porque libera 100% do tempo de operação."

**5. Encerramento (5 min):**

> "Tu agora tem o pacote completo. Cockpit é teu. Comunidade VIP, suporte, atualizações — tudo no Membership Gestão R$697/mês. Qualquer dúvida, manda no canal Black."

---

## ⏱️ Hand-off Black — final da sessão 3

**1. Gerar PDF Black:**
```
/cockpit-init gerar-pdf-handoff black
```

**2. Adicionar ao canal VIP Black no Telegram.**

**3. Salvar todos os artefatos** num drive/GitHub do cliente como entrega oficial.

**4. Confirmar Membership Gestão R$697/mês ativado.**

---

## ✅ Checklist final do Black

- [ ] Tudo do Operation OK
- [ ] Sessão de estratégia operacional realizada (fluxo desenhado em Excalidraw)
- [ ] Customizações por nicho criadas (mín 2-3 nichos)
- [ ] Templates brandizados por nicho
- [ ] Pasta `operacao/` configurada com daily/weekly/mensal
- [ ] Tarefas centralizadas com Dataview
- [ ] Financeiro configurado
- [ ] Equipe documentada (se tem)
- [ ] SOPs documentados (10+ procedimentos)
- [ ] Dashboard executivo funcionando
- [ ] GitHub privado configurado
- [ ] Backup automático cron rodando
- [ ] Check-in 30 dias realizado
- [ ] Métricas reais documentadas
- [ ] PDF hand-off Black gerado
- [ ] Canal VIP Black adicionado
- [ ] Membership Gestão R$697/mês ativado
- [ ] White-Label apresentado (próximo passo)
