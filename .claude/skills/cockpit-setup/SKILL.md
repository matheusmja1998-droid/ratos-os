---
name: cockpit-setup
description: Configura a estrutura inicial do Cockpit pra uma agência de tráfego. Cria pasta ~/Cockpit/ com toda arquitetura padrão, faz entrevista guiada (nome da agência, cidade, nicho, site), popula CLAUDE.md e arquivos de _contexto/ com as respostas, inicia git e abre VS Code. É a primeira skill a rodar no Bloco 2 do setup do Cockpit Kick. Use quando o usuário disser "/cockpit-setup", "configurar Cockpit", "começar setup da agência", "iniciar Cockpit", ou quando estiver instalando o Cockpit pela primeira vez na máquina.
---

# /cockpit-setup — Configuração inicial da agência

## Quando rodar

Primeira skill a ser executada quando um cliente compra qualquer ticket do Cockpit (Kick, Install, Operation ou Black). Cria a base operacional da agência dele.

## Pré-requisitos

- Claude Code instalado e logado
- Claude Pro ativo
- Git instalado
- VS Code instalado (opcional mas recomendado)
- macOS, Linux ou Windows com WSL

## Workflow

Quando o usuário rodar `/cockpit-setup`, executar nessa ordem:

### Passo 1 — Verificar se já existe

```bash
ls ~/Cockpit/ 2>/dev/null
```

**Se a pasta JÁ existir:**

Perguntar ao usuário:
> "Já existe uma pasta `~/Cockpit/` aqui. Tu quer:
>
> 1. **Continuar com a existente** (vou só preencher arquivos faltando)
> 2. **Recomeçar do zero** (vou apagar e criar nova — perde tudo que tem lá)
> 3. **Cancelar** (paro aqui)"

Esperar resposta. Se cancelar, sair. Se recomeçar, perguntar **2 vezes** pra confirmar (ação destrutiva).

**Se a pasta NÃO existir:** seguir pro Passo 2 normalmente.

### Passo 2 — Entrevista guiada

Fazer 4 perguntas, **uma por vez**. Não jogar todas juntas. Esperar resposta antes de fazer próxima.

Manter tom direto, conversacional, sem enrolação. O usuário tá numa call ao vivo, não pode demorar.

#### Pergunta 1 — Nome da agência

Mensagem ao usuário:
> "Pra começar, **qual o nome da tua agência?**
>
> Pode ser nome fantasia, marca, jeito que tu chama no dia a dia. Vou usar isso em relatórios, contratos e na comunicação interna do sistema."

Aguardar resposta. Salvar como `{{nome_agencia}}`.

Validar: se vier vazio ou só espaços, pedir de novo.

#### Pergunta 2 — Cidade e estado

Mensagem:
> "Show, [nome_agencia]. Agora me diz: **em qual cidade e estado tu opera?**
>
> Formato: Cidade/UF (ex: São Paulo/SP, Curitiba/PR, Florianópolis/SC)"

Aguardar resposta. Parsear cidade e estado. Salvar como `{{cidade}}` e `{{estado}}`.

#### Pergunta 3 — Nicho principal

Mensagem:
> "Beleza. **Qual o nicho principal dos teus clientes?**
>
> Pode ser específico (solar, dentista, infoproduto, e-commerce, imobiliária) ou 'geral' se atende vários nichos."

Aguardar resposta. Salvar como `{{nicho}}`.

#### Pergunta 4 — Site / domínio (opcional)

Mensagem:
> "Última pergunta: **a agência tem site ou domínio próprio?**
>
> Se tiver, manda a URL. Se não tiver ainda, responde 'não tem'."

Aguardar resposta. Salvar como `{{site}}` (ou string vazia se não tiver).

### Passo 3 — Confirmar antes de criar

Mostrar resumo:

> "Beleza, vou criar a estrutura com esses dados:
>
> - **Agência:** {{nome_agencia}}
> - **Cidade:** {{cidade}}/{{estado}}
> - **Nicho:** {{nicho}}
> - **Site:** {{site}}
>
> Posso prosseguir? (sim/não)"

Se "não" → perguntar o que ajustar.
Se "sim" → seguir.

### Passo 4 — Criar estrutura de pastas

Executar:

```bash
mkdir -p ~/Cockpit/_contexto \
  ~/Cockpit/marca/templates-relatorio \
  ~/Cockpit/clientes/_modelo/{briefing,criativos/{aprovados,em-teste,arquivados},relatorios,meta-ads/snapshots,google-ads/snapshots,reunioes} \
  ~/Cockpit/templates \
  ~/Cockpit/pesquisa/{nichos,concorrentes} \
  ~/Cockpit/operacao \
  ~/Cockpit/.cockpit/{n8n,cloudflare,logs} \
  ~/Cockpit/.claude/skills

cd ~/Cockpit
```

Confirmar pro usuário:
> "✅ Estrutura de pastas criada."

### Passo 5 — Popular `CLAUDE.md` (raiz)

Criar `~/Cockpit/CLAUDE.md` com o template abaixo, substituindo as variáveis:

```markdown
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
- `/cockpit-meta` — gestão Meta Ads por linguagem natural

## Tom de voz

Direto, sem enrolação. Linguagem profissional mas acessível.

Detalhes em `_contexto/preferencias.md`.
```

### Passo 6 — Popular `_contexto/agencia.md`

Criar com template:

```markdown
---
documento: contexto-agencia
atualizado: {{data_hoje}}
---

# {{nome_agencia}} — Contexto da Agência

## Identificação

- **Nome:** {{nome_agencia}}
- **Cidade/Estado:** {{cidade}}/{{estado}}
- **Site:** {{site}}
- **Nicho principal:** {{nicho}}

## Posicionamento

> [Preencher: o que vocês fazem, pra quem, qual diferencial]

## Tipo de cliente ideal

> [Preencher: quem é o cliente que vocês mais querem? Faturamento, ticket médio do cliente do cliente, dor principal]

## Equipe

- **Sócios:** [a preencher]
- **Equipe:** [tamanho e funções]

## Faturamento atual

- **MRR:** R$ [a preencher]
- **Meta de MRR:** R$ [a preencher]
- **Ticket médio por cliente:** R$ [a preencher]
- **Quantos clientes ativos:** [a preencher]

## Diferencial competitivo

> [O que torna a agência única]
```

### Passo 7 — Popular `_contexto/preferencias.md`

Criar com template:

```markdown
---
documento: preferencias
atualizado: {{data_hoje}}
---

# Preferências de Comunicação — {{nome_agencia}}

## Tom de voz

Direto, sem enrolação. Linguagem profissional mas acessível.

## Palavras que NÃO uso

> [A preencher conforme for usando]

## Estilo de relatório

- **Frequência:** semanal
- **Formato:** PDF
- **Profundidade:** executivo curto
- **Quem lê:** dono da empresa

## Estilo de proposta comercial

> [A preencher]

## Padrões visuais

Detalhes em `marca/design-guide.md` (ainda não configurado).
```

### Passo 8 — Popular `_contexto/operacao.md`

Criar com template:

```markdown
---
documento: operacao-sop
atualizado: {{data_hoje}}
---

# Operação — SOP Geral da Agência

## Como cliente entra

> [Lead → como qualifica → reunião → proposta → fechamento]

## Como cliente roda

### Reuniões com cliente
- **Frequência:** [semanal/quinzenal/mensal]
- **Formato:** [Meet, presencial, telefone]

### Relatórios
- **Frequência:** [semanal/quinzenal/mensal]
- **Formato:** [PDF, e-mail, Telegram]
- **Quem manda:** [tu, equipe]

## Como cliente sai

> [Renovação/encerramento — processo]

## Ferramentas do dia a dia

- **CRM:** [a preencher]
- **Comunicação:** [WhatsApp, Slack]
- **Reuniões:** [Meet, Zoom]
- **Documentos:** [Google Drive, OneDrive]
- **Tráfego:** Cockpit + Meta + Google
```

### Passo 9 — Criar `_modelo/` de cliente

Dentro de `~/Cockpit/clientes/_modelo/`, criar arquivos placeholder:

```bash
touch ~/Cockpit/clientes/_modelo/CLAUDE.md \
  ~/Cockpit/clientes/_modelo/dossie.md \
  ~/Cockpit/clientes/_modelo/meta-ads/contas.md \
  ~/Cockpit/clientes/_modelo/meta-ads/campanhas.md \
  ~/Cockpit/clientes/_modelo/google-ads/contas.md \
  ~/Cockpit/clientes/_modelo/google-ads/campanhas.md
```

Esses arquivos ficam vazios — viram template quando a skill `cockpit-onboarding` rodar e copiar `_modelo/` pra cada cliente novo.

### Passo 10 — Criar `.gitignore`

```bash
cat > ~/Cockpit/.gitignore << 'EOF'
# Tokens e credenciais — NUNCA commitar
.env
.env.local
.env.*.local
*.key
*.pem

# Dados sensíveis
clientes/*/snapshots/raw/
*.csv.bruto

# Sistema
.DS_Store
Thumbs.db
*.swp

# Editor
.vscode/
.idea/

# Obsidian
.obsidian/workspace*
.obsidian/cache

# Logs
.cockpit/logs/
*.log

# n8n local
.cockpit/n8n/data/

# node
node_modules/
EOF
```

### Passo 11 — Iniciar git + primeiro commit

```bash
cd ~/Cockpit
git init
git add .
git commit -m "feat: estrutura inicial Cockpit ({{nome_agencia}})"
```

Se `git config user.email` e `git config user.name` não estiverem configurados, perguntar:

> "Antes do primeiro commit, git precisa do teu nome e e-mail. Me passa:
>
> 1. Teu nome (vai aparecer nos commits)
> 2. Teu e-mail"

Configurar com:
```bash
git config user.name "[nome]"
git config user.email "[email]"
```

Aí roda o commit.

### Passo 12 — Abrir VS Code

Se VS Code estiver instalado:

```bash
code ~/Cockpit/
```

Se não estiver, sugerir ao usuário:
> "VS Code não tá instalado. Recomendo instalar pra ver visualmente a estrutura. Baixa em https://code.visualstudio.com/. Por agora, podemos seguir só pelo terminal."

### Passo 13 — Confirmação final

Mostrar mensagem:

> "✅ **Cockpit configurado pra {{nome_agencia}}**.
>
> O que tu tem agora:
>
> ```
> ~/Cockpit/
> ├── CLAUDE.md                    ← memória principal
> ├── .gitignore
> ├── _contexto/
> │   ├── agencia.md               ← contexto da agência
> │   ├── preferencias.md          ← tom de voz
> │   └── operacao.md              ← SOP geral
> ├── marca/                       ← identidade visual
> ├── clientes/                    ← pastas de clientes
> │   └── _modelo/                 ← template-base
> ├── templates/                   ← modelos
> ├── pesquisa/                    ← benchmarks
> ├── operacao/                    ← gestão interna
> ├── .cockpit/                    ← config técnica
> └── .claude/skills/              ← skills (vazio por enquanto)
> ```
>
> **Próximos passos:**
>
> 1. Próxima skill a instalar: **Cockpit Onboarding** — onboarda teus clientes novos
>    Comando: `cd ~/Cockpit/.claude/skills && git clone https://github.com/matheusmja1998-droid/cockpit-onboarding.git`
>
> 2. Depois: **Cockpit Dossiê** e **Cockpit Meta**
>
> Tu pode rodar essas instalações junto com o Matheus na call ou seguir o `kick.md` da skill `cockpit-init`.
>
> Bom trabalho. Boas pilotagens. 🚀"

---

## Variáveis usadas

| Variável | Descrição |
|---|---|
| `{{nome_agencia}}` | Nome da agência (resposta pergunta 1) |
| `{{cidade}}` | Cidade (resposta pergunta 2, antes da `/`) |
| `{{estado}}` | Estado (resposta pergunta 2, depois da `/`) |
| `{{nicho}}` | Nicho principal (resposta pergunta 3) |
| `{{site}}` | URL do site ou "não tem" (resposta pergunta 4) |
| `{{data_hoje}}` | Data atual no formato YYYY-MM-DD |

---

## Princípios de execução

1. **Conversacional, não interrogatório.** Usar tom direto mas amigável.
2. **1 pergunta por vez.** Não jogar tudo de uma.
3. **Confirmar antes de ações destrutivas.** Se pasta já existe, perguntar 2x antes de apagar.
4. **Sempre validar resposta antes de salvar.** Se vier vazio, pedir de novo.
5. **No fim, sempre sugerir o próximo passo.** Cliente não pode ficar perdido.

---

## Comportamento se algo der errado

- **`mkdir: command not found`** (Windows puro): avisar que precisa de WSL ou Mac/Linux
- **`Permission denied`**: validar que tá rodando em `~/` (home), não `/`
- **Git não configurado**: perguntar nome/e-mail e configurar
- **VS Code não instalado**: pular abertura automática, seguir só pelo terminal
- **Pasta já existe**: ver Passo 1 (perguntar antes de qualquer ação)
