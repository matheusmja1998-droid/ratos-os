# OBS Cockpit Tráfego — Setup pronto

## O que tem dentro do arquivo `Cockpit_Trafego.json`

**4 cenas configuradas:**

| Cena | Quando usar |
|---|---|
| **Cockpit - Tela + Cam** | Cena principal. Tela cheia no fundo + iPhone circular no canto inferior direito. |
| **Cockpit - Só Cam** | Pra abertura/encerramento da aula (cabeça falando em tela cheia). |
| **Cockpit - Só Tela** | Quando tu quer focar 100% no que tá na tela (esconde tua cara temporariamente). |
| **Cockpit - Intro Pausa** | Cena vazia (preta) pra pausas/transições. |

**3 fontes configuradas:**

1. **Mic Lapela** (entrada de áudio padrão do sistema — automaticamente pega teu lapela quando conecta)
   - Já vem com 4 filtros aplicados:
     - Supressão de ruído (RNNoise) — tira ruído de fundo
     - Noise Gate — abafa quando tu não tá falando
     - Compressor — equaliza picos
     - Ganho +6dB — deixa mais alto
2. **Tela do Mac** (captura de exibição — vai pegar a tela inteira)
3. **iPhone (Continuity Camera)** — câmera com máscara circular já aplicada

---

## Como importar (passo a passo)

### Passo 1 — Instalar OBS

Baixa em https://obsproject.com (gratuito, Mac Apple Silicon).

### Passo 2 — Abrir OBS pela primeira vez

Quando perguntar "Configuration Wizard", clica **Não** ou **Skip**. Vamos importar manual.

### Passo 3 — Importar a Cena

1. No menu superior do OBS: **Scene Collection** → **Import**
2. Aponta pro arquivo:
   ```
   /Users/matheusjardim/claude/Ratos OS/winvision/obs-cockpit/Cockpit_Trafego.json
   ```
3. Clica **Import**
4. Menu superior: **Scene Collection** → seleciona **"Cockpit Tráfego"**

### Passo 4 — Conectar a câmera do iPhone

1. **No iPhone:** desbloqueia, deixa do lado do Mac (mesmo Wi-Fi e iCloud)
2. **No Mac:** o iPhone aparece como webcam automaticamente
3. **No OBS:** clica com botão direito na fonte **"iPhone (Continuity Camera)"** → **Propriedades**
4. Em **Device**, seleciona teu iPhone na lista
5. Clica **OK**

### Passo 5 — Conectar o mic de lapela

1. Conecta o lapela no Mac (cabo USB ou via interface)
2. Vai em **Configurações do Sistema (macOS)** → **Som** → **Entrada** → seleciona o lapela como padrão
3. No OBS, clica com botão direito na fonte **"Mic Lapela"** → **Propriedades** → confirma que tá no dispositivo correto
4. Clica **OK**

### Passo 6 — Configurar Tela do Mac

1. No OBS, clica com botão direito na fonte **"Tela do Mac"** → **Propriedades**
2. Em **Type**, escolhe **Display Capture** (captura de exibição)
3. Em **Display**, seleciona o monitor que tu vai usar pra gravar (se tu tem 2 monitores, escolhe o que vai mostrar VS Code)
4. Marca **Show Cursor** (mostra o cursor — importante pra tutorial)
5. Clica **OK**

### Passo 7 — Permissões do macOS

Na primeira vez, vai pedir permissão de:
- **Acessar microfone** → permite
- **Acessar câmera** → permite
- **Gravar tela** → permite (Configurações do Sistema → Privacidade e Segurança → Gravação de Tela → marca OBS)

Depois disso, **fecha e abre o OBS de novo**.

---

## Configurações importantes pra ajustar

### Output (qualidade da gravação)

OBS → **Settings** → **Output**:

| Campo | Valor |
|---|---|
| Output Mode | Advanced |
| Recording Path | `~/Movies/Cockpit-Tutoriais/` |
| Recording Format | **MP4** |
| Type | Standard |
| Encoder | **Apple VT H264 Hardware Encoder** (no Mac M1/M2/M3) |
| Bitrate | **8000 Kbps** |
| Keyframe Interval | 2 |
| Profile | high |

### Video (resolução)

OBS → **Settings** → **Video**:

| Campo | Valor |
|---|---|
| Base (Canvas) Resolution | **1920x1080** |
| Output (Scaled) Resolution | **1920x1080** |
| Common FPS Values | **30** |

### Audio

OBS → **Settings** → **Audio**:

| Campo | Valor |
|---|---|
| Sample Rate | 48 kHz |
| Channels | Stereo |
| Desktop Audio | Disabled (tu não quer pegar som de notificação) |
| Mic/Auxiliary Audio | Default (vai pegar o lapela) |

---

## Atalhos pra gravar

| Ação | Atalho macOS |
|---|---|
| Iniciar/Parar Gravação | `Cmd + Shift + R` (configurar em Settings → Hotkeys) |
| Trocar pra cena "Só Cam" | `Cmd + 2` (configurar em Hotkeys também) |
| Trocar pra "Tela + Cam" | `Cmd + 1` |
| Trocar pra "Só Tela" | `Cmd + 3` |
| Mute do mic | `Cmd + M` |

**Pra configurar os hotkeys:** OBS → Settings → Hotkeys → procura cada cena e define a tecla.

---

## Layout visual do "Cockpit - Tela + Cam"

```
┌──────────────────────────────────────────────┐
│                                              │
│                                              │
│         [TELA DO MAC EM CHEIA]               │
│         (VS Code / Browser / etc)            │
│                                              │
│                                              │
│                                              │
│                                              │
│                                    ╭──────╮  │
│                                    │ TU   │  │ ← iPhone
│                                    │ ●●●  │  │   circular
│                                    ╰──────╯  │   (~400x300)
└──────────────────────────────────────────────┘
```

A câmera tá configurada em:
- **Posição:** canto inferior direito (1500, 760)
- **Escala:** 31,25% do tamanho original
- **Forma:** circular (filtro de máscara já aplicado)

Se quiser ajustar tamanho ou posição:
1. Seleciona a fonte "iPhone (Continuity Camera)" na cena
2. Arrasta os cantos pra redimensionar (segura `Cmd` pra manter proporção)
3. Arrasta o quadrado central pra mover de lugar

---

## Antes de gravar — checklist

- [ ] iPhone conectado e funcionando como câmera
- [ ] Lapela conectado e selecionado como entrada de áudio
- [ ] Tela do Mac aparecendo na cena
- [ ] Teste de 30s gravado e revisto (áudio sem chiado, vídeo nítido)
- [ ] VS Code aberto com a aula que vai gravar
- [ ] Browser aberto com tutorial visual (cockpit-trafego-tutoriais.vercel.app)
- [ ] Notificações silenciadas (Cmd + N modo foco no macOS)
- [ ] Pasta de gravação tem espaço (`~/Movies/Cockpit-Tutoriais/`)

---

## Editar depois

Pra cortar erros e adicionar zoom:

- **CapCut Desktop** (grátis) — fácil pra começar
- **Descript** (US$ 12/mês) — edita por transcrição, corta "uhm" automaticamente

Pra finalizar com look bonito (cantos arredondados no player, etc):

- **Sobe direto no Cakto** — área de membros aplica player próprio
- **Panda Video** (R$ 59/mês) — player com mais opções de customização
