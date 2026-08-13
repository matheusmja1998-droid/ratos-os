# MAPA DE CAPACIDADES DO CLAUDE CODE PARA AGÊNCIAS

## Para: Matheus Jardim (WinVision + L.M Agência)
## Objetivo: Automação, padronização e escala operacional

---

## 1. SKILLS (Sua Linguagem Operacional)

Skills são prompts reutilizáveis que você dispara manualmente ou deixa Claude usar automaticamente. Você já tem 50+ skills criadas. Aqui está o que pode turbinar:

### O que são
Arquivo SKILL.md em .claude/skills/<nome>/ com:
- Frontmatter (YAML): configurações como description, disable-model-invocation, allowed-tools
- Markdown: instruções que Claude segue quando a skill ativa

### Triggers principais
- Auto-trigger: Claude detecta quando usar baseado em description
- Manual: você digita /nome-da-skill no chat
- Argumentos: /meu-skill argumento1 argumento2

### 3 padrões turbinadores pra agência

#### A) Dynamic context injection (dados ao vivo no prompt)
Quando você roda /audit-campanha-caio, o comando executa primeiro e Claude recebe os dados reais inseridos no prompt. Não é Claude adivinhar históricos, é dados ao vivo.

Exemplo prático pra WinVision: skill /debrief-lancamento-fernanda que faz curl pra API de dashboards dela, python pra processar planilha de leads, e já injeta tudo no prompt pronto pra análise.

#### B) Scripts executáveis como suporte
Estrutura:
```
meu-skill/
├── SKILL.md (instruções)
├── scripts/
│   ├── extract.py (Claude pode executar)
│   └── validate.sh (validação pós-execução)
└── templates/
    └── relatorio.html (template que Claude preenche)
```

Exemplo prático: /criar-anuncio que:
1. Claude lê o SKILL.md (instruções de copy Schwartz + compliance)
2. Claude roda scripts/gera-copy.py pra gerar 5 headlines
3. Claude roda scripts/render-ad.js com Playwright pra gerar PNG 1080x1080
4. Resultado: 10 criativos prontos pra Meta Ads em 2 minutos

#### C) Restringir quando Claude invoca (disable-model-invocation: true)
Isso evita Claude deployar sozinho por acidente. Você controla timing com /deploy-vercel.

### Seu setup atual (que já está bom)
Você tem 50+ skills em .claude/skills/ e .claude/skills/ do Ratos OS. A maioria está bem organizada. Oportunidades:

1. Injetar dados ao vivo em skills que hoje fazem análise manual (debrief-lancamento, audit de ads, relatório-semanal)
2. Agregar scripts Python nas skills que fazem processamento de dados (EV, Caio, Fernanda)
3. Combinar skills em "suites": ex, /novo-lancamento-caio que roda /criar-anuncio -> /criar-dashboard -> /criar-checklist-pre-launch em sequência

---

## 2. HOOKS (Automação Invisível)

Hooks disparam ações em pontos específicos do workflow sem você intervir. Seu settings.json já tem um hook de auto-commit. Aqui está o mapa completo:

### Eventos disponíveis

SessionStart: quando sessão inicia - usar para carregar contexto (branch atual, issues abertas, checklist)

UserPromptSubmit: antes Claude processar prompt - validar/bloquear certos tipos de request

PreToolUse: antes executar ferramenta (Bash, Edit, etc) - bloquear rm, validar SQL, checar credenciais

PostToolUse: depois ferramenta sucede - lint/test automático, log, trigger next step

PostToolUseFailure: depois ferramenta falha - retry, notificação Telegram, rollback

PermissionRequest: usuário aprovando tool call - auto-approve certos commands, block outros

Stop: Claude termina resposta - rodar testes antes de deixar parar, validar commit

### 4 padrões de ROI pra agência

#### A) Auto-commit inteligente (VOCÊ JÁ TEM)
Seu hook atual em settings.json roda git add/commit/push ao Stop. 

Upgrade: adicionar validação de erro antes de commitar, checando TODO/FIXME/console.log.

#### B) Notificação Telegram quando skill termina (HIGH ROI)
Trigger: quando você dispara /cockpit-report, avisa Matheus por Telegram que terminou.

Quando Claude roda /cockpit-report, termina, e você recebe Telegram automático no seu celular.

#### C) Validação pré-deploy (previne disaster)
Bloqueia deploy em main branch ou se testes falham, antes de permitir vercel deploy.

#### D) Log estruturado pra auditoria (compliance + análise)
Cada ação importante (edit file, run bash) fica registrada em audit.log com timestamp, ferramenta, arquivo.

### Onde colocar hooks
- Todos os projetos: ~/.claude/settings.json
- Só esse projeto: .claude/settings.json (commita no repo)
- Só local (secreto): .claude/settings.local.json (gitignore)

---

## 3. MCPs (Model Context Protocol)

MCPs são conectores pra ferramentas externas (Slack, Linear, Google Drive, Postgres, etc). Diferença de skill:

Skill: Prompt + instruções, em .claude/skills/, processos internos
MCP: Ferramentas de fora, servidor externo, integração com 3rd party

Exemplo: "criar anúncio" é skill. "Ler arquivo do Google Drive" é MCP.

### MCPs que fazem sentido pra agência

#### A) Google Drive (já disponível, HIGH ROI)
Acessa planilhas, docs, PDFs direto do Claude, sem download manual.

claude mcp install google-drive

Setup: autoriza conta Google uma vez, pronto.

Caso real pra você: Skill /relatorio-semanal-cliente lê planilha de Meta Ads, leads, vendas direto do Drive. Claude processa, gera HTML com dashboard. Tudo automatizado, sem você baixar nada.

#### B) Slack (notificações em tempo real)
Integra Claude com canais Slack de clientes.

claude mcp install slack

Caso real: Quando skill /cockpit-report termina, Claude posta summary no canal #relatorios-caio. Caio vê resultado direto no Slack, sem CLI.

#### C) Linear (pra task management)
Se usar Linear pra bugs/features.

claude mcp install linear

Caso real: Skill detecta bug na captação Fernanda. Claude abre issue automaticamente em Linear com timestamp. Team vê e trata na daily.

#### D) PostgreSQL (pra queries diretas)
Se tiver DB com dados (ex: Kommo logs, Clint dados, leads armazenados).

claude mcp install postgres

Caso real: Skill /audit-conversoes-caio faz SELECT direto do DB do Kommo. Analisa funil, identifica gargalo. Sem exportar CSV manualmente.

#### E) Custom MCP (se quiser integração própria)
Criar MCP customizado é dev-heavy, mas possível. Ex: integrar n8n diretamente.

Exemplo: MCP que chama workflows n8n por ID. Depois disso, skill pode fazer: Use a ferramenta "invoke_n8n_workflow" com id=Idy3AMjZ5yA6bXnV

### Instalação
MCPs ficam em ~/.claude.json (usuário) ou .claude/mcp-config.json (projeto).

---

## 4. SUBAGENTS (Agentes Especializados)

Subagents são "Claudes auxiliares" que você delega tarefas específicas. Rodam em contexto isolado, voltam com resposta.

### Quando usar
- Pesquisa que gera logs huge (desafogar contexto principal)
- Reviewer: agent que só revisa código/copy
- Pesquisador: agent que só scrapa web
- Validator: agent que testa se coisa funciona

### Como criar (em .claude/agents/)

Exemplo: subagent revisor de copy (pra Fernanda compliance, EV feedback, etc)

Um agent revisor-copy que:
1. Valida compliance (não fazer promessas impossíveis)
2. Valida tom (direto, sem genérico, "tu")
3. Sugere melhorias de headline/CTA
4. Dá nota 1-10 pra efetividade

Seu output é JSON estruturado com score, issues, suggestions.

Delegação em skill: quando você roda /revisar-copy-produto, Claude delega pro agent revisor-copy que analisa isolado e volta com feedback.

### Você deve usar subagents quando...
- Pesquisa de mercado (Explore agent): "pesquisa 5 concorrentes de X"
- Revisão de código: agent que só testa
- Análise de logs: agent que procura padrões
- Testes de landing page: agent que testa conversion

---

## 5. AUTOMAÇÃO (Modo Non-Interativo + Routines)

### A) Modo Non-Interativo (claude -p)
Roda tarefa automaticamente sem interface interativa. Use em:
- Cron jobs
- CI/CD
- Webhooks
- Batch processing

Exemplo: exportar dados Meta Ads pra planilha (cron diário)

Script ~/bin/export-meta-ads.sh roda claude -p com prompt "Exporte insights de Meta Ads dos últimos 7 dias, crie CSV, upload pra Google Sheets"

Coloca em crontab: 0 8 * * * /home/user/bin/export-meta-ads.sh

Resultado: toda manhã 8h, dados Meta em Google Sheets, sem você tocar.

Outros exemplos:
- Debrief automático pós-lançamento (lê leads + vendas, calcula conversão, gera dashboard)
- Validação de anúncios Meta (batch): verifica compliance, copy, imagem de 100 anúncios de uma vez

### B) Routines (Automação em Cloud)
Executam em servidor Anthropic, sem laptop ligado. Setup via /schedule:

/schedule daily at 8am, generate weekly report for Caio

Claude walk you através do setup, configura prompt, repos, triggers, connectors.

Resultado: task roda todo dia 8h, posta resultado em Slack.

Exemplos high-ROI pra agência:

1) Relatório semanal automático (segundas 8h)
Gera relatório consolidado: ler planilhas de leads (Fernanda, Caio, EV), ler Meta Ads via MCP, ler vendas via Clint CRM, gerar HTML com gráficos, postar sumário em Slack, enviar link pra Telegram do Matheus.

2) Monitoramento de anúncios pausados (diário)
Verifique campanhas Meta: quais foram pausadas ontem? Por quê? Se ROAS < 2.5x: avisar. Abre issue no Linear. Posta em Slack.

3) Debrief automático pós-lançamento (API trigger)
Debrief do lançamento: ler arquivo leads.csv (passado via API), ler arquivo vendas.csv, calcular conversão/CPL/ticket/ROI, gerar dashboard HTML, upload Vercel, postar URL em Telegram.

Exemplo de chamada via webhook.

---

## 6. AUTOMAÇÕES AVANÇADAS (Bônus)

### A) Permission Modes (quando você não quer digitar "sim" toda vez)

Muda como Claude executa tools. 5 modes:

default: Pede confirmação pra cada tool
auto: Auto-aprova tools pré-aprovadas em settings
acceptEdits: Auto-executa, mostra resultado depois
plan: Mostra plano antes, pede confirmação final
bypassPermissions: Roda tudo sem pedir (PERIGOSO)

Pra agência: use acceptEdits pra skills seguras (create-post, gera-report) e plan pra destrutivas (deploy, delete-campaign).

### B) Plan Mode (validação antes)
claude --permission-mode plan

Claude mostra plano de execução antes, você aprova uma vez, ele executa tudo.

### C) Channels (Push webhooks pra session ativa)
Research preview, mas muito promissor. MCP server pode fazer push de eventos pra session aberta.

Exemplo: while Claude tá analisando dados, webhook de erro chega, Claude muda strategy.

---

## RESUMO: 5 FEATURES VOCÊ AINDA NÃO TÁ USANDO

1. Dynamic Context Injection (!comando em SKILL.md)
   Current: suas skills rodam análise "genérica"
   Future: injetar dados Meta Ads/Kommo/Google Sheets ao vivo no prompt
   ROI: 10-20% melhoria de precisão nas análises, zero latência
   Esforço: 2-3h pra retrofitar 5 skills principais

2. Hooks + Telegram Notifications
   Current: você roda tarefa, claude termina, você não sabe
   Future: hook dispara Telegram automático com resultado
   ROI: economiza 5-10 context switches/dia (focus interrompido)
   Esforço: 30min, é só adicionar 15 linhas de JSON

3. Routines (Cloud Automation)
   Current: você roda /cockpit-report manualmente
   Future: routine roda segunda 8h, automático, posta em Slack
   ROI: libera 2-3h/semana, 100% hands-off
   Esforço: 1h pra configurar primeira routine

4. Subagents pra Research + Validação
   Current: Claude faz tudo em contexto único
   Future: agent pesquisador roda isolado, agent revisor valida, main context limpo
   ROI: +40% capacity (mais contexto pra prompt importante)
   Esforço: criar 2-3 agents base template, 2h

5. Mode Non-Interativo em Cron (claude -p)
   Current: tudo interativo, você gerencia
   Future: cron jobs rodam automático, email com resultado
   ROI: automação "set and forget", escalável
   Esforço: 1h por script, depois é maintenance zero

---

## ROADMAP PRÁTICO (Próximas 2 Semanas)

Semana 1:
- Retrofitar 3 skills principais com dynamic context injection (debrief-lancamento, relatorio-semanal, audit-ads)
- Adicionar hook + Telegram pra 2 skills destrutivas (deploy, criar-anuncio)
- Testar em projeto piloto (ex: Caio)

Semana 2:
- Criar routine pra "relatório semanal" (schedule segunda 8h)
- Criar routine pra "debrief pós-lançamento" (API trigger via n8n)
- Criar 2-3 subagents base (revisor-copy, pesquisador, validator)

---

## LINKS ÚTEIS

Skills deep dive: https://code.claude.com/docs/en/skills.md
Hooks full reference: https://code.claude.com/docs/en/hooks.md
MCPs: https://code.claude.com/docs/en/mcp.md
Routines: https://code.claude.com/docs/en/routines.md
CLI flags: https://code.claude.com/docs/en/cli-usage.md
