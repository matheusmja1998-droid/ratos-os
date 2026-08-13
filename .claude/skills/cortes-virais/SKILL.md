---
name: cortes-virais
description: Pega um vídeo longo (reunião, podcast, aula, call do Fathom) e gera 5-10 cortes virais verticais (9:16, Reels/TikTok) com legenda animada. Recebe MP4 + transcrição (.txt/.vtt/.srt do Fathom), Claude analisa a transcrição e propõe os melhores momentos, depois ffmpeg corta e Remotion legenda. Use quando o Matheus disser "/cortes-virais", "faz cortes desse vídeo", "tira cortes virais", "vídeo de 30min, cortar", "tira reels disso", "cortes pro TikTok".
---

# Cortes Virais

Pipeline pra transformar vídeo longo em cortes verticais prontos pra postar.

## Quando usar

- Matheus disser `/cortes-virais`, "faz cortes desse vídeo", "tira reels disso", "cortes pro TikTok de [vídeo]"
- Tiver MP4 longo (reunião, podcast, aula) + transcrição
- Output esperado: 5-10 cortes de 30-60s em 9:16 (1080x1920), com legenda

## Inputs obrigatórios

1. **MP4 do vídeo longo** — path local
2. **Transcrição** — arquivo `.txt`, `.vtt` ou `.srt` exportado do Fathom (com timestamps de preferência)

Se o Matheus mandar só MP4 sem transcrição, rodar a skill `transcribe` antes pra gerar.

## Fluxo

### 1. Setup do projeto

Confirmar slug do vídeo (curto, kebab-case) e criar pasta:

```
conteudo/cortes-virais/AAAA-MM-DD_<slug>/
  ├── source.mp4         # link simbólico ou cópia do MP4 original
  ├── transcript.vtt     # transcrição com timestamps
  ├── cortes.json        # propostas do Claude (start, end, titulo, legenda, justificativa)
  ├── aprovados.json     # subset que o Matheus aprovou
  └── output/            # MP4s finais
```

### 2. Análise da transcrição

Ler a transcrição completa. Identificar 8-12 momentos candidatos a viral seguindo esses critérios:

- **Gancho forte** — frase que para o scroll nos primeiros 3s ("o erro que 90% comete", "ninguém te conta isso", "olha o que aconteceu quando...")
- **Insight contraintuitivo** — algo que contradiz senso comum
- **História curta com payoff** — case rápido com começo/meio/fim
- **Número/dado de impacto** — "investi 100k e perdi tudo", "subiu 400%"
- **Frase de bordão** — algo que cabe como quote isolado
- **Contradição/tensão** — "todo mundo diz X mas a verdade é Y"

**Evitar:**
- Trechos com muito "né", "tipo", muletas
- Contexto sem payoff
- Cortes que dependem de conteúdo de antes pra fazer sentido
- Trechos com pausas longas ou cross-talk

### 3. Proposta

Gerar `cortes.json` no formato:

```json
[
  {
    "id": 1,
    "start": "00:04:32",
    "end": "00:05:18",
    "duracao_s": 46,
    "titulo": "O erro que mata 90% dos lançamentos",
    "legenda_post": "Bora ser sincero: a maioria...",
    "justificativa": "Frase de gancho forte aos 4:32, payoff aos 5:10 com número de impacto",
    "hook_visivel": "primeira frase do corte"
  }
]
```

Apresentar pro Matheus em formato tabela enxuta (id, tempo, título, justificativa em 1 linha) e perguntar quais aprovar. Aceitar respostas tipo "1,3,5,7" ou "todos menos o 2".

### 4. Corte com ffmpeg

Pra cada corte aprovado:

```bash
# Corte + crop center 9:16 + escala 1080x1920
ffmpeg -ss <start> -to <end> -i source.mp4 \
  -vf "crop=ih*9/16:ih,scale=1080:1920" \
  -c:v libx264 -preset fast -crf 20 \
  -c:a aac -b:a 128k \
  output/<id>_<slug>.mp4
```

Se a câmera tá num lado da tela, ajustar o `crop` (ex: `crop=ih*9/16:ih:(iw-ih*9/16)/2-200:0` desloca pra esquerda). Perguntar pro Matheus se o crop center não pegou bem.

### 5. Legenda animada (Remotion)

Pra cada corte aprovado, gerar legenda word-by-word usando o template `Legenda` em `conteudo/cortes-virais/_remotion/`.

Props que Remotion espera:
```json
{
  "videoSrc": "/abs/path/output/1_slug.mp4",
  "palavras": [
    {"texto": "Bora", "start": 0.0, "end": 0.3},
    {"texto": "ser", "start": 0.3, "end": 0.5}
  ],
  "titulo": "O erro que mata 90% dos lançamentos"
}
```

As palavras vêm da transcrição .vtt filtradas pelo range do corte. Se a transcrição não tiver timestamp por palavra (Fathom dá por frase), usar `whisper` local ou aproximar dividindo o tempo da frase pelo número de palavras.

Renderizar:
```bash
cd conteudo/cortes-virais/_remotion
npx remotion render src/index.ts Legenda \
  ../AAAA-MM-DD_<slug>/output/<id>_final.mp4 \
  --props=../AAAA-MM-DD_<slug>/props/<id>.json
```

### 6. Entrega

Listar pro Matheus os MP4s gerados com path e título. Perguntar se quer:
- Gerar copy de legenda pra post (Instagram + TikTok)
- Renderizar mais cortes da lista original
- Ajustar crop/legenda de algum

## Setup do Remotion (primeira vez)

Se `conteudo/cortes-virais/_remotion/` ainda não tiver `package.json`, copiar a base do `conteudo/cockpit/videos/_remotion/` e adicionar template `Legenda.tsx` (composition vertical 1080x1920 que sobrepõe `<OffthreadVideo>` com texto animado word-by-word centralizado embaixo).

## REGRA OBRIGATÓRIA: ACENTUAÇÃO

**SEMPRE escrever títulos, bastidores e textos com acentuação correta em português.** Não usar versão sem acento "por segurança da fonte" — Inter Black suporta acentos perfeitamente.

Exemplos certos:
- ✅ "Nada é mais caro do que contratar errado"
- ✅ "MÃO DE OBRA QUALIFICADA"
- ✅ "GESTÃO / CULTURA / LIDERANÇA"
- ❌ "Nada e mais caro..." / "MAO DE OBRA" / "GESTAO"

Antes de chamar render, **revisar TODOS os textos do JSON pra garantir acentos corretos**.

## INTEGRAÇÃO COM GOOGLE DRIVE

Conta: `matheus@mjta.com.br` via rclone remote `gdrive-mjta`

### Estrutura oficial (atualizada 2026-05-13)

Segue o padrão geral de nomenclatura do Matheus: `NN - [CATEGORIA] - Resumo`. Cada nível conta do `01` independente. A data fica embutida no resumo das pastas de gravação e vídeo pra preservar ordenação cronológica.

```
01 - [CONTEÚDO] - Produção de Conteúdo/
├── 01 - [PERFIL] - @eumatheusj/                              ← vendas/solar/Ivaio
│   └── 01 - [GRAVAÇÃO] - AAAA-MM-DD slug-da-gravacao/
│       ├── fathom_*.mp4                                      ← bruto (sobe e apaga local)
│       ├── fathom_*.vtt
│       ├── fathom_*.words.json
│       ├── fathom_*.txt
│       ├── 01 - [VÍDEO] - AAAA-MM-DD Título do vídeo/
│       │   ├── 01_<slug>-COMPLETO.mp4                        ← corte + bastidor
│       │   ├── 01_<slug>.mp4                                 ← corte sem bastidor
│       │   └── 01_bastidor.mp4                               ← bastidor isolado
│       ├── 02 - [VÍDEO] - AAAA-MM-DD Título do vídeo/
│       │   └── ...
│       └── (uma pasta por vídeo)
│
└── 02 - [PERFIL] - @matheuscomia/                            ← Cockpit/IA/agência
    └── (mesma estrutura)
```

**Como decidir o perfil:**
- `@eumatheusj` — conteúdo de vendas B2B, energia solar, gestão comercial, infoprodutos
- `@matheuscomia` — Cockpit, IA pra tráfego, bastidor da WinVision/L.M, agência

**Nomes de pasta:**
- Gravação: `NN - [GRAVAÇÃO] - AAAA-MM-DD slug-kebab-case` (ex: `01 - [GRAVAÇÃO] - 2026-05-12 r1-joao-solar-londrina`)
- Vídeo: `NN - [VÍDEO] - AAAA-MM-DD Título legível em PT` (ex: `01 - [VÍDEO] - 2026-05-12 Nada é mais caro do que contratar errado`)
- Número com 2 dígitos pra ordenar dentro do nível
- Título completo com acentos
- Arquivos dentro mantêm slug kebab-case (técnico)

### Upload incremental: SOBE A CADA VÍDEO PRONTO (não esperar todos)

**Regra:** Assim que UM vídeo individual (corte + bastidor + COMPLETO) estiver renderizado e aprovado pelo Matheus, **subir IMEDIATAMENTE pro Drive** na pasta `NN - Título` correspondente. Não acumular pra depois.

Fluxo por vídeo aprovado:

```bash
PERFIL="@eumatheusj"                    # ou @matheuscomia
PERFIL_NUM="01"                         # 01=@eumatheusj, 02=@matheuscomia
GRAVACAO_NUM="01"                       # número da gravação dentro do perfil
DATA_GRAVACAO="2026-05-12"              # AAAA-MM-DD
SLUG_GRAVACAO="r1-joao-solar-londrina"  # kebab-case
NUMERO="01"                             # número do corte/vídeo
DATA_VIDEO="2026-05-12"                 # geralmente igual à data da gravação
TITULO_LEGIVEL="Nada é mais caro do que contratar errado"
SLUG_VIDEO="nada-mais-caro-contratar-errado"

BASE="01 - [CONTEÚDO] - Produção de Conteúdo/$PERFIL_NUM - [PERFIL] - $PERFIL/$GRAVACAO_NUM - [GRAVAÇÃO] - $DATA_GRAVACAO $SLUG_GRAVACAO"
PASTA_VIDEO="$BASE/$NUMERO - [VÍDEO] - $DATA_VIDEO $TITULO_LEGIVEL"

# 1. Garante pasta da gravação existe (idempotente)
rclone mkdir gdrive-mjta:"$BASE"

# 2. Garante pasta do vídeo existe
rclone mkdir gdrive-mjta:"$PASTA_VIDEO"

# 3. Sobe os 3 MP4s do vídeo
rclone copyto "conteudo/cortes-virais/$SLUG_GRAVACAO/output/${NUMERO}_${SLUG_VIDEO}-COMPLETO.mp4" \
  gdrive-mjta:"$PASTA_VIDEO/${NUMERO}_${SLUG_VIDEO}-COMPLETO.mp4"
rclone copyto "conteudo/cortes-virais/$SLUG_GRAVACAO/output/${NUMERO}_${SLUG_VIDEO}.mp4" \
  gdrive-mjta:"$PASTA_VIDEO/${NUMERO}_${SLUG_VIDEO}.mp4"
rclone copyto "conteudo/cortes-virais/$SLUG_GRAVACAO/raw/${NUMERO}_bastidor.mp4" \
  gdrive-mjta:"$PASTA_VIDEO/${NUMERO}_bastidor.mp4"

echo "Vídeo $NUMERO seguro no Drive em $PASTA_VIDEO"
```

Quando TODOS os cortes da gravação estiverem renderizados (último vídeo aprovado), fechar com o bruto:

```bash
# 1. Sobe bruto + transcrições na raiz da pasta da gravação (1x só, na primeira vez)
rclone copy "dados/cortes-virais-input/fathom_*.mp4" gdrive-mjta:"$BASE/" -P
rclone copy "dados/cortes-virais-input/fathom_*.vtt" gdrive-mjta:"$BASE/"
rclone copy "dados/cortes-virais-input/fathom_*.words.json" gdrive-mjta:"$BASE/"
rclone copy "dados/cortes-virais-input/fathom_*.txt" gdrive-mjta:"$BASE/"

# 2. Verificar MD5 do bruto (CRÍTICO antes de apagar local)
LOCAL_MD5=$(md5 -q "dados/cortes-virais-input/fathom_<id>.mp4")
DRIVE_MD5=$(rclone hashsum md5 gdrive-mjta:"$BASE/fathom_<id>.mp4" | awk '{print $1}')

# 3. SÓ apagar local o MP4 BRUTO se MD5 bater (mantém raw/, props/, output/)
if [ "$LOCAL_MD5" = "$DRIVE_MD5" ]; then
  rm "dados/cortes-virais-input/fathom_<id>.mp4"
  echo "Bruto deletado local, seguro no Drive"
else
  echo "MD5 DIFERE, NÃO APAGAR"
fi
```

**NUNCA apagar local sem antes verificar com MD5 hashsum.**

**Dica de timing pro upload do bruto:** pode subir junto com o PRIMEIRO vídeo aprovado pra não acumular trabalho no fim. Só não apaga local até confirmar.

### REGRA DE OURO: quando apagar cada bruto local

O bruto fica em **dois lugares** locais durante o trabalho:

1. **`dados/cortes-virais-input/fathom_*.mp4`** (o original do yt-dlp/Whisper)
   - **Apaga assim que** tiver MD5 confirmado no Drive E `source.mp4` copiado pro projeto
   - É só a versão de "entrada" do pipeline

2. **`conteudo/cortes-virais/<slug-gravacao>/source.mp4`** (cópia de trabalho)
   - **NÃO apaga durante o processo** — é o input do ffmpeg pra criar split de CADA corte
   - **Só apaga quando TODOS os cortes da gravação estiverem renderizados E subidos**
   - Apagar antes obriga a re-baixar 500MB-1GB do Drive pra cada novo corte

Fluxo correto:
```
1. yt-dlp baixa → dados/cortes-virais-input/fathom_*.mp4 (518 MB)
2. Cópia pra projeto → conteudo/cortes-virais/<slug>/source.mp4 (518 MB)
   ↑ duas cópias temporariamente
3. Subir bruto pro Drive + MD5 check
4. Apagar dados/cortes-virais-input/fathom_*.mp4
   ↑ só uma cópia local agora (source.mp4)
5. Renderizar cortes 1..N usando source.mp4
6. Aprovar último corte
7. Apagar conteudo/cortes-virais/<slug>/source.mp4
   ↑ zero cópias locais, bruto seguro no Drive
```

**Manter sempre localmente:**
- `conteudo/cortes-virais/<slug>/output/` (finais, pra postar)
- `conteudo/cortes-virais/<slug>/raw/` (splits intermediários, pra re-render)
- `conteudo/cortes-virais/<slug>/props/` (configs JSON, pra re-render)
- `dados/cortes-virais-input/fathom_*.vtt` e `.words.json` (transcrição leve)

**Apagar local depois do upload:**
- `dados/cortes-virais-input/fathom_*.mp4` (~500MB-1GB, o pesado)

### Setup inicial (uma vez)

Se `rclone lsd gdrive-mjta:` falhar, rodar:
```bash
rclone config
```
Criar remote `gdrive-mjta` tipo `drive`, scope `1` (full), auth interativo no browser com `matheus@mjta`.

## PADRÃO VISUAL OFICIAL (atualizado em 2026-05-12)

Esse é o padrão que o Matheus aprovou pros cortes de reunião dele. **Usar sempre.**

### Layout 9:16 (1080x1920)

```
┌──────────────────┐
│                  │  ← Matheus (top) NÍTIDO, 1080x832
│   MATHEUS        │     crop=380:540:447:90, scale=1080:832
│   (nítido)       │
│                  │
├══════════════════┤
│ NADA E MAIS CARO │  ← Faixa Cockpit, 256px de altura
│ DO QUE CONTRATAR │     - Fundo: preto #080808
│ ERRADO           │     - Linha topo: ciano #00E0FF com glow
│                  │     - Linha base: roxo #A855F7 com glow
│                  │     - Texto linha 1: ciano #00E0FF
│                  │     - Texto linha 2: roxo claro #A882FC
│                  │     - Fonte: Inter Black 60px, uppercase
│                  │     - Animação: pulse 1.0-1.015 (suave)
├══════════════════┤
│                  │  ← Cliente (bottom) BORRADO, 1080x832
│   CLIENTE        │     crop=300:540:75:90, scale=1080:832
│   (borrado)      │     gblur=sigma=30
│                  │
└──────────────────┘
```

### Pipeline ffmpeg (split + blur)

```bash
ffmpeg -y -ss <start> -to <end> -i source.mp4 \
  -filter_complex "
    color=c=0x080808:s=1080x256:d=<duracao>,format=yuva420p[divisor];
    [0:v]split=2[v1][v2];
    [v1]crop=<W_MATHEUS>:540:<X_MATHEUS>:90,scale=1080:832:flags=lanczos[matheus];
    [v2]crop=<W_CLIENTE>:540:<X_CLIENTE>:90,scale=1080:832:flags=lanczos,gblur=sigma=30[cliente];
    [matheus][divisor]vstack=inputs=2[top];
    [top][cliente]vstack=inputs=2
  " \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 44100 \
  raw/<id>_split.mp4
```

**Sempre extrair um frame do source (em meio do trecho) ANTES pra calibrar o crop X de Matheus e cliente.** Source típico Fathom 1280x720 com 2 ou 3 tiles lado a lado:
- 2 tiles (host + cliente): Matheus geralmente em x=440-820, cliente em x=60-440
- 3 tiles (com banner Notebook AI à direita): Matheus em x=447 (W=380), cliente em x=75 (W=300)

### Sequência de exibição: TÍTULO → LEGENDA (atualizado 2026-05-12)

**Importante:** todo texto fica na **faixa central Cockpit** (não em cima nem embaixo), pra não cair atrás de UI do Instagram/TikTok.

**Fase 1 (0-5s):** Só o título centralizado na faixa do meio (gradient ciano→roxo, pulse sutil)
**Fase 2 (5s+):** Título some em fade, legenda word-by-word entra **na MESMA faixa central**

Configurar a duração do título via constante `TITULO_DURACAO_S` no template (default: 5s).

### Legenda word-by-word (Remotion)

Template: `LegendaCockpit` em `conteudo/cortes-virais/_remotion/src/templates/LegendaCockpit.tsx`

**Configuração fixa:**
- Fonte: Inter Black 72px uppercase (era 92px, reduzido pra caber na faixa de 256px)
- Highlight palavra ativa: ciano #00E0FF + glow
- Demais palavras visíveis: branco com stroke preto 5px
- Agrupamento: 3 palavras por vez
- Posição: **dentro da faixa central** (não no rodapé)
- Animação: spring damping=12 stiffness=220, scale 0.85→1.0, duração 7 frames
- Filtra palavras: só mostra as que aparecem depois de `TITULO_DURACAO_S - 0.3s`

### Render Remotion

```bash
# 1. Copiar o split.mp4 pra public/ do Remotion
cp raw/<id>_split.mp4 conteudo/cortes-virais/_remotion/public/

# 2. Props (videoSrc relativo + título + palavras)
{
  "videoSrc": "<id>_split.mp4",
  "titulo": "Título em uppercase",
  "palavras": [{"texto": "PALAVRA", "start": 0.0, "end": 0.3}, ...]
}

# 3. Render
cd conteudo/cortes-virais/_remotion
npx remotion render src/index.ts LegendaCockpit \
  ../<projeto>/output/<id>_<slug>.mp4 \
  --props=../<projeto>/props/<id>.json
```

**IMPORTANTE:** No template, `OffthreadVideo` precisa de width/height fixos em 1080/1920 pra não ser escalado erroneamente:

```tsx
<OffthreadVideo
  src={resolvedSrc}
  style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1920 }}
/>
```

### Por que esse padrão funciona

- **Split 50/50** dá presença visual ao Matheus sem soar egoísta — o cliente aparece, mas borrado preserva anonimato
- **Faixa Cockpit no meio** carrega identidade da marca em todo corte e funciona como "respiradouro" visual entre as duas cabeças
- **Título nos primeiros 5s** ancora a frase principal pra quem vê com som off (maioria do scroll)
- **Legenda no centro** evita corte por UI do Instagram/TikTok que ocupa top e bottom ~15% cada
- **Borrão no cliente** evita problema de exposição sem pedir autorização caso a caso

## TEMPLATE BASTIDOR (Aula educativa pós-corte)

Vídeo de fechamento de 7s que aparece DEPOIS do corte da reunião, conectando o gancho com aula prática.

### Estrutura

```
┌──────────────────┐
│ Linha neon ciano │
│                  │
│ DOR_TITULO       │  ← Branco, ~64px
│ DOR_TEXTO        │  ← Branco, ~56px
│                  │
│ SOLUÇÃO_TITULO   │  ← Gradient ciano→roxo, ~88px UPPERCASE
│                  │
│ [TAG1] [TAG2]    │  ← Pills com borda ciano
│ [TAG3]           │
│                  │
│ ME SEGUE         │  ← Cinza pequeno
│ @eumatheusj      │  ← Gradient grande
│                  │
│ Linha neon roxo  │
└──────────────────┘
```

### Props

```json
{
  "dorTitulo": "Essa é uma das maiores dores",
  "dorTexto": "da energia solar hoje:",
  "solucaoTitulo": "Mão de obra qualificada",
  "tags": ["GESTÃO", "CULTURA", "LIDERANÇA"],
  "cta": "@eumatheusj"
}
```

### Ângulos sugeridos por tipo de corte

| Tipo de corte | Ângulo do bastidor |
|---------------|--------------------|
| Frase de bordão | Dor do setor + solução em 3 palavras |
| História/caso | Princípio + framework |
| Insight numérico | Como você chegou nessa métrica |
| Diagnóstico | Pergunta + sinal que você procura |

### Concatenação final

Depois de renderizar corte + bastidor separadamente:

```bash
cd <projeto>/raw && \
cp ../output/<id>_<slug>.mp4 ./<id>_corte.mp4 && \
cat > concat_<id>.txt << 'EOF'
file '<id>_corte.mp4'
file '<id>_bastidor.mp4'
EOF
ffmpeg -y -f concat -safe 0 -i concat_<id>.txt \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 44100 \
  ../output/<id>_<slug>-COMPLETO.mp4
```

## Notas técnicas

- Fathom exporta `.vtt` ou `.txt` direto da interface (botão "Download transcript")
- Se a transcrição vier sem timestamps por palavra, sugerir rodar `whisperx` local pra granularidade word-level (melhor pra legenda animada)
- Vídeos do Fathom geralmente são 16:9 com a câmera num canto — sempre confirmar o crop antes de renderizar todos
- Reels limita em 90s, TikTok em 10min mas o sweet spot pra viral é 15-60s

## Tom

Não usar travessão em nenhum texto gerado (título, legenda de post, etc). Falar com o Matheus em tom direto, "tu", frases curtas.
