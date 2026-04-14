---
name: carrossel
description: >
  Cria carrosséis completos para o Instagram da WinVision sobre vendas, pré-vendas e SDR.
  Gera roteiro com slides dinâmicos (capa chamativa + cada slide conectando ao próximo),
  cria HTMLs estilizados com a identidade da WinVision e renderiza em PNG via Playwright.
  Use quando o usuário mencionar "carrossel", "carousel", "slides instagram",
  "faz um carrossel", ou pedir pra transformar um tema em carrossel.
---

# /carrossel — Criação de Carrossel WinVision

## Dependências

- **Identidade visual:** `marca/design-guide.md` — LER ANTES de criar qualquer HTML
- **Tom de voz:** `_contexto/preferencias.md`
- **Contexto do negócio:** `_contexto/empresa.md`
- **Playwright CLI:** `npx playwright screenshot` para renderizar HTMLs em PNG. Se nunca usou, rodar uma vez: `npx playwright install chromium`

## Contexto de conteúdo

Os carrosséis são pra conta da WinVision no Instagram. Os temas giram em torno de vendas, pré-vendas e SDR. O público é empreendedores, gestores comerciais e profissionais de vendas B2B.

## Input

O usuário fornece:
- Tema ou ideia (ex: "como estruturar a prospecção ativa", "o erro mais comum do SDR")
- Foto pra capa (opcional)

---

## Workflow em 3 Fases

### Fase 1 — Roteiro

1. Ler `_contexto/preferencias.md` pra calibrar o tom
2. Definir o ângulo: educacional, contrário, provocativo, oportunidade ou bastidores
3. Escrever 8-10 slides seguindo o fluxo:
   - **Slide 1 (Capa):** 3 opções de título (max 8 palavras, chamativo, gera curiosidade) + subtítulo — o usuário escolhe antes de continuar
   - **Slides 2-3 (Contexto):** por que esse tema importa agora
   - **Slides 4-7 (Desenvolvimento):** um insight por slide, opinião clara, cada slide termina deixando o leitor querendo o próximo
   - **Slide 8-9 (Implicação):** o que isso muda na prática pra quem lê
   - **Slide final (CTA):** chamada pra ação + branding WinVision

**Tom:**
- Informal e direto, como se estivesse conversando
- Frases naturais (2-4 por slide), sem bullet points disfarçados
- Sem travessão (—)
- Curiosity gap entre slides: cada slide entrega valor mas deixa gancho pro próximo
- Sem linguagem corporativa

4. Salvar roteiro em `winvision/conteudo/carrosseis/YYYY-MM-DD_[tema]/roteiro.md`

**CHECKPOINT:** mostrar roteiro completo + 3 opções de capa. Esperar o usuário escolher e aprovar antes de seguir.

---

### Fase 2 — Visual (HTMLs + PNGs)

1. Ler `marca/design-guide.md` — identidade WinVision:
   - Fundo: #080808
   - Destaque: #00E878
   - Texto: #FFFFFF
   - Fonte: Plus Jakarta Sans (Google Fonts)

2. Criar HTMLs (1080x1350px, inline CSS, Google Fonts como única dependência externa)

**Padrão visual:**
- Fundo escuro (#080808) com destaque em verde (#00E878)
- Tipografia Plus Jakarta Sans em todas as variações de peso
- Variação de layout entre slides: não fazer todos iguais — misturar texto simples, destaque com frase grande, número em evidência, citação em destaque
- Slide 1 (capa): título grande, impactante, chamativo — pode usar verde como cor de destaque na palavra-chave
- Slide final: só branding e CTA, sem texto longo. Se tiver logo em `marca/`, incluir com largura entre 120-200px

3. Salvar HTMLs em `winvision/conteudo/carrosseis/YYYY-MM-DD_[tema]/instagram/`

4. Renderizar slide 1 primeiro:
   ```bash
   npx playwright screenshot --viewport-size=1080,1350 --full-page "file:///caminho/absoluto/slide-01.html" "slide-01.png"
   ```

**CHECKPOINT:** mostrar slide 1. Se aprovado, renderizar os demais.

5. Renderizar todos os slides e salvar PNGs na mesma pasta.

---

### Fase 3 — Versão TikTok (opcional)

Após finalizar, perguntar:
> "Quer a versão TikTok também? (formato vertical 1080x1920)"

Se sim:
- Adaptar os HTMLs: height 1920px, ajustar padding e fonte
- Renderizar com `--viewport-size=1080,1920`
- Salvar em `winvision/conteudo/carrosseis/YYYY-MM-DD_[tema]/tiktok/`

---

## Estrutura de saída

```
winvision/conteudo/carrosseis/YYYY-MM-DD_[tema]/
  roteiro.md
  instagram/
    slide-01.html + slide-01.png
    slide-02.html + slide-02.png
    ...
  tiktok/ (se solicitado)
    slide-01.html + slide-01.png
    ...
```

## Regras

- Texto aprovado na Fase 1 não muda na Fase 2
- Sempre mostrar slide 1 antes de renderizar os demais
- Se pedir ajuste no visual, editar o HTML e re-renderizar só o slide alterado
- Sem travessão (—) no texto
- Cada carrossel vai pra sua própria pasta com a data no nome
