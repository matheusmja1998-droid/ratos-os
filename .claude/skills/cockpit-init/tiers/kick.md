# Cockpit Kick — Passo a Passo da Instalação

**Duração estimada:** 1h
**Ticket:** R$497
**Pré-requisitos do cliente:** Computador, Claude Pro ativo, conta Meta Business com admin

## Visão geral da sessão

```
[ 5 min] Apresentação e checagem de pré-requisitos
[10 min] Cockpit Setup — estrutura de pastas
[15 min] Skill 1 — Cockpit Onboarding
[10 min] Skill 2 — Cockpit Dossiê
[15 min] Skill 3 — Cockpit Meta (com criação de app, token, política, ativação)
[ 5 min] Hand-off, comunidade, próximos passos
```

---

## ⏱️ Bloco 1 — Apresentação e checagem (5 min)

### O que falar pro cliente

> "Antes de começar, vamos conferir 3 coisas rapidinho. Em 1 hora tu vai sair daqui com a base operacional da tua agência rodando. Beleza?"

### Checklist de pré-requisitos

Pedir pro cliente confirmar **um por um**:

- [ ] **Claude Pro ativo?** (Pedir pra abrir claude.ai, ver no canto superior direito se tem "Pro")
- [ ] **Claude Code instalado?** Se não, instalar agora:
  ```bash
  curl -fsSL https://claude.ai/install.sh | sh
  ```
  Validar com `claude --version`
- [ ] **Acesso de admin no Meta Business?** Pedir pra abrir [business.facebook.com](https://business.facebook.com) e confirmar que ele vê "Configurações do Negócio"
- [ ] **Terminal aberto?** Pedir que abra o Terminal (Mac) ou Prompt (Windows)

Se faltar algum: pausar e resolver antes de continuar.

---

## ⏱️ Bloco 2 — Cockpit Setup: estrutura de pastas (10 min)

### O que falar

> "Agora vamos criar a base operacional da tua agência. Tudo organizado, padronizado. Depois disso, qualquer cliente novo entra no padrão."

### Passos

**1. Pedir pro cliente rodar:**
```bash
cd ~
mkdir Cockpit
cd Cockpit
```

**2. Coletar dados da agência (se ainda não coletou no SKILL.md):**

Perguntas:
- Nome da agência?
- Cidade/estado?
- Quantos clientes hoje?
- Nicho principal (solar, dentista, infoproduto, e-com)?
- Site da agência (se tiver)?
- Instagram da agência?

**3. Criar a estrutura de pastas:**

Rodar (no terminal do cliente):
```bash
mkdir -p _contexto marca/templates-relatorio clientes/_modelo/{briefing,criativos,relatorios,meta-ads,google-ads,reunioes} templates pesquisa/{nichos,concorrentes} .cockpit/{n8n,cloudflare,logs} .claude/skills
```

Validar:
```bash
ls -la
```
Deve aparecer: `_contexto/`, `marca/`, `clientes/`, `templates/`, `pesquisa/`, `.cockpit/`, `.claude/`

**4. Criar arquivos-base usando templates:**

A partir dos dados coletados, criar:

- `~/Cockpit/CLAUDE.md` — usa template `templates/CLAUDE-raiz.md`, substituindo `{{nome_agencia}}`, `{{cidade}}`, `{{nicho}}`
- `~/Cockpit/README.md` — usa template `templates/README.md`
- `~/Cockpit/.gitignore` — usa template `templates/gitignore.md`
- `~/Cockpit/.env.exemplo` — usa template `templates/env-exemplo.md`
- `~/Cockpit/_contexto/agencia.md` — preenchido com dados coletados
- `~/Cockpit/_contexto/preferencias.md` — template em branco com perguntas
- `~/Cockpit/_contexto/operacao.md` — template em branco com perguntas

**5. Criar a estrutura do `_modelo/`:**

```bash
cd ~/Cockpit/clientes/_modelo
touch CLAUDE.md dossie.md
mkdir -p briefing criativos/{aprovados,em-teste,arquivados} relatorios meta-ads/snapshots google-ads/snapshots reunioes
touch meta-ads/contas.md meta-ads/campanhas.md google-ads/contas.md google-ads/campanhas.md
```

**6. Mostrar o resultado pro cliente:**

> "Olha aí — em 5 minutos sua agência tem a estrutura que muita agência grande não tem. Cada cliente novo vai entrar nesse padrão automaticamente."

Mostrar a árvore:
```bash
tree ~/Cockpit -L 3 2>/dev/null || find ~/Cockpit -maxdepth 3 -type d
```

**7. Iniciar git:**

```bash
cd ~/Cockpit
git init
git add .
git commit -m "feat: estrutura inicial Cockpit Setup"
```

---

## ⏱️ Bloco 3 — Skill 1: Cockpit Onboarding (15 min)

### O que falar

> "Primeira skill. Essa é pra quando tu pega cliente novo. Ela cria a pasta dele, lista todos os acessos que tu precisa pedir, monta contrato. Em 30 minutos tu onboarda cliente novo no padrão."

### Passos

**1. Instalar a skill:**

```bash
cd ~/Cockpit
git clone https://github.com/matheusmja1998-droid/cockpit-onboarding.git
```

**Validação:** `ls .claude/skills/` deve mostrar `cockpit-onboarding/`

**2. Configurar a skill:**

A skill `cockpit-onboarding` precisa saber o nome da agência, então:

Abrir `~/Cockpit/.claude/skills/cockpit-onboarding/SKILL.md` e procurar a linha:
```
agencia_nome: {{nome_agencia}}
```
Substituir pelo nome real da agência.

**3. Demonstração ao vivo:**

> "Agora vamos rodar com um cliente real teu. Qual cliente teu tu quer onboardar primeiro?"

Pegar o nome do cliente e rodar:
```
/cockpit-onboarding [Nome do Cliente]
```

A skill vai conduzir uma entrevista interativa perguntando:
- Site do cliente
- Instagram
- Tipo de negócio
- Acessos necessários (lista pra coletar)
- Plano contratado

E vai criar:
- `clientes/[nome-cliente-slug]/CLAUDE.md`
- `clientes/[nome-cliente-slug]/dossie.md` (esqueleto)
- `clientes/[nome-cliente-slug]/briefing/onboarding.md` (com lista de acessos)
- Arquivo `templates/contrato-cliente-novo.md` se ainda não existir

**4. Validar:**

```bash
ls clientes/
```

Deve aparecer a pasta do cliente novo criada.

**5. Commit:**
```bash
git add .
git commit -m "feat: skill cockpit-onboarding instalada + cliente [X] onboardado"
```

---

## ⏱️ Bloco 4 — Skill 2: Cockpit Dossiê (10 min)

### O que falar

> "Agora a skill mais legal. Essa entrevista o cliente em 10 minutos, vasculha o site dele, o Insta, o mercado, e cospe um dossiê completo que vira o cérebro do Claude pra esse cliente. Sabe quando tu pega cliente novo e leva uma semana pra entender o negócio dele? Não acontece mais."

### Passos

**1. Instalar a skill:**

```bash
cd ~/Cockpit
git clone https://github.com/matheusmja1998-droid/cockpit-dossie.git
```

**Validação:** `ls .claude/skills/` deve mostrar `cockpit-dossie/`

**2. Demonstração ao vivo (no cliente onboardado no bloco anterior):**

```
/cockpit-dossie [nome-cliente-slug]
```

A skill vai:
1. Ler o `briefing/onboarding.md` que já tem dados básicos
2. Fazer entrevista interativa (5-10 perguntas estratégicas)
3. Buscar site do cliente (web fetch)
4. Buscar Instagram do cliente
5. Pesquisar concorrentes do nicho
6. Gerar `clientes/[cliente]/dossie.md` completo com:
   - Quem é o cliente
   - Posicionamento atual
   - Oferta principal
   - ICP (perfil ideal de cliente)
   - Concorrentes diretos
   - Histórico (se tiver)
   - Pontos de atenção

**3. Mostrar o resultado:**

Abrir o `dossie.md` e mostrar pro cliente:
> "Olha o que ela gerou em 10 minutos. Da próxima vez que tu abrir o Claude pra trabalhar com esse cliente, ele já sabe tudo. Ganhou tempo de uma semana de pesquisa."

**4. Atualizar o `CLAUDE.md` do cliente:**

A skill já faz isso, mas validar — o `clientes/[cliente]/CLAUDE.md` deve referenciar o `dossie.md`.

**5. Commit:**
```bash
git add .
git commit -m "feat: skill cockpit-dossie instalada + dossiê de [cliente] gerado"
```

---

## ⏱️ Bloco 5 — Skill 3: Cockpit Meta (15 min)

> ⚠️ **Esse é o bloco mais técnico.** Atenção redobrada. Nunca pule passo.

### O que falar

> "Agora a skill principal do Kick. É a que vai te deixar gerenciar tuas campanhas Meta por comando, conversando com a IA. Pra ela funcionar, precisamos criar um app no Meta Developers, pegar o token, configurar política de privacidade e ativar o app pra produção. Vai levar uns 15 minutos. Confia em mim, é mais simples do que parece."

### Sub-bloco 5.1 — Criar o App no Meta Developers (5 min)

**1. Pedir pro cliente abrir:**
[https://developers.facebook.com/apps/](https://developers.facebook.com/apps/)

**2. Logar com a conta Facebook que é admin do Business Manager.**

> "É importante que seja a conta que tem acesso de admin ao BM da agência, senão o app não vai conseguir ler as contas de anúncio."

**3. Clicar em "Criar Aplicativo"** (botão verde no topo direito).

**4. Selecionar caso de uso:**
> Aparecer uma tela "O que é seu caso de uso?"
> Selecionar: **"Outro"**
> Clicar em **"Avançar"**

**5. Selecionar tipo de app:**
> Tela "Selecione um tipo de app"
> Selecionar: **"Empresa"**
> Clicar em **"Avançar"**

**6. Preencher dados do app:**
- **Nome do aplicativo:** `Cockpit [Nome da Agência]` (ex: `Cockpit MJ Tráfego`)
- **E-mail de contato:** o e-mail principal da agência
- **Conta empresarial:** selecionar o Business Manager da agência

Clicar em **"Criar app"**.

**7. Pode pedir senha do Facebook pra confirmar.** Pedir pro cliente digitar.

> "Pronto. App criado. Agora estamos numa tela 'Adicionar produtos ao seu app'. Vamos pegar o token primeiro."

### Sub-bloco 5.2 — Pegar o Token de Acesso (3 min)

**1. No menu lateral esquerdo, ir em:** "Configurações" → "Básico"

**2. Anotar dois valores que aparecem na tela:**
- **ID do Aplicativo** (15 dígitos, copia)
- **Chave Secreta** (clicar em "Mostrar", colar a senha do Facebook, copia)

**Salvar imediatamente em `~/Cockpit/.env`:**
```bash
META_APP_ID=xxxxxxxxxxxxxxx
META_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**3. Pegar o User Access Token:**

Voltar pro menu lateral, ir em **"Ferramentas" → "Explorador da API do Graph"**

Na tela do Graph API Explorer:
- Em "Aplicativo Meta", trocar pro **app que acabamos de criar** (`Cockpit [Agência]`)
- Em "Tipo de Token", deixar em **"Token de acesso do usuário"**
- Clicar em **"Gerar token de acesso"**
- Vai abrir popup pedindo permissões. **CRÍTICO:** clicar em "Editar permissões" e selecionar:
  - `ads_management`
  - `ads_read`
  - `business_management`
  - `read_insights`
  - `pages_show_list`
- Clicar em "Continuar"

> ⚠️ **Esse token dura só 1-2 horas.** Vamos transformar em token de longa duração no próximo passo.

**4. Copiar o token gerado e salvar temporariamente:**
```bash
META_USER_TOKEN_TEMP=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Sub-bloco 5.3 — Trocar pra Token de Longa Duração (2 min)

> "Esse token aí dura 2 horas. Vamos trocar por um que dura 60 dias. Depois vamos trocar por um token de System User que nunca expira."

**1. No terminal do cliente, rodar:**
```bash
curl -X GET "https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=$META_APP_ID&client_secret=$META_APP_SECRET&fb_exchange_token=$META_USER_TOKEN_TEMP"
```

**2. Copiar o `access_token` retornado e atualizar o `.env`:**
```bash
META_USER_TOKEN=EAAxxxxxxxxxxxxxxxxx (o novo, de 60 dias)
```

> ⏳ **TODO pro Install:** trocar por System User Token (que não expira) — fica como upgrade no Install R$997.

### Sub-bloco 5.4 — Configurar Política de Privacidade e URL (3 min)

> ⚠️ **Sem isso, o app fica em modo de Desenvolvimento e só funciona pra contas de teste. Precisa configurar pra ativar.**

**1. Voltar pra "Configurações" → "Básico"**

**2. Preencher os campos:**

- **URL da Política de Privacidade:** Como o cliente provavelmente não tem, vamos usar uma página da agência dele. Opções:
  - Se a agência tem site: `https://[site-agência].com/privacidade`
  - Se não tem: criar uma página rápida no [https://termsfeed.com](https://termsfeed.com) (gratuito) ou usar o template:

  Pedir pro cliente colar o seguinte HTML em algum lugar acessível (Google Sites grátis serve):

  ```
  https://sites.google.com/view/[agência]-privacidade
  ```

  Conteúdo da página (copiar e colar):
  ```
  Política de Privacidade — [Nome da Agência]

  A [Nome da Agência] respeita a privacidade dos seus usuários e parceiros.

  Coletamos apenas dados necessários para a operação dos serviços
  contratados, incluindo dados de contas de anúncios geridos com
  autorização explícita do cliente.

  Não compartilhamos dados com terceiros, exceto quando exigido por lei.

  Para questões: contato@[agência].com
  ```

- **URL dos Termos de Serviço:** mesma página ou criar similar
- **Categoria:** "Negócios e páginas"
- **Ícone do app (1024x1024):** usar o logo da agência (se tiver) ou criar um placeholder no Canva

**3. Clicar em "Salvar Alterações"** (rodapé da página).

### Sub-bloco 5.5 — Ativar o App (Modo Live) (2 min)

> "Agora vamos ativar o app. Sem isso, a skill não consegue ler as contas de anúncio reais."

**1. No topo da página de configurações, tem um toggle: "Modo de Desenvolvimento" / "Live"**

**2. Clicar no toggle pra mudar pra "Live"**

**3. Vai aparecer um modal:** "Antes de mudar para Live, você precisa..."

A Meta vai listar requisitos. Tipicamente:
- ✅ Política de Privacidade configurada (já fizemos)
- ⚠️ Talvez peça pra completar o app (preencher mais campos)
- ⚠️ Talvez peça verificação de empresa (Business Verification)

**Caso peça Business Verification:**
> ⚠️ Isso pode levar 24-48h pra aprovar. Avisar o cliente:
> "Olha, a Meta tá pedindo pra verificar tua empresa. Vou te deixar com a stack instalada e o token de 60 dias funcionando. Quando a verificação aprovar, a gente troca por System User Token e fica permanente."

**4. Se tudo OK, app fica em Live.** Confirmar com o cliente que o toggle mudou.

### Sub-bloco 5.6 — Instalar a Skill Cockpit Meta (3 min)

**1. Instalar:**
```bash
cd ~/Cockpit
git clone https://github.com/matheusmja1998-droid/cockpit-meta.git
```

**2. Configurar:**

Abrir `~/Cockpit/.claude/skills/cockpit-meta/SKILL.md` e validar que ela lê `META_USER_TOKEN` do `.env`.

**3. Mapear as contas de anúncio:**

Rodar no Claude Code:
```
/cockpit-meta listar contas
```

A skill vai listar todas as contas de anúncio que o token tem acesso. Salvar a lista em:
`~/Cockpit/_contexto/contas-meta.md`

**4. Demonstração — 5 comandos ao vivo:**

> "Agora vamos testar com um cliente teu. Vou rodar 5 comandos pra tu ver o poder."

Comando 1 — listar campanhas:
```
/cockpit-meta listar campanhas do cliente [Nome]
```

Comando 2 — pausar campanha com CPA alto:
```
/cockpit-meta pausa campanhas do cliente [Nome] com CPA acima de R$80
```

Comando 3 — duplicar conjunto:
```
/cockpit-meta duplica o conjunto X do cliente [Nome] e troca o público pra lookalike de compradores
```

Comando 4 — editar orçamento:
```
/cockpit-meta edita orçamento da campanha Y do cliente [Nome] pra R$200/dia
```

Comando 5 — atualizar UTM:
```
/cockpit-meta atualiza UTM dos criativos da campanha Z com utm_campaign={{nome_campanha}}
```

> "Pronto. Tu acabou de fazer em 5 comandos o que toma 1 hora no gerenciador."

**5. Commit final:**
```bash
git add .
git commit -m "feat: skill cockpit-meta instalada + app Meta criado e ativado"
```

---

## ⏱️ Bloco 6 — Hand-off (5 min)

### O que falar

> "Pronto. Tua agência tem agora a base operacional + 3 skills rodando. Vamos fechar com algumas coisas:"

### Passos

**1. Gerar PDF de hand-off:**

Rodar:
```
/cockpit-init gerar-pdf-handoff kick
```

A skill gera `~/Cockpit/handoff-kick-[data].pdf` com:
- Resumo do que foi instalado
- Skills disponíveis e como rodar cada uma
- Próximos passos (em 7 dias, em 14 dias)
- Tokens onde estão (sem mostrar valores)
- Convite pra comunidade
- Roadmap pra Install (upgrade)

**2. Convite comunidade:**

> "Te adiciono no grupo de Telegram dos Cockpit Pilots. Lá tu vai ver outras agências usando, tirar dúvida, e quando tiver atualização nova das skills, eu aviso por lá."

Adicionar no grupo: [link do Telegram]

**3. Agendar follow-up de 7 dias:**

> "Em 7 dias eu te chamo no WhatsApp pra ver como tá indo. Se travou em alguma coisa, eu desbloqueio. E se tiver pronto pro Install (a stack completa: monitor 24/7, tracking server-side, Google, debrief, relatório, criativos), eu te dou R$497 de desconto — paga só R$500 pra fechar."

Salvar no calendário: **Follow-up [Cliente] — [data + 7 dias] — 30 min WhatsApp**

**4. Próximos passos (mostrar pro cliente):**

```
HOJE:
- ✅ Estrutura criada
- ✅ 3 skills instaladas
- ✅ 1-2 clientes onboardados

PRÓXIMOS 7 DIAS:
- Onboardar os outros clientes (rodar /cockpit-onboarding pra cada um)
- Gerar dossiê dos outros clientes (rodar /cockpit-dossie pra cada um)
- Usar /cockpit-meta no dia a dia (mínimo 1x por dia pra criar hábito)

EM 7 DIAS:
- Follow-up no WhatsApp
- Avaliar se tá pronto pro Install
```

**5. Push final pro git:**

> "Vou subir essa primeira versão pro teu GitHub. Já te perguntei antes, lembra que deveria ter criado um repositório privado novo?"

Cliente cria repo (ou já tem):
```bash
cd ~/Cockpit
git remote add origin https://github.com/[cliente]/cockpit.git
git branch -M main
git push -u origin main
```

> "Pronto. Backup automático no teu GitHub. Toda mudança que tu fizer, é só `git add . && git commit -m 'msg' && git push`."

**6. Encerramento:**

> "Tem alguma dúvida antes da gente fechar? Lembra: tô no WhatsApp pelos próximos 7 dias. Boas pilotagens."

---

## ✅ Checklist final do Kick

Antes de fechar a chamada, validar:

- [ ] Estrutura `~/Cockpit/` criada com todas pastas
- [ ] `_contexto/agencia.md` preenchido
- [ ] `.env` com `META_APP_ID`, `META_APP_SECRET`, `META_USER_TOKEN`
- [ ] App Meta criado e em modo Live (ou Business Verification em andamento)
- [ ] 3 skills instaladas (`cockpit-onboarding`, `cockpit-dossie`, `cockpit-meta`)
- [ ] 1-2 clientes onboardados na pasta `clientes/`
- [ ] Dossiê do(s) cliente(s) gerado
- [ ] Pelo menos 5 comandos da `cockpit-meta` testados ao vivo
- [ ] Git inicializado e commitado
- [ ] Push pro GitHub do cliente realizado
- [ ] PDF de hand-off gerado
- [ ] Cliente adicionado à comunidade Telegram
- [ ] Follow-up de 7 dias agendado

## Se travar em algum ponto

Anotar onde travou em `~/Cockpit/.cockpit/setup-status.md` com:
- Bloco que travou
- Erro recebido
- Próximo passo quando retomar

Marcar follow-up de 24-48h pra retomar do mesmo ponto.
