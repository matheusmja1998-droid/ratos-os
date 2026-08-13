# Guia de Design

> Você pode editar esse arquivo a qualquer momento.
> As skills de carrossel, proposta e slide leem este arquivo antes de criar qualquer visual.

---

## WinVision

### Cores

- **Cor de destaque / CTA:** #00E878 (verde)
- **Cor de apoio:** #8DFFC8 (verde claro)
- **Fundo principal:** #080808 (preto)
- **Texto principal:** #FFFFFF (branco)
- **Cor proibida:** vermelho, tons terrosos

### Tipografia

- **Títulos e destaques:** Plus Jakarta Sans
- **Corpo, subtítulos e botões:** Plus Jakarta Sans
- **Peso do título:** Bold (700) ou ExtraBold (800)

### Estilo geral

Clean, moderno, dark mode. Destaque em verde. Sem ornamentos excessivos.

### Elementos-chave

- Bordas: finas ou sem borda
- Border-radius dos cards: 8-12px
- Botões: fundo verde #00E878, texto preto, sem borda
- Sombras: leves ou nenhuma

### O que NUNCA fazer

Fundo branco em materiais da WinVision. Fontes serifadas. Excesso de cores.

### Logo

- **Arquivo:** *(jogar em marca/ e atualizar aqui)*
- **Versão pra fundo escuro:** *(se tiver — ex: marca/winvision-logo-branco.png)*
- **Onde usar:** slide final do carrossel (CTA), header de propostas, slides de apresentação
- **Tamanho sugerido:** largura entre 120-200px nos HTMLs

---

## Cockpit (Ratos de IA)

Identidade visual do conteúdo de venda da stack Cockpit. Vibe: tech, futurista, IA aplicada a tráfego. Inspiração: thumbs de canal de IA, glassmorphism, neon.

### Cores

- **Fundo principal:** #0A0A0F (preto profundo, levemente azulado)
- **Fundo secundário:** #12121A (cards, blocos)
- **Primária neon:** #00D9FF (ciano elétrico — destaque principal, CTA, números)
- **Secundária neon:** #B026FF (roxo/magenta — acento, gradientes)
- **Glow accent:** #6B2FFF (roxo profundo pra halos e bordas brilhantes)
- **Texto principal:** #FFFFFF
- **Texto secundário:** #A8A8B8 (cinza azulado)
- **Texto destaque:** #00D9FF

### Gradientes assinatura

- **Linha/borda neon:** `linear-gradient(90deg, #00D9FF 0%, #B026FF 100%)`
- **Halo de fundo:** `radial-gradient(circle, rgba(176,38,255,0.25) 0%, transparent 70%)`
- **Glow de elemento:** `box-shadow: 0 0 40px rgba(0,217,255,0.5), 0 0 80px rgba(176,38,255,0.3)`

### Tipografia

- **Títulos:** Bricolage Grotesque (Bold/ExtraBold) — pesada, geométrica, futurista
- **Corpo:** Inter ou Plus Jakarta Sans (Regular/Medium)
- **Números/dados:** JetBrains Mono ou Space Grotesk (peso médio, monoespaçada pra prints de stack)

### Estilo geral

Dark mode profundo. Glow neon nas bordas e elementos importantes. Glassmorphism em cards (background blur + transparência). Ícones em outline com efeito glow. Linhas finas brilhantes conectando elementos (efeito "circuito"). Sem cores quentes, sem tons terrosos, sem fundo claro.

### Elementos-chave

- **Bordas neon:** 1-2px com gradiente ciano→roxo
- **Border-radius:** 12-20px (cards), 999px (botões e badges)
- **Cards glass:** `background: rgba(18,18,26,0.6); backdrop-filter: blur(20px); border: 1px solid rgba(0,217,255,0.2)`
- **Botões CTA:** fundo ciano #00D9FF, texto preto #0A0A0F, glow ao redor
- **Ícones:** outline (Lucide ou Phosphor), cor #00D9FF com glow sutil
- **Linhas conectoras:** 1px, gradiente neon, opacity 0.6

### O que NUNCA fazer

Fundo claro. Cores quentes (laranja, vermelho, amarelo). Tipografia serifada. Visual flat sem glow. Ícones preenchidos sólidos. Stock photos genéricas.

### Quando usar

Todo conteúdo do Cockpit (carrosséis, reels, thumbs de vídeo, capa de pauta, posts no LinkedIn sobre a stack). NÃO usar essa identidade em conteúdo de cliente da WinVision/LM — esses seguem identidade própria.

---

## L.M Agência

### Cores

*(Preencher quando definido)*

- **Fundo principal:**
- **Cor de destaque / CTA:**
- **Texto principal:**

### Tipografia

*(Preencher quando definido)*

### Logo

- **Arquivo:** *(jogar em marca/ e atualizar aqui)*
- **Onde usar:** propostas e materiais da L.M

---

## Perfil do autor

- **Nome:** Matheus Jardim
- **Handle:** @matheuscom.ia
- **Foto:** marca/foto-perfil.jpg (não adicionada ainda)
- **Badge verificado:** não

---

## Observações adicionais

Quando a tarefa não especificar qual agência, usar identidade da WinVision como padrão.

**Exceção:** se o conteúdo for do **Cockpit** (Ratos de IA) — qualquer carrossel/reels/post/material salvo em `conteudo/cockpit/` ou que mencione Cockpit, Ratos de IA, Gestor Sufocado, Guardião, Cockpit Report, Cockpit Track, Cockpit Debrief, Claude Code aplicado a tráfego — usar a identidade **Cockpit** (paleta neon ciano/roxo definida acima).
