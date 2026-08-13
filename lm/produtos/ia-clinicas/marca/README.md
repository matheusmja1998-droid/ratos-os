# Marca — Facilita AI

Nome do produto: **Facilita AI** (SaaS de atendimento por IA no WhatsApp pra clínicas).

## Logo
Símbolo: cruz médica formando as letras "F" + "P", com um brilho de 4 pontas (IA), em degradê de verde.
Wordmark: "Facilita" em verde-escuro + "AI" em verde-claro.

Arquivo da logo:
- Original: `marca/WhatsApp Image 2026-07-09 at 09.16.48.jpeg` (horizontal, fundo branco)
- Em uso no app: `public/facilita-ai-logo.jpeg` (renderizada no login e na sidebar via `<img>`)

Ícone (só o símbolo): `marca/facilita-ai-icone.jpeg` → favicon do app em
`app/icon.png` (512px) + `app/apple-icon.png` (180px, iOS). O Next serve
automaticamente como favicon.

TODO quando tiver versão melhor: exportar PNG com fundo TRANSPARENTE (o jpeg atual
tem fundo branco, por isso na sidebar fica num box branco arredondado).

## Paleta (verde)
- Verde-claro (destaque / "AI"): `#6cc24a` / `#84cc16`
- Verde-médio (símbolo): `#16a34a`
- Verde-escuro (wordmark "Facilita"): `#166534` / `#14532d`
- Fundo: branco

## Onde a marca aparece no código
- `app/login/page.tsx` — ✚ Facilita AI (verde)
- `app/painel/Sidebar.tsx` — marca do menu (verde)
- `app/layout.tsx` — title "Facilita AI — Painel"
