# 🎬 AULA 4 — Conectando o Meta Ads (via chat)

**Duração:** ~18 min ⚠️ A MAIS IMPORTANTE
**Tipo:** Setup técnico passo a passo
**Cena OBS:** Cockpit - Tela + Cam

**Tutorial paralelo:** `cockpit-trafego-tutoriais.vercel.app/meta-ads`

---

## 🪝 Abertura (1 min) — Cena: Só Cam

> "Essa aula é a mais longa do curso. 18 minutos. Mas presta atenção: tu faz UMA VEZ. Depois disso, qualquer cliente novo é só compartilhar a conta de anúncios via parceria entre BMs, em 30 segundos. Então segura aqui, faz comigo, vamos."

---

## 📋 Antes de começar (1 min)

**Fala:**
> "Esse é o backup visual: `cockpit-trafego-tutoriais.vercel.app/meta-ads`. Se tu se perder, abre essa página ao lado. Vou seguir os 12 passos dela aqui."

**O que fazer:** abre a página do tutorial num monitor secundário ou aba ao lado.

---

## Bloco 1 — Arquitetura: por que NÃO criar App na BM do cliente (1,5 min)

**Fala:**
> "Antes de criar qualquer coisa, regra crítica: NUNCA cria App na BM do cliente.
>
> Risco 1: perde o cliente → perde o App → tem que refazer tudo.
> Risco 2: BM com 1 admin só → perfil cai → BM trancada.
>
> Regra: cria o App numa BM com **3+ admins humanos** (perfis de contingência). No meu caso, eu uso uma BM exclusiva pra isso. Não fica em nenhum cliente."

---

## Bloco 2 — Criar App no Meta Developers (3 min)

**Fala (passo 1):**
> "Vai em **developers.facebook.com**. Faz login com a conta do Facebook que vai administrar o App. Aqui em cima, **My Apps** → **Create App**."

**Fala (passo 2):**
> "Caso de uso: **Other**. Avançar.
> Tipo: **Business**. Avançar.
> Nome: descritivo, ex 'Cockpit [Tua Agência]'.
> Email: o teu.
> Portfólio comercial: a **BM dona do App**. Submit.
> Senha do FB. Pronto, App criado."

**O que mostrar:** todo o fluxo de criação na tela.

---

## Bloco 3 — Adicionar Marketing API (1 min)

**Fala:**
> "Dentro do App, menu lateral → **Add Product**. Procura **Marketing API** → **Set Up**. Pronto, Marketing API habilitada."

---

## Bloco 4 — Gerar System User Token (4 min) — A PARTE CRÍTICA

**Fala:**
> "Agora a parte que não pode errar: gerar o token.
>
> Vai em **business.facebook.com/settings**. Confirma que tu tá na BM certa (a dona do App).
>
> Menu lateral: **Usuários** → **Usuários do Sistema** → **Adicionar**.
> Nome: 'Claude Code'.
> Função: **Admin**.
> Criar.
>
> Clica no usuário criado → **Gerar Novo Token**.
> Seleciona o App que tu criou.
> Permissões: marca SÓ duas — **ads_management** e **ads_read**.
> Generate Token."

**Fala (importante):**
> "⚠️ ATENÇÃO: o token aparece UMA VEZ SÓ. Copia agora. Se perder, tem que gerar outro.
>
> Por que System User Token e não User Token? User Token expira em 60 dias e tá amarrado ao teu perfil pessoal do Facebook. Se cair, morre. System User Token não expira e fica preso na BM. Mesmo que teu perfil pessoal seja banido, ele continua funcionando."

---

## Bloco 5 — Colar token no Claude (1,5 min)

**Fala:**
> "Volta no VS Code. Abre o Claude Code. Digita:"

```
/cockpit-meta-ads setup
```

**Fala:**
> "Ele vai te perguntar o token. Cola. Próxima pergunta: App ID. Pra pegar isso, volta em developers.facebook.com → Configurações Básicas do App → copia o **App ID**. Cola no Claude. Pronto."

---

## Bloco 6 — Compartilhar conta de cliente via parceria (3 min)

**Fala:**
> "Agora a parte de cada cliente. Pra cada um, tu precisa compartilhar a conta de anúncios com a BM dona do App.
>
> Vai em **business.facebook.com** → troca pra **BM do cliente** → **Usuários** → **Parceiros** → **+ Adicionar**.
> Cola o ID da BM dona do App (peguei lá nas configurações da BM).
> Marca: 'BM atua como agência' + 'BM veicula anúncios'.
> Atribuir ativos → **Contas de anúncios** → marca a conta → **Controle total**.
> Salvar."

**Fala (importante):**
> "Se tu não é admin da BM do cliente, fica aguardando aprovação dele. Manda o ID e pede pra liberar."

---

## Bloco 7 — Validar (2 min) — RODA AO VIVO

**Fala:**
> "Pronto. Hora de testar. No Claude Code:"

```
/cockpit-meta-ads listar contas
```

**Fala:**
> "Apareceu a lista de contas? Funcionando. Se não apareceu, volta no passo 6 e confirma que **a conta de anúncios especificamente** foi compartilhada como ativo. Parceria genérica entre BMs não compartilha conta — só Instagram costuma vir junto."

---

## 🎬 Fechamento (1 min) — Cena: Só Cam

> "Pronto. Tu acabou de conectar. Agora roda um `/cockpit diagnostico [cliente]` no chat e vê o que sai. Em 5 minutos tu tem o diagnóstico completo da conta. Sem abrir Gerenciador.
>
> Próxima aula é o bônus: o MCP oficial da Meta. Quando vale a pena usar junto com a skill. Bora."

---

## ⚙️ Cenas OBS sugeridas

| Bloco | Cena |
|---|---|
| Abertura | Só Cam |
| Blocos 1-7 | Tela + Cam |
| Fechamento | Só Cam |

---

## ✅ Checklist antes de gravar

- [ ] OBS na cena correta
- [ ] iPhone + lapela conectados
- [ ] BM de contingência criada (com 3+ admins)
- [ ] Browser limpo (logado na conta certa do Facebook)
- [ ] Aba 1: `developers.facebook.com`
- [ ] Aba 2: `business.facebook.com/settings`
- [ ] Aba 3: tutorial `cockpit-trafego-tutoriais.vercel.app/meta-ads` (referência)
- [ ] VS Code aberto, skill `cockpit-meta-ads` instalada
- [ ] Cliente teste pronto (Caio ou outro) com permissões configuradas
- [ ] **Token de teste pronto pra criar AO VIVO** (mais didático que mostrar pronto)

---

## 💡 Pro tip

**Faz o passo 1-7 inteiro 1x antes de gravar.** Confirma que tudo funciona. Aí refaz na gravação. Se der erro na hora, sabe imediatamente onde tá o problema.

**Se algum passo demorar a carregar (criar App leva uns segundos),** corta no edit. Não fica esperando em silêncio na frente da câmera.
