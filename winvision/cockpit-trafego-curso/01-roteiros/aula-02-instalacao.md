# 🎬 AULA 2 — Instalação do Claude Code (Mac + Windows)

**Duração:** ~12 min
**Tipo:** Prática (muito mostra, pouca fala)
**Cena OBS:** Cockpit - Tela + Cam

**Tutorial paralelo:** `cockpit-trafego-tutoriais.vercel.app/instalacao` — abre na tela durante a aula

---

## 🪝 Abertura (30s) — Cena: Só Cam

> "Vou te guiar nessa instalação como se tu nunca tivesse aberto o terminal na vida. Se travar em algum passo, tem o tutorial visual aberto ao lado em `cockpit-trafego-tutoriais.vercel.app/instalacao`. Bora."

---

## 📋 Parte 1 — MAC (8 min)

### Bloco 1 — Pré-requisito Node.js (2 min)

**Fala:**
> "Antes de instalar o Claude Code no Mac, precisa do Node.js. Se tu nunca mexeu com ferramentas de desenvolvimento, provavelmente não tem. Vai em **nodejs.org/pt** e baixa o instalador macOS."

**O que mostrar:**
1. Browser em `nodejs.org/pt`
2. Clica em "Baixar Node.js"
3. Mostra o `.pkg` baixando
4. Abre, next, next, finish

---

### Bloco 2 — Instalar Claude Code via terminal (2 min)

**Fala:**
> "Agora abre o terminal. `Cmd + Espaço`, digita terminal, enter. Esse aqui é o terminal. Assusta no começo, mas tu vai usar 2 comandos só. Cola esse aqui:"

**Comando 1:**
```
npm install -g @anthropic-ai/claude-code
```

**Fala:**
> "Pressiona Enter. Se pedir senha, é a senha do teu Mac. Confirma com Y se aparecer. Espera baixar."

**Comando 2 (depois que instalar):**
```
claude --version
```

**Fala:**
> "Se aparecer o número da versão, tá instalado."

---

### Bloco 3 — Instalar VS Code (1,5 min)

**Fala:**
> "Agora baixa o VS Code do site oficial: **code.visualstudio.com**. Esse é o editor onde tu vai usar o Claude. Baixa, abre, instala. Se aparecer chat lateral logo de cara, fecha."

**O que mostrar:**
1. Browser em `code.visualstudio.com`
2. Clica em download Mac
3. Abre o `.zip`, arrasta pra Applications
4. Abre o VS Code

---

### Bloco 4 — Instalar extensão Claude Code (1,5 min)

**Fala:**
> "Aqui no VS Code, ícone de extensões na barra lateral esquerda — esses quadradinhos. Busca **Claude Code**. ⚠️ ATENÇÃO: tem fake. Confirma que o autor é **Anthropic**. É a primeira da lista. Install."

**O que mostrar:**
1. Ícone de extensões
2. Busca "Claude Code"
3. **Zoom no nome do autor: Anthropic**
4. Install

---

### Bloco 5 — Autenticar (1 min)

**Fala:**
> "Pra abrir o Claude Code, `Cmd + Shift + P`, digita 'Claude Code', escolhe 'abrir em nova aba'. Vai abrir um painel. Botão azul de autenticar. Abre o browser. Permite o acesso. Volta no VS Code."

**O que mostrar:**
1. `Cmd + Shift + P`
2. Digita "Claude Code"
3. Clica em "abrir em nova aba"
4. Clica no botão azul
5. Browser abre → autoriza
6. Volta no VS Code → tá conectado

---

## 📋 Parte 2 — WINDOWS (3 min) — MAIS RÁPIDO

**Fala:**
> "Pra Windows, é mais fácil ainda. Não precisa de Node.js. Não precisa de terminal."

### Passo 1
Baixa VS Code em `code.visualstudio.com` — next, next, finish.

### Passo 2
No VS Code, ícone de extensões → busca "Claude Code" → confirma autor **Anthropic** → Install.

### Passo 3
`Ctrl + Shift + P` → "Claude Code" → "abrir em nova aba" → botão azul → autentica no browser.

### Passo 4
Manda um "oi" pra testar. Se respondeu, funcionou.

---

## ⚠️ Aviso final — Conta Pro (30s)

**Fala:**
> "Importante: o Claude Code só funciona com conta **Claude Pro** ou superior. São 20 dólares por mês. Sem isso, não roda. Se ainda não tem, assina antes da próxima aula."

---

## 🎬 Fechamento (30s) — Cena: Só Cam

> "Pronto. Tu tá com Claude Code instalado e funcionando. Próxima aula a gente vê o que dá pra fazer com isso na prática, e instala as duas skills do Cockpit. Bora."

---

## ⚙️ Cenas OBS sugeridas

| Bloco | Cena |
|---|---|
| Abertura | Só Cam |
| Toda a instalação | Tela + Cam |
| Aviso final + Fechamento | Só Cam |

---

## ✅ Checklist antes de gravar

- [ ] OBS na cena correta
- [ ] iPhone + lapela conectados
- [ ] **Browser limpo** (sem extensões aparecendo, sem abas pessoais)
- [ ] Aba aberta em `cockpit-trafego-tutoriais.vercel.app/instalacao` (referência paralela)
- [ ] Aba aberta em `nodejs.org/pt`
- [ ] Aba aberta em `code.visualstudio.com`
- [ ] Terminal pronto pra abrir
- [ ] Conta Claude Pro ativa (pra demonstrar autenticação)
- [ ] Notificações silenciadas

---

## 💡 Pro tip

**Grava Mac e Windows em sessões diferentes.** Pra Windows tu vai precisar gravar numa máquina Windows (ou via Parallels/VM).

**Alternativa econômica:** grava só Mac. No Cakto, na descrição da aula, manda quem usa Windows seguir o tutorial em texto da Vercel (`/instalacao`) — funciona perfeito sozinho.
