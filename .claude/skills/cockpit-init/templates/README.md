# Cockpit — {{nome_agencia}}

Workspace operacional da agência, gerenciado com Cockpit (stack de IA pra agências de tráfego).

## Como começar

Abrir terminal nesta pasta e digitar:
```bash
claude
```

## Comandos principais

```
/cockpit-onboarding [Nome do Cliente]      # Onboarda cliente novo
/cockpit-dossie [slug-cliente]             # Monta/completa dossiê
/cockpit-meta [comando]                    # Gestão Meta Ads
/cockpit-guardiao testar                      # Testa o monitor 24/7
/cockpit-track testar                      # Testa o tracking server-side
/cockpit-google [comando]                  # Gestão Google Ads
/cockpit-debrief [cliente] [periodo]       # Debrief pós-campanha
/cockpit-report [cliente]                  # Relatório semanal
/cockpit-creative [cliente] tema "[X]"     # Gera 10 criativos
```

## Estrutura

```
~/Cockpit/
├── _contexto/          # Memória da agência
├── marca/              # Identidade visual
├── clientes/           # Pastas de clientes
├── templates/          # Modelos
├── pesquisa/           # Benchmarks
├── operacao/           # Gestão interna (Black)
├── .cockpit/           # Config técnica
└── .claude/skills/     # Skills instaladas
```

## Suporte

- Comunidade: [link Telegram]
- Suporte WhatsApp: até [data]

## Backup

```bash
git add . && git commit -m "msg" && git push
```
