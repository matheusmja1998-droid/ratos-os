# Como colar a LP do Cockpit Tráfego no Elementor

## Arquivos prontos pra copiar

Na pasta `winvision/cockpit-trafego/` tu tem:

- `elementor-1-head.html` — Google Fonts + CSS (vai no `<head>` do site)
- `elementor-2-body.html` — markup da LP (vai no widget HTML do Elementor)
- `elementor-3-footer.html` — JS (vai no `<footer>` do site)
- `index.html` — versão completa pra preview no Chrome

---

## Passo a passo

### 1. Instala o plugin WPCode (gratuito)
WP Admin → Plugins → Adicionar Novo → busca "WPCode" → Instala e ativa.

### 2. Cria a página
WP Admin → Páginas → Adicionar Nova
- Título: "Cockpit Tráfego"
- Permalink: `/cockpit-trafego`
- Clica "Editar com Elementor"

### 3. Configura o template
No Elementor:
- Engrenagem (canto inferior esquerdo) → Configurações da página → Layout da Página
- Escolhe **"Elementor Canvas"** (remove header/footer do tema)

### 4. Cola o HTML
No painel de widgets, arrasta o widget **"HTML"** pro canvas.

Abre `elementor-2-body.html`, copia tudo, cola no widget.

### 5. Cola o CSS + Fontes no header
WPCode → Header & Footer (ou Code Snippets → Header)

Abre `elementor-1-head.html`, copia tudo, cola no campo **"Header"**.

**Importante:** restringe pra rodar só nessa página
- Em "Conditional Logic" do WPCode (versão Pro) ou edita o snippet pra checar a URL com JS simples
- Se for versão gratuita do WPCode sem conditional, cola direto. CSS scope evita conflito porque tudo usa classes específicas (`.hero`, `.skill`, etc.)

### 6. Cola o JS no footer
WPCode → Header & Footer → campo **"Footer"**

Abre `elementor-3-footer.html`, copia tudo, cola.

### 7. Salva, publica, testa
- Clica "Publicar" no Elementor
- Abre `https://teudominio.com.br/cockpit-trafego` no celular e desktop

---

## Ajustes que vai precisar fazer depois

### Botão de checkout
Os botões CTA estão apontando pra `#oferta` (link âncora interno). Quando tiver o link do Kiwify/Hotmart, edita no widget HTML do Elementor:

Procura por: `href="#oferta"` e troca pelo link do checkout, ex: `href="https://pay.kiwify.com.br/SEUSLUG"`

Tem 4 botões CTA:
1. Nav (mobile mostra "Ver preço" que pode ficar como âncora pro card)
2. Hero ("QUERO O COCKPIT · R$67")
3. Card de oferta ("QUERO O COCKPIT AGORA")
4. CTA final ("QUERO ENTRAR NA CABINE · R$67")
5. Sticky CTA mobile

Os 3, 4 e 5 vão pro checkout. O do hero e o "Ver preço" da nav podem continuar como âncora pra rolar até o card.

### Depoimentos
Os 3 cards de depoimento estão com placeholder `[NOME DO GESTOR]`. Quando coletar, edita o widget HTML direto.

### Links do footer
Termos, Política e Contato estão como `href="#"`. Aponta pra páginas reais quando criar.

---

## Se der problema

**Fontes não carregam:**
Confere se o `<link>` do Google Fonts foi pro `<head>` (com o WPCode, vai no campo Header). Se ainda der erro, cola direto dentro do widget HTML do Elementor antes do `<style>`.

**CSS quebra outras páginas do site:**
Move o CSS pra dentro do widget HTML do Elementor (envolto em `<style>...</style>`). Aí ele só carrega nessa página.

**Sticky CTA mobile não aparece:**
Confere se o JS foi pro footer. Se o tema tem cache, limpa o cache (Litespeed, W3 Total Cache, etc.).

**Espaço estranho no topo:**
O tema do WordPress pode estar injetando padding. Solução: usar Elementor Canvas (passo 3) ou adicionar no início do CSS:
```css
body { margin: 0; padding: 0; }
.elementor-section { padding: 0 !important; }
```
