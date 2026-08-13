# Cockpit Install — Passo a Passo da Instalação

**Duração estimada:** 2h-3h
**Ticket:** R$997
**Pré-requisitos do cliente:** Tudo do Kick + cartão de crédito pra Cloudflare + acesso Google Ads + bot Telegram

> Se o cliente já fez o Kick antes (caminho de upgrade), pular pra **Bloco 4**. Senão, começar pelo Bloco 1 que executa todos os passos do Kick + os blocos novos.

## Visão geral da sessão

```
[60 min] Tudo do Kick (Setup + 3 skills: Onboarding, Dossiê, Meta)
[20 min] Skill 4 — Cockpit Watch (Guardião) — n8n + bot Telegram
[25 min] Skill 5 — Cockpit Track (Cloudflare server-side)
[20 min] Skill 6 — Cockpit Google
[15 min] Skill 7 — Cockpit Debrief
[15 min] Skill 8 — Cockpit Report
[15 min] Skill 9 — Cockpit Creative
[10 min] Mapeamento de todos os clientes + hand-off
```

---

## ⏱️ Bloco 1-3 — Tudo do Kick

> Executar `tiers/kick.md` do início ao bloco 5 (Cockpit Meta).
>
> Pular o bloco 6 (Hand-off do Kick) — vamos fazer hand-off do Install no fim.

---

## ⏱️ Bloco 4 — Cockpit Watch (Guardião) — 20 min

### O que falar

> "Agora a skill que mais bombou nos clientes. Watch é o monitor 24/7. Ele fica olhando todas as campanhas das tuas contas e te avisa no Telegram quando algo foge da meta — CPA alto, frequência alta, criativo morto, orçamento vazando. Tu vai dormir tranquilo."

### Sub-bloco 4.1 — Criar bot do Telegram (5 min)

**1. Pedir pro cliente abrir o Telegram e procurar:** `@BotFather`

**2. Conversar com o BotFather:**
- Comando: `/newbot`
- Nome do bot: `Cockpit Watch [Nome da Agência]`
- Username (precisa terminar em `bot`): `cockpit_watch_[agencia]_bot`

**3. BotFather retorna o token. Algo assim:**
```
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

**Salvar imediatamente em `.env`:**
```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

**4. Pegar o chat_id do cliente:**

- Pedir pro cliente mandar uma mensagem qualquer pro bot recém-criado
- Abrir no navegador:
  ```
  https://api.telegram.org/bot{{TELEGRAM_BOT_TOKEN}}/getUpdates
  ```
- Achar o campo `chat.id` no JSON retornado
- Salvar em `.env`:
  ```bash
  TELEGRAM_CHAT_ID=123456789
  ```

### Sub-bloco 4.2 — Configurar n8n (10 min)

**1. Pedir pro cliente abrir conta gratuita em [n8n.cloud](https://n8n.cloud)** ou usar a instância que tu hospeda (`n8n.valvularocket.com`).

**2. Criar API Key no n8n:**
- Settings → API → Create API Key
- Salvar em `.env`:
  ```bash
  N8N_URL=https://n8n.valvularocket.com (ou a do cliente)
  N8N_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  ```

**3. Instalar a skill Watch:**
```bash
cd ~/Cockpit
git clone https://github.com/matheusmja1998-droid/cockpit-guardiao.git
```

**4. Rodar setup do Watch:**
```
/cockpit-guardiao setup
```

A skill vai:
- Criar workflow do Watch no n8n (importa template)
- Conectar com Meta API usando `META_USER_TOKEN` do `.env`
- Conectar com Telegram usando `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`
- Configurar cron pra rodar a cada 30 min
- Definir regras-padrão de alerta

**5. Customizar regras de alerta** (perguntar ao cliente):
- CPA acima de quanto dispara alerta? (ex: R$80)
- Frequência acima de quanto dispara? (ex: 3.0)
- Gasto sem conversão por quanto tempo dispara? (ex: 24h sem evento)
- Quais contas o Watch monitora? (todas ou seleção)

Salvar em `~/Cockpit/.cockpit/n8n/watch-config.md`.

### Sub-bloco 4.3 — Teste ao vivo (5 min)

**1. Forçar uma execução:**
```
/cockpit-guardiao testar
```

**2. Esperar o alerta chegar no Telegram do cliente.**

> "Tá vendo? Deu alerta. Agora a cada 30 minutos isso roda automaticamente. Tu vai parar de abrir o gerenciador de madrugada."

**3. Commit:**
```bash
cd ~/Cockpit
git add .
git commit -m "feat: skill cockpit-guardiao instalada + n8n + Telegram configurados"
```

---

## ⏱️ Bloco 5 — Cockpit Track (Cloudflare server-side) — 25 min

### O que falar

> "Essa skill resolve o maior problema de tracking do mercado hoje. iOS 17 ferrou o pixel — tu tá perdendo entre 25-40% das conversões. Vamos configurar server-side via Cloudflare. Os eventos saem do servidor, não do navegador, e batem direto na CAPI da Meta e no GA4. Cliente teu vai notar a diferença."

### Sub-bloco 5.1 — Criar conta Cloudflare (3 min)

**1. Pedir pro cliente criar conta em [cloudflare.com](https://cloudflare.com)** (gratuita).

**2. Adicionar o domínio do cliente:**
- Cloudflare pergunta o domínio
- Cliente coloca o domínio principal (ou de uma das landings dele)
- Cloudflare gera 2 nameservers
- Cliente vai no registrador (Registro.br, GoDaddy, etc) e troca os nameservers

> ⏳ Pode levar 1-24h pra propagar. Se não propagou ainda, continuar instalação e voltar nesse passo depois.

### Sub-bloco 5.2 — Pegar tokens do GA4 e Meta CAPI (7 min)

**1. Token do GA4 (Measurement Protocol):**
- Cliente abre [analytics.google.com](https://analytics.google.com)
- Vai em Admin → Data Streams → seleciona o stream do site → "Measurement Protocol API secrets"
- Cria nova chave: nome "Cockpit Track"
- Copia a `api_secret` e `measurement_id`

Salvar em `.env`:
```bash
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

**2. Token CAPI da Meta:**
- Cliente abre [business.facebook.com](https://business.facebook.com) → Gerenciador de Eventos
- Seleciona o pixel
- Vai em Configurações → API de conversões → "Gerar token de acesso"
- Salva o token

```bash
META_CAPI_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxx
META_PIXEL_ID=1234567890123456
```

### Sub-bloco 5.3 — Subir Worker no Cloudflare (10 min)

**1. Instalar a skill Track:**
```bash
cd ~/Cockpit
git clone https://github.com/matheusmja1998-droid/cockpit-track.git
```

**2. Rodar setup:**
```
/cockpit-track setup
```

A skill vai:
- Pedir o domínio do cliente (ex: `clienteagencia.com.br`)
- Gerar Worker JavaScript pré-configurado com os tokens do `.env`
- Fazer upload via API do Cloudflare
- Configurar rota: `track.[domínio].com/*` → Worker
- Validar que o Worker tá rodando

**3. Adicionar tag no site do cliente:**

A skill gera o snippet pra colar no `<head>`:
```html
<script>
  // Cockpit Track v1
  window.cockpitTrack = function(event, data) {
    fetch('https://track.[dominio].com/event', {
      method: 'POST',
      body: JSON.stringify({ event, data, ts: Date.now() })
    });
  };
</script>
```

> "O cliente teu vai ter que colar isso no site dele. Geralmente é via GTM ou direto no `<head>`. Se ele tem WordPress, instala plugin tipo 'Insert Headers and Footers'. Te ajudo se ele travar."

### Sub-bloco 5.4 — Teste ao vivo (5 min)

**1. Forçar evento de teste:**
```
/cockpit-track testar
```

**2. Validar:**
- Aparece em [Eventos no Gerenciador da Meta](https://business.facebook.com/events_manager) com tag "server-side"
- Aparece em GA4 → Realtime
- Confirmar gap real: pegar últimas 24h de eventos pixel vs server-side, mostrar pro cliente o quanto ele tava perdendo

**3. Commit:**
```bash
cd ~/Cockpit
git add .
git commit -m "feat: skill cockpit-track instalada + Cloudflare Worker rodando"
```

---

## ⏱️ Bloco 6 — Cockpit Google (Google Ads) — 20 min

### O que falar

> "Mesma coisa que a skill Meta, mas pro Google Ads. Cria, pausa, duplica campanha por comando."

### Sub-bloco 6.1 — Habilitar Google Ads API (10 min)

**1. Pedir pro cliente abrir [ads.google.com](https://ads.google.com)** e estar logado com a conta admin.

**2. Pegar o Customer ID:**
- Aparece no canto superior direito (formato: `XXX-XXX-XXXX`)
- Salvar em `.env`:
  ```bash
  GOOGLE_ADS_CUSTOMER_ID=123-456-7890
  ```

**3. Solicitar Developer Token:**
- Acessar [Google Ads API Center](https://ads.google.com/aw/apicenter) (precisa MCC — manager account)
- Se cliente não tem MCC, criar agora: [ads.google.com/home/tools/manager-accounts](https://ads.google.com/home/tools/manager-accounts)
- Solicitar Developer Token (pode levar 24-48h pra aprovar — começar com Test Token)

```bash
GOOGLE_ADS_DEVELOPER_TOKEN=xxxxxxxxxxxxxxxxxxxxxx
```

**4. Criar OAuth Client:**
- [Google Cloud Console](https://console.cloud.google.com/) → APIs e Serviços → Credenciais
- Criar Credencial → OAuth 2.0 Client ID
- Tipo: Aplicativo da área de trabalho
- Salva `client_id` e `client_secret`:

```bash
GOOGLE_OAUTH_CLIENT_ID=xxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxx
```

**5. Gerar refresh_token:**

Rodar:
```bash
cd ~/Cockpit
node .claude/skills/cockpit-google/get-refresh-token.js
```

Vai abrir o navegador, pedir login, retornar o `refresh_token`:
```bash
GOOGLE_ADS_REFRESH_TOKEN=1//xxxxxxxxxxxxxxxx
```

### Sub-bloco 6.2 — Instalar e testar (10 min)

**1. Instalar:**
```bash
git clone https://github.com/matheusmja1998-droid/cockpit-google.git
```

**2. Listar campanhas:**
```
/cockpit-google listar campanhas
```

**3. Testar 3 comandos** (igual fizemos no Meta).

**4. Commit:**
```bash
git add .
git commit -m "feat: skill cockpit-google instalada + Google Ads API conectada"
```

---

## ⏱️ Bloco 7 — Cockpit Debrief — 15 min

### O que falar

> "Skill que faz análise pós-campanha em 5 minutos. Cliente acabou um lançamento, antes era 1 semana de planilha. Agora é 5 min."

### Passos

**1. Instalar:**
```bash
git clone https://github.com/matheusmja1998-droid/cockpit-debrief.git
```

**2. Rodar setup:**
```
/cockpit-debrief setup
```

A skill pede:
- Conexão com Meta API (já tem)
- Localização das planilhas de leads/vendas (pasta `dados/` por padrão)
- Templates de análise

**3. Demonstração ao vivo:**

Pegar 1 cliente real do cliente que tem dados:
```
/cockpit-debrief [cliente] [periodo]
```

A skill cruza:
- Dados Meta (gasto, impressões, cliques, conversões)
- Planilha de leads
- Planilha de vendas (se tiver)
- Posicionamento, criativo, campanha

E gera:
- Relatório completo em markdown
- Dashboard HTML interativo
- Diagnóstico por temperatura (frio, morno, quente)
- Recomendações de próximo lançamento

**4. Commit.**

---

## ⏱️ Bloco 8 — Cockpit Report — 15 min

### O que falar

> "Não tem mais relatório no domingo. Toda segunda 8h, sai relatório semanal automático pra cada cliente."

### Passos

**1. Instalar:**
```bash
git clone https://github.com/matheusmja1998-droid/cockpit-report.git
```

**2. Rodar setup:**
```
/cockpit-report setup
```

A skill pede:
- Conexão Meta (já tem)
- Conexão CRM (Kommo? RD? HubSpot?) — opcional
- Pra quem manda? Telegram do gestor ou direto pro cliente?
- Templates brandizados

**3. Configurar cron:**

Por padrão, segunda às 8h. Personalizar se cliente quiser:
- Frequência (semanal, quinzenal)
- Dia/hora
- Pra cada cliente

**4. Demonstração:**
```
/cockpit-report [cliente] últimos 7 dias
```

Mostra o relatório saindo na hora.

**5. Commit.**

---

## ⏱️ Bloco 9 — Cockpit Creative — 15 min

### O que falar

> "Última skill. Cliente novo precisa de criativo, tu fala 'gera 10 criativos do nicho X com promessa Y' e ela cospe 10 imagens prontas pra subir, com Schwartz + Hormozi e compliance Meta."

### Passos

**1. Instalar:**
```bash
git clone https://github.com/matheusmja1998-droid/cockpit-creative.git
```

**2. Setup do Playwright (renderização das imagens):**
```bash
cd ~/Cockpit
npx playwright install chromium
```

**3. Configurar identidade visual:**

A skill pergunta:
- Cores do cliente (hex)
- Fontes
- Logo (path do arquivo)
- Estilo (minimalista, bold, editorial)

Salva em `clientes/[cliente]/marca/design-guide.md`.

**4. Demonstração:**
```
/cockpit-creative gera 10 criativos pro cliente [X] com tema "[tema]"
```

Saída: 10 PNGs prontos em `clientes/[cliente]/criativos/em-teste/`.

**5. Commit final:**
```bash
git add .
git commit -m "feat: stack Cockpit completa instalada (Install R$997)"
```

---

## ⏱️ Bloco 10 — Mapeamento + Hand-off — 10 min

### Passos

**1. Mapear TODOS os clientes (não só 1-2):**

Pra cada cliente do gestor:
```
/cockpit-onboarding [Nome do Cliente]
/cockpit-dossie [nome-cliente-slug]
```

Se forem muitos clientes, fazer em lote:
```
/cockpit-onboarding em-lote [arquivo-csv-com-clientes.csv]
```

**2. Push pro GitHub:**
```bash
cd ~/Cockpit
git push origin main
```

**3. Gerar PDF de hand-off do Install:**
```
/cockpit-init gerar-pdf-handoff install
```

PDF inclui:
- Tudo do Kick
- Skills 4-9 (Watch, Track, Google, Debrief, Report, Creative)
- Tokens onde estão
- Todos os clientes mapeados
- Próximos passos
- Roadmap pro Operation (upgrade)

**4. Adicionar à comunidade VIP** (Cockpit Pilots — canal Install pra cima).

**5. Agendar follow-up de 14 dias:**

> "Em 14 dias eu te chamo. Suporte WhatsApp tá ativo até lá. E quando estiveres pronto pro Operation (a gente sentar e configurar 1 cliente real teu inteiro junto, com Obsidian Brain e tudo mais), R$1.000 de desconto pra fechar."

---

## ✅ Checklist final do Install

- [ ] Tudo do Kick OK
- [ ] Bot Telegram criado e funcional
- [ ] n8n conectado e workflow do Watch rodando
- [ ] Cloudflare Worker rodando (server-side track)
- [ ] GA4 + Meta CAPI recebendo eventos server-side
- [ ] Google Ads API conectada
- [ ] Skills instaladas: Watch, Track, Google, Debrief, Report, Creative
- [ ] Todos os clientes do gestor mapeados (não só 1-2)
- [ ] Cron do Report agendado pra segunda 8h
- [ ] Push pro GitHub realizado
- [ ] PDF hand-off Install gerado
- [ ] Comunidade VIP adicionado
- [ ] Follow-up 14 dias agendado
