# 🎬 AULA 5 — MCP oficial da Meta (Bônus)

**Duração:** ~8 min
**Tipo:** Conceitual + demonstração rápida
**Cena OBS:** Cockpit - Tela + Cam

---

## 🪝 Abertura (30s) — Cena: Só Cam

> "A Meta lançou um MCP oficial. Vale a pena? Depende. Em 8 minutos te mostro a diferença pra skill que tu já tem e quando usar cada um."

---

## 📋 Conteúdo da aula

### Bloco 1 — Skill vs MCP, não é "ou", é "e" (2 min)

**Fala:**
> "Antes de tudo: não é 'usar skill OU usar MCP'. É 'usar os dois'. Cada um faz coisa diferente.
>
> **Skill** = trabalho pesado. Criar campanha, duplicar conjunto, trocar url_tags, gerar insights cruzados. Tudo que tu vai usar todo dia operando tráfego de cliente.
>
> **MCP** = pergunta rápida. 'Gasto hoje', 'quantos leads vieram', 'lista de campanhas ativas'.
>
> Skill é alicate, MCP é canivete. Cada um pra uma coisa.
>
> Minha regra pessoal: começa só com a skill. Quando bater curiosidade simples e tu não quiser carregar a skill, ativa o MCP."

---

### Bloco 2 — Configurar o MCP (3 min) — MOSTRAR

**Fala:**
> "Bora configurar. No VS Code: `Cmd + Shift + P` → 'Claude Code: Open Settings'."

**Cola o JSON na tela:**
```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "@meta/mcp-ads"]
    }
  }
}
```

**Fala:**
> "Cola esse JSON na seção de MCPs. Salva. Reinicia o Claude Code.
>
> Primeira vez que tu rodar uma pergunta de Meta no chat, vai abrir o browser pedindo autorização. Permite. Mesma BM que tu já usou na skill. Pronto."

---

### Bloco 3 — Tabela de quando usar cada um (1,5 min) — MOSTRAR

**Mostra a tabela na tela:**

| Tarefa | Use |
|---|---|
| Gasto rápido, métricas de hoje | MCP |
| Criar campanha completa | Skill |
| Duplicar conjunto + trocar público | Skill |
| Diagnóstico com Health Score | Skill (orquestradora) |
| Trocar url_tags em criativo existente | Skill (MCP não faz) |
| Listar campanhas ativas rápido | Tanto faz |

---

### Bloco 4 — Sinceridade total (1 min)

**Fala:**
> "Te digo a verdade: eu uso 95% skill, 5% MCP. Mas como a Meta tá apostando alto no MCP, vale tu saber configurar. Daqui um tempo isso pode virar padrão.
>
> Por enquanto, a skill ganha de longe pra operação de cliente. MCP é bom só pra perguntas pontuais."

---

## 🎬 Fechamento do curso (1 min) — Cena: Só Cam

> "É isso, mano. Curso beta fechado.
>
> Resumo: tu tem o Claude Code instalado, as duas skills do Cockpit configuradas, a conta do Meta conectada, e o MCP de bônus.
>
> Próximas atualizações chegam no Discord — Google Ads e GA4 estão na fila. Quem comprou o Cockpit recebe sem pagar nada a mais.
>
> Qualquer dúvida, posta no Discord. Bora rodar o Cockpit em conta real e me manda como ficou. Tamo junto."

---

## ⚙️ Cenas OBS sugeridas

| Bloco | Cena |
|---|---|
| Abertura | Só Cam |
| Blocos 1-4 | Tela + Cam |
| Fechamento do curso | Só Cam |

---

## ✅ Checklist antes de gravar

- [ ] OBS na cena correta
- [ ] iPhone + lapela conectados
- [ ] VS Code aberto
- [ ] Settings do Claude Code abertos (pra mostrar onde colar o JSON)
- [ ] JSON do MCP já testado funcionando antes
- [ ] Notificações silenciadas

---

## 💡 Pro tip

**Testa o MCP funcionando ANTES de gravar.** Se a Meta mudou alguma coisa e ele não conecta, tu evita gravar com erro.

**Termina com energia alta.** É o último bloco do curso. Fechamento bom = boca a boca bom = recomendação.
