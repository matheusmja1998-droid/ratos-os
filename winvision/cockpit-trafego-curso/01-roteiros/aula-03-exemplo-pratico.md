# 🎬 AULA 3 — Exemplo prático + as 2 skills do Cockpit

**Duração:** ~12 min
**Tipo:** Demonstração ao vivo
**Cena OBS:** Cockpit - Tela + Cam

---

## 🪝 Abertura (45s) — Cena: Só Cam

> "Eu testei MCP da Meta. Testei MCP do Google. Testei ferramenta de terceiro. Tudo travava em algum lugar. Por isso fiz as duas skills do Cockpit. Em 12 minutos te mostro o que elas fazem e a gente roda um diagnóstico real ao vivo aqui."

---

## 📋 Conteúdo da aula

### Bloco 1 — Por que skills e não MCP (2 min)

**Fala:**
> "Antes de qualquer coisa: por que skill e não MCP?
>
> MCP é genérico. Skill é específica do teu trabalho.
> MCP fica fora do teu controle. Skill tá na tua pasta — tu edita.
> MCP gasta contexto carregando coisa que tu não usa. Skill carrega só o necessário.
> Bota assim: MCP é canivete. Skill é alicate. Cada um pra uma coisa."

---

### Bloco 2 — Cockpit Meta-Ads, a executora (2,5 min) — MOSTRAR

**Fala:**
> "A primeira skill é a **cockpit-meta-ads**. Essa é a executora. É quem aperta o botão na conta do Meta."

**O que fazer:**
1. Abre o arquivo `SKILL.md` da `cockpit-meta-ads`
2. Mostra rapidamente: descrição, comandos, tabela de operações
3. Aponta: "Lê campanhas, conjuntos, anúncios, criativos. Cria, edita, pausa, duplica."
4. Mostra a tabela de comandos disponíveis

**Continua falando:**
> "Quando tu pede algo OPERACIONAL — `pausa esse conjunto`, `duplica essa campanha`, `troca a url_tag desse criativo` — é ela quem faz."

---

### Bloco 3 — Cockpit Orquestradora, o cérebro (3 min) — MOSTRAR

**Fala:**
> "A segunda skill é a **cockpit-orquestradora-anuncios**. Ela não executa. Ela ANALISA."

**O que fazer:**
1. Abre o `SKILL.md` da orquestradora
2. Mostra a descrição
3. Aponta o comando: `/cockpit diagnostico [cliente]`

**Continua falando:**
> "Ela usa benchmarks brasileiros do mercado. Aplica Quality Gates. Calcula Health Score. Detecta o que tá fora do bench. E o melhor: dá recomendações específicas, com número."

---

### Bloco 4 — Health Score na prática (3 min) — RODAR AO VIVO

**Fala:**
> "Bora ver rodando. Vou pedir o diagnóstico de um cliente real aqui."

**O que fazer:**
1. Abre o chat do Claude Code
2. Digita:

```
faz o diagnóstico do Caio
```

3. **Espera carregar** (mostra o "pensando" pra criar antecipação)
4. Aponta a saída: Health Score, KPIs, anomalias, recomendações

**Fala enquanto mostra:**
> "Olha o que ela traz: Health Score 82 sobre 100, nota B. CPA tá em R$38, abaixo do bench de R$45. CTR tá 2,14%, acima do bench. ROAS 3,8x. E aqui ela já manda 2 ações: escalar a campanha de conversão em 25% e renovar 2 criativos em 16 dias.
>
> Isso aí em 5 minutos. Antes eu fazia em 1 hora abrindo Gerenciador."

---

### Bloco 5 — O que ainda não tem (honestidade total) (1 min)

**Fala:**
> "Sinceridade total: essa é a versão beta. Hoje só Meta Ads. Google Ads e GA4 entram na fase 2. Vou duplicar essas skills pra eles e mandar pra ti.
>
> E tu não paga nada a mais. Quem comprou o Cockpit tem **atualização vitalícia**. Quando ficar pronto, chega no Discord. Sem cobrança extra. É o combinado."

---

## 🎬 Fechamento (30s) — Cena: Só Cam

> "Próxima aula a gente conecta a tua conta do Meta na skill. É a aula mais longa do curso, **18 minutos**, mas é uma vez só. Depois disso tu adiciona conta nova de cliente em 30 segundos. Bora."

---

## ⚙️ Cenas OBS sugeridas

| Bloco | Cena |
|---|---|
| Abertura | Só Cam |
| Blocos 1-4 | Tela + Cam |
| Bloco 4 (rodando ao vivo) | Tela + Cam (foca no chat) |
| Bloco 5 + Fechamento | Só Cam |

---

## ✅ Checklist antes de gravar

- [ ] OBS na cena correta
- [ ] iPhone + lapela conectados
- [ ] VS Code aberto na pasta `Ratos OS`
- [ ] Pasta `.claude/skills/cockpit-meta-ads/` aberta com `SKILL.md` visível
- [ ] Pasta `.claude/skills/cockpit-orquestradora-anuncios/` aberta com `SKILL.md` visível
- [ ] Cliente real configurado pra rodar diagnóstico ao vivo (Caio ou outro)
- [ ] Skill já testada antes (pra não dar pau na hora)
- [ ] Notificações silenciadas

---

## 💡 Pro tip

**Roda o `/cockpit diagnostico [cliente]` ANTES de gravar.** Confirma que:
1. Funciona
2. Não dá erro
3. A saída tá bonita e tem dado de verdade

Se der erro, corrige. Não grava com bug ao vivo. Refaz o teste com `/cockpit diagnostico [cliente]` no início da gravação.
