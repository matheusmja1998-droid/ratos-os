---
name: cockpit-video-bastidor
description: Cria vídeo de bastidor pro Cockpit (Reels/TikTok 1080x1920) usando Remotion. Pega um carrossel já criado em conteudo/cockpit/carrosseis/ ou um tema novo e renderiza em MP4 com identidade visual neon ciano/roxo do Cockpit. Use quando o usuário disser "/cockpit-video-bastidor", "vídeo do Cockpit", "vídeo de bastidor", "transformar carrossel em vídeo", "Reels do Cockpit", "vídeo IA rodando".
---

# Cockpit — Vídeo de Bastidor

Skill que gera vídeo Reels/TikTok (1080x1920) com identidade Cockpit usando Remotion.

## Quando usar

- Usuário quer transformar um carrossel do Cockpit em vídeo pro Instagram/TikTok
- Usuário quer um Reels mostrando "IA rodando" pra falar do Cockpit
- Usuário disse `/cockpit-video-bastidor`, "vídeo de bastidor", "vídeo do Cockpit", "Reels Cockpit"

NÃO usar pra vídeo de cliente da WinVision/LM (Caio, Liso, Fernanda, EV, solar). Essa skill é só pro **Cockpit / Ratos de IA**.

## Onde mora

- **Projeto Remotion:** `conteudo/cockpit/videos/_remotion/`
- **Output dos vídeos:** `conteudo/cockpit/videos/AAAA-MM-DD_slug/video.mp4`
- **Templates disponíveis:** `_remotion/src/templates/Terminal.tsx`, `Carrossel.tsx`, `Chat.tsx`

## Fluxo

### 1. Perguntar a base

> "De onde vem o conteúdo desse vídeo?
> 1. **Carrossel existente** — escolho um de `conteudo/cockpit/carrosseis/` e converto
> 2. **Tema novo** — tu me dá o tema e eu escrevo o roteiro
> 3. **Roteiro pronto** — tu cola o que quer dizer"

Se for opção 1, listar os carrosséis (filtrando os `POSTADO_*` por padrão, mas mostrando todos se o usuário quiser) e pedir pra escolher.

### 2. Perguntar o template

> "Qual template testar?
> 1. **Terminal** — texto de comando aparecendo letra por letra, simulando Claude Code rodando. Bom pra mostrar a stack em ação.
> 2. **Carrossel** — slides em sequência com transição animada. Bom pra adaptar carrossel existente em vídeo.
> 3. **Chat** — bolha de mensagem do usuário + IA digitando + resposta. Bom pra mostrar interação humano/IA."

Se a base for "carrossel existente", recomendar Carrossel mas deixar tu escolher.

### 3. Gerar/extrair conteúdo

Conforme a combinação:

**Base = carrossel existente, template = Carrossel:**
Ler arquivos `.md` ou `slides/` da pasta do carrossel. Extrair título e texto de cada slide. Limitar a 4-6 slides (vídeo curto). Pegar CTA do slide final.

**Base = carrossel existente, template = Terminal ou Chat:**
Ler o carrossel pra entender o tema. Comprimir em uma headline + um prompt de IA + uma resposta curta (Terminal) ou em uma troca de mensagens (Chat). Cuidar pra não passar do limite de caracteres que cabe na tela.

**Base = tema novo:**
Ler `_contexto/preferencias.md` (tom de voz). Escrever roteiro do zero seguindo o template escolhido. Sempre usar o tom direto, falado, sem travessão. Avatar é Gestor Sufocado (gestor de tráfego sobrecarregado).

**Base = roteiro pronto:**
Encaixar o roteiro nos campos do template.

### 4. Mostrar o roteiro antes de renderizar

Antes de chamar o render (que demora 1-3 min), mostrar pro usuário o JSON com os textos:

> "Vai entrar isso no template `[X]`:
>
> ```json
> { ... }
> ```
>
> Quer ajustar algo ou já mando renderizar?"

### 5. Renderizar

Criar pasta de output: `conteudo/cockpit/videos/AAAA-MM-DD_slug/` (data atual + slug curto do tema).

Salvar os props num arquivo JSON: `conteudo/cockpit/videos/AAAA-MM-DD_slug/props.json`

Rodar o render:

```bash
cd "conteudo/cockpit/videos/_remotion" && \
  npx remotion render src/index.ts \
    [Terminal|Carrossel|Chat] \
    "../AAAA-MM-DD_slug/video.mp4" \
    --props="../AAAA-MM-DD_slug/props.json"
```

Mostrar o caminho do arquivo final pro usuário.

### 6. Perguntar próximos passos

> "Pronto, vídeo em `[caminho]`. Quer:
> 1. Ver no player (abre no QuickTime)
> 2. Testar com outro template pra comparar
> 3. Ajustar copy e renderizar de novo
> 4. Tá bom assim"

## Templates — referência rápida

### Terminal
**Props:** `headline`, `prompt`, `response`, `cta`
**Limites de caracteres (pra não estourar a tela):**
- headline: até 70 chars
- prompt: até 60 chars (uma linha de comando)
- response: até 200 chars (4-5 linhas), suporta `\n`
- cta: até 50 chars

### Carrossel
**Props:** `slides` (array de `{titulo, texto}`), `cta`
**Limites:**
- slides: 3 a 6 slides ideais
- titulo: até 50 chars por slide
- texto: até 130 chars por slide
- cta: até 60 chars

### Chat
**Props:** `headline`, `userMsg`, `aiMsg`, `cta`
**Limites:**
- headline: até 60 chars
- userMsg: até 60 chars (sempre minúsculo, estilo prompt)
- aiMsg: até 200 chars
- cta: até 40 chars

## Tom e estilo

Seguir `_contexto/preferencias.md`:
- Direto, falado, "tu"
- Sem travessão
- Frases curtas
- Sem genéricos de IA
- Avatar Gestor Sufocado: gestor de tráfego que tá afogado em planilhas, conta gerenciada, criativo, relatório

Headlines do Cockpit funcionam quando:
- Mostram trabalho economizado ("Como eu monitoro 100 ads em 3 minutos")
- Mostram delegação pra IA ("Eu não gerencio mais ads. A IA gerencia")
- Mostram capacidade nova ("Audita conta inteira em 1 prompt")

## Pré-requisitos (já configurados)

- Node.js, npm, ffmpeg instalados
- Projeto Remotion já existe em `conteudo/cockpit/videos/_remotion/` com `node_modules` instalados
- Se `node_modules/` não existir (clone novo do repo), rodar `cd conteudo/cockpit/videos/_remotion && npm install`

## Validar o projeto Remotion

Se algo der errado no render, primeiro rodar:

```bash
cd "conteudo/cockpit/videos/_remotion" && npx remotion compositions src/index.ts
```

Esse comando lista as 3 composições disponíveis. Se ele falhar, tem problema no código dos templates.

## Preview no Studio (opcional)

Pra ver/ajustar o vídeo no editor visual do Remotion antes de renderizar:

```bash
cd "conteudo/cockpit/videos/_remotion" && npm run dev
```

Abre `http://localhost:3000` com player + form pra editar props ao vivo.

## Convenção de slug e organização

- Pasta: `AAAA-MM-DD_slug-curto`
- Slug: 2-4 palavras separadas por hífen, sem acento
- Exemplo: `2026-05-09_audita-conta-em-1-prompt`
- Status: prefixar com `POSTADO_` quando o vídeo já tiver sido publicado (igual ao padrão dos carrosséis)
