# Cockpit Operation — Passo a Passo da Instalação

**Duração estimada:** 4h (2 sessões: 3h + 1h depois de 7 dias)
**Ticket:** R$1.997
**Pré-requisitos:** Tudo do Install + Obsidian instalado + 1 cliente real escolhido pra ser exemplo

> Se o cliente já fez Install antes, pular pro Bloco 11.

## Visão geral

```
═══ SESSÃO 1 — 3h ═══
[2h30] Tudo do Install (Setup + 9 skills)
[15 min] Bloco 11 — Configurar Obsidian Brain
[15 min] Bloco 12 — Templates Brain populados

═══ ENTRE SESSÕES — 1 SEMANA ═══
Cliente usa a stack no dia a dia.

═══ SESSÃO 2 — 1h (7 dias depois) ═══
[40 min] Bloco 13 — Cliente real configurado AO VIVO (todas skills)
[20 min] Bloco 14 — Refinamento + ajustes
```

---

## ⏱️ Blocos 1-10 — Tudo do Install

> Executar `tiers/install.md` do início ao fim.
>
> Pular o hand-off do Install — vamos fazer hand-off do Operation no fim.

---

## ⏱️ Bloco 11 — Configurar Obsidian Brain — 15 min

### O que falar

> "Agora vem o diferencial do Operation: Cockpit Brain. A pasta `~/Cockpit/` que tu tem hoje vira teu segundo cérebro. Cada cliente vira nota linkada. Briefing nunca mais perde. Decisão estratégica fica registrada. Tu pode contratar gente nova e ela acessa todo conhecimento."

### Passos

**1. Pedir cliente abrir [obsidian.md](https://obsidian.md)** e baixar (se não tem).

**2. Abrir Obsidian → "Open folder as vault" → selecionar `~/Cockpit/`**

**3. Configurações iniciais:**
- Files & Links → Default location for new attachments: "In subfolder under current folder" (`anexos`)
- Editor → Show frontmatter: ON
- Appearance → Tema: Things 2 (recomendação)

**4. Instalar plugins essenciais:**

Settings → Community Plugins → Browse:
- **Dataview** (pra dashboards e queries)
- **Templater** (pra templates dinâmicos)
- **Calendar** (pra daily notes)
- **Tag Wrangler** (gestão de tags)
- **Excalidraw** (pra desenhos de fluxo)

Ativar todos.

**5. Configurar pastas-padrão:**
- Settings → Templater → Template folder: `templates/`
- Settings → Daily notes → Folder: `operacao/diarios/` (se Black, senão skip)
- Settings → Daily notes → Template: `templates/diario.md`

**6. Validar navegação:**
- Abrir `clientes/cliente-1/CLAUDE.md`
- Confirmar que linka pro `dossie.md`
- Confirmar que cada arquivo tem visualização correta

---

## ⏱️ Bloco 12 — Templates Brain Populados — 15 min

### O que falar

> "Agora vou popular os templates pra tua agência. Tudo padronizado. Cliente novo cai nesse formato."

### Passos

**1. Criar templates expandidos:**

A skill `cockpit-init` copia da pasta `templates/` os arquivos:
- `dossie-modelo.md` → expandido com todas seções (posicionamento, ICP, oferta, histórico, concorrentes, pontos críticos)
- `briefing-modelo.md` → com perguntas-guia (objetivo, KPI, prazo, orçamento, criativos disponíveis, audiências, exclusões)
- `relatorio-modelo.md` → com seções padrão (resumo executivo, números, criativos top, recomendações)
- `reuniao-modelo.md` → com estrutura de ata
- `pauta-conteudo-modelo.md` → pra conteúdo orgânico do cliente

**2. Adicionar tags e links:**

Cada template tem tags pré-definidas:
- `#cliente/[nome]`
- `#tipo/[briefing|relatorio|reuniao]`
- `#campanha/[nome]`

Permite buscar com Dataview:
````
```dataview
TABLE file.mtime as "Atualizado"
FROM "clientes"
WHERE contains(tags, "#tipo/briefing")
SORT file.mtime DESC
```
````

**3. Criar dashboard inicial da agência:**

`~/Cockpit/dashboard.md` com Dataview queries:
- Clientes ativos
- Briefings da semana
- Relatórios pendentes
- Tarefas em aberto

**4. Validar com cliente:**

> "Olha — tu abriu Obsidian, vê todos os clientes. Clica num cliente, vê o dossiê linkado. Clica no briefing, vê histórico. Tu nunca mais perde nada."

**5. Commit:**
```bash
cd ~/Cockpit
git add .
git commit -m "feat: cockpit brain configurado (operation)"
```

---

## 🛑 PAUSA — Sessão 1 acaba aqui

### O que falar pra fechar a sessão 1

> "Tu tem agora a stack completa rodando + segundo cérebro no Obsidian. Vou te dar 7 dias pra usar e absorver. Daqui 7 dias a gente faz a sessão 2: pego 1 cliente real teu, e a gente configura ele de ponta a ponta junto. Tu vai sair sabendo replicar pra qualquer cliente novo."

> "Nesses 7 dias, tarefa pra ti:
> 1. Usar a stack pelo menos 1x ao dia
> 2. Anotar onde travou
> 3. Escolher qual cliente a gente vai usar como exemplo na sessão 2"

Agendar sessão 2 (1h, 7 dias depois).

---

## ⏱️ Bloco 13 — Cliente real configurado AO VIVO — 40 min (Sessão 2)

### O que falar

> "Hoje a gente pega um cliente real teu e configura **tudo** de ponta a ponta. Tu vai sair daqui sabendo replicar pra qualquer cliente."

### Passos (com cliente que ele escolheu)

**1. Pedir o nome do cliente:**

> "Qual cliente teu vamos usar?"

Cliente: ex. "Padaria do João"

**2. Onboarding completo:**
```
/cockpit-onboarding Padaria do João
```

Skill conduz entrevista cheia (não a básica do Kick — a versão Operation).

**3. Dossiê expandido:**
```
/cockpit-dossie padaria-do-joao
```

Vai mais fundo: pesquisa concorrentes, mapeia público, identifica oportunidades, gera big idea.

**4. Configurar Meta:**
```
/cockpit-meta mapeia conta da padaria-do-joao
```

Captura todas campanhas existentes, salva snapshot.

**5. Configurar Watch específico desse cliente:**

Definir regras customizadas pra esse cliente (CPA-meta dele é diferente de outros nichos).

**6. Configurar Track:**

Adicionar domínio do cliente no Cloudflare Worker (multi-tenant).

**7. Gerar primeiro relatório:**
```
/cockpit-report padaria-do-joao últimos 30 dias
```

Mostra o que essa skill faria automático toda segunda.

**8. Gerar 10 criativos:**
```
/cockpit-creative padaria-do-joao tema "promoção dia das mães"
```

10 imagens prontas em 5 min.

**9. Briefing pro próximo lançamento:**

Com o Brain ativo, criar briefing usando o template:
```
clientes/padaria-do-joao/briefing/2026-05-08-dia-das-maes.md
```

Linkado ao dossiê, à campanha do Meta, aos criativos gerados.

> "Tá vendo? Em 40 minutos a gente operou esse cliente do zero ao final. Tu agora replica pra todos os outros."

---

## ⏱️ Bloco 14 — Refinamento — 20 min (Sessão 2)

### Passos

**1. Pedir feedback:**

> "Nos últimos 7 dias, onde tu travou? O que ficou confuso?"

Anotar dores reais. Resolver:
- Comando que não funcionou bem
- Skill que precisou de ajuste
- Template que faltou seção

**2. Customizar comandos pra agência dele:**

Se o cliente tem padrões específicos (ex: sempre quer relatório com seção "próximos 7 dias"), customizar a skill `cockpit-report` pra esse padrão.

**3. Configurar relatórios brandizados:**

Pegar logo da agência → adicionar nos templates de relatório → salvar em `marca/templates-relatorio/`.

**4. Templates de proposta e contrato:**

Popular `templates/proposta-comercial.md` e `templates/contrato-sla.md` com o padrão da agência. Skill `cockpit-onboarding` vai usar daqui em diante.

**5. Push pro GitHub:**
```bash
cd ~/Cockpit
git add .
git commit -m "feat: operation completo - cliente exemplo configurado + customizações"
git push
```

---

## ⏱️ Hand-off Operation — 5 min

### Passos

**1. Gerar PDF Operation:**
```
/cockpit-init gerar-pdf-handoff operation
```

**2. Adicionar à comunidade Operation+ no Telegram.**

**3. Agendar follow-up 30 dias** (não 14 — Operation tem 30 dias de suporte WhatsApp).

**4. Pitch pro Black:**

> "Daqui 30 dias eu te chamo. Se a operação tiver fluindo bem e tu quiser que eu desenhe a agência inteira no padrão Cockpit (SOPs, gestão interna, dashboards executivos, GitHub backup), Black tá com R$1.000 de desconto pra fechar."

---

## ✅ Checklist final do Operation

- [ ] Tudo do Install OK
- [ ] Obsidian configurado como vault em `~/Cockpit/`
- [ ] Plugins essenciais instalados (Dataview, Templater, Calendar, Tag Wrangler, Excalidraw)
- [ ] Templates Brain populados (dossiê, briefing, relatório, reunião, pauta)
- [ ] Dashboard `dashboard.md` funcionando
- [ ] 1 cliente real configurado de ponta a ponta ao vivo
- [ ] Customizações específicas da agência aplicadas
- [ ] Templates brandizados (logo, cores nos relatórios)
- [ ] Push pro GitHub realizado
- [ ] PDF hand-off Operation gerado
- [ ] Comunidade Operation+ adicionado
- [ ] Follow-up 30 dias agendado
