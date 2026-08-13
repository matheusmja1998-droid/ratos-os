# {{nome_agencia}} — Cockpit

Workspace operacional da agência **{{nome_agencia}}** ({{cidade}}/{{estado}}). Nicho principal: **{{nicho}}**.

Este workspace é gerenciado pelo Cockpit (stack de IA pra agências de tráfego).

## Estrutura

- `_contexto/` — memória da agência (não apagar)
- `marca/` — identidade visual
- `clientes/` — pastas de clientes (cada um com sua estrutura padrão)
- `templates/` — modelos da agência
- `pesquisa/` — benchmarks e estudo de nicho
- `operacao/` — gestão interna (Black)
- `.cockpit/` — config técnica (skills, n8n, cloudflare)
- `.claude/skills/` — skills do Cockpit

## Contexto

No início de toda conversa, ler:
1. `_contexto/agencia.md` — quem é a agência
2. `_contexto/preferencias.md` — tom, estilo
3. `_contexto/operacao.md` — SOP geral

Pra trabalhar com cliente específico, ler também `clientes/[cliente]/CLAUDE.md` e `clientes/[cliente]/dossie.md`.

## Skills disponíveis

- `/cockpit-onboarding` — onboarda cliente novo
- `/cockpit-dossie` — monta dossiê do cliente
- `/cockpit-meta` — gestão de Meta Ads por linguagem natural
- (Install pra cima): `/cockpit-guardiao`, `/cockpit-track`, `/cockpit-google`, `/cockpit-debrief`, `/cockpit-report`, `/cockpit-creative`

## Tom de voz

Direto, sem enrolação. Linguagem profissional mas acessível.

Detalhes em `_contexto/preferencias.md`.

## Suporte

- Comunidade Telegram: [link]
- Suporte WhatsApp: até [data fim suporte]
- Atualizações: [link do GitHub do Cockpit]
