---
name: cockpit-init
description: Skill mestra do Cockpit. Orquestra a instalação completa da stack de IA pra agência de tráfego, conduzindo o setup ao vivo durante a reunião de implementação. Funciona em 4 tiers (Kick R$497, Install R$997, Operation R$1.997, Black R$3.997). Cada tier carrega seu passo-a-passo correspondente em `tiers/`. Use quando o Matheus disser "/cockpit-init", "vamos instalar o Cockpit", "começar o setup", "rodar a instalação do cliente novo", ou quando estiver começando uma reunião de implementação.
---

# /cockpit-init — Instalador Mestre do Cockpit

## Pra que serve

Skill conduzida pelo Matheus durante a reunião de implementação (Meet). Vai passo a passo, conversando, instalando cada componente do Cockpit no computador do cliente. Não automatiza tudo — guia o Matheus pra que ele não esqueça nenhum passo.

A skill é **conversacional**. Cada passo o Matheus executa ao vivo enquanto o cliente assiste/acompanha pelo Meet.

## Pré-requisitos do cliente (avisar antes do Meet)

1. **Computador com macOS, Linux ou Windows com WSL**
2. **Claude Pro ou Max** ativo (R$100/mês ou R$500/mês)
3. **Claude Code** instalado (se não, primeira parte do Meet é instalar)
4. **Conta Meta Business** com acesso de admin
5. **Cartão de crédito** pra Cloudflare (não cobrado no Kick — só pra ter conta)

## Como começar

Quando o Matheus rodar `/cockpit-init` ou disser "vamos começar a instalação":

### Passo 0 — Identificar o tier

Pergunta:
> "Qual ticket esse cliente fechou? **Kick** (R$497), **Install** (R$997), **Operation** (R$1.997) ou **Black** (R$3.997)?"

Conforme a resposta, carregar o arquivo correspondente:

| Tier | Arquivo |
|---|---|
| Kick | `tiers/kick.md` |
| Install | `tiers/install.md` |
| Operation | `tiers/operation.md` |
| Black | `tiers/black.md` |

### Passo 1 — Coletar dados básicos

Antes de carregar o tier, coletar:

> "Beleza. Pra começar, me passa:
> 1. Nome da agência (como vai aparecer no sistema)
> 2. Cidade/estado da agência
> 3. Quantos clientes você tem hoje?
> 4. Nicho principal (ex: solar, dentista, infoproduto, e-com)?"

Salvar essas respostas pra usar nos templates de `CLAUDE.md`, `_contexto/agencia.md`, etc.

### Passo 2 — Executar o tier

Ler o arquivo do tier carregado e seguir **passo a passo, em ordem, sem pular**.

A cada passo:
1. Anunciar o que vai fazer ("Agora vamos instalar a Skill X")
2. Executar o comando ou guiar o Matheus a executar
3. Pedir o que precisar do cliente (token, link, credencial)
4. Confirmar que funcionou (teste de validação ao vivo)
5. Avançar pro próximo

### Passo 3 — Hand-off final

No fim do tier, gerar:
1. **PDF de hand-off** com tudo que foi instalado (na pasta `~/Cockpit/`)
2. **Próximos passos** (o que o cliente faz depois do Meet)
3. **Convite pra comunidade Telegram**
4. **Pergunta:** "Te avisei que pelos próximos X dias eu tô disponível no WhatsApp. Salva meu número?"

## Estrutura de arquivos da skill

```
cockpit-init/
├── SKILL.md                       ← este arquivo
├── tiers/
│   ├── kick.md                    ← passo-a-passo do Kick
│   ├── install.md                 ← passo-a-passo do Install
│   ├── operation.md               ← passo-a-passo do Operation
│   └── black.md                   ← passo-a-passo do Black
└── templates/
    ├── CLAUDE-raiz.md             ← template do CLAUDE.md da raiz
    ├── CLAUDE-cliente.md          ← template do CLAUDE.md por cliente
    ├── README.md                  ← template do README
    ├── env-exemplo.md             ← template do .env
    ├── gitignore.md               ← template do .gitignore
    ├── agencia.md                 ← template de _contexto/agencia.md
    ├── preferencias.md            ← template de _contexto/preferencias.md
    ├── operacao.md                ← template de _contexto/operacao.md
    ├── dossie-modelo.md           ← template de cliente/dossie.md
    ├── briefing-modelo.md         ← template de briefing
    ├── relatorio-modelo.md        ← template de relatório semanal
    ├── proposta-modelo.md         ← template de proposta
    └── contrato-sla-modelo.md     ← template de contrato/SLA
```

## Princípios de execução

1. **Nunca pule passo.** O Matheus contratou a skill pra ele NÃO esquecer.
2. **Sempre teste cada skill instalada** antes de passar pra próxima.
3. **Pergunte 1 coisa por vez.** Não jogue 3 perguntas juntas.
4. **Seja explícito sobre cliques no Meta Business.** Detalhe cada botão.
5. **Espere confirmação** antes de avançar quando o passo é crítico.
6. **Anote tokens em `.env`** imediatamente, nunca deixe pra depois.
7. **Commite no git a cada milestone** (skill instalada = commit).
8. **No fim, push pro GitHub** (sempre — backup automático).

## Comportamento se algo der errado

- Token rejeitado pela Meta API → guiar a regenerar
- Skill não instala → checar `npx skills add` versão correta
- Cliente não tem permissão de admin → pedir que entre em contato com o admin antes de continuar
- Cloudflare bloqueia → criar exceção de IP

Em caso de erro fatal: pausar, anotar onde parou em `~/Cockpit/.cockpit/setup-status.md`, e seguir do mesmo ponto na sessão de continuidade.
