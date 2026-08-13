# RatoLead — extensão de prospecção do Cockpit

Extensão Chrome pra uso próprio. Captura leads do Google Maps, joga num funil Kanban e te deixa abordar no WhatsApp com mensagem personalizada, uma a uma. Tudo roda no teu navegador, sem servidor. Baseada no que a Waspeed faz de melhor, sem a parte perigosa (disparo em massa automático).

---

## Como instalar (5 minutos)

1. Abre o Chrome e vai em `chrome://extensions`
2. Liga o **Modo do desenvolvedor** (canto superior direito)
3. Clica em **Carregar sem compactação** (Load unpacked)
4. Seleciona a pasta `ratolead-extensao` (essa aqui)
5. Pronto. O ícone do RatoLead aparece na barra.

Se mudar algum arquivo do código, volta em `chrome://extensions` e clica no ↻ (recarregar) no card da extensão.

---

## Como usar (o fluxo)

### 1. Capturar leads no Google Maps
- Abre o [Google Maps](https://www.google.com/maps) e busca algo tipo **"integradora solar em Belo Horizonte"** ou **"agência de marketing em Uberlândia"**.
- Espera a lista de resultados aparecer na lateral esquerda.
- Aparece um botão verde flutuante no canto inferior direito: **Capturar leads**.
- Clica. Ele rola a lista sozinho pra carregar tudo e importa nome, telefone, site, categoria e nota de cada lugar direto pro CRM (coluna **Pré-qualificação**).
- Duplicados (mesmo telefone) são ignorados automaticamente.

### 2. Duas telas: painel de leads (no WhatsApp) e CRM completo (janela)

**Painel de leads — dentro do WhatsApp Web** (pra abordar rápido):
- Abre o WhatsApp Web e clica no botão verde **RatoLead** (canto inferior direito), ou clica no ícone da extensão na barra do Chrome (ele acha/abre o WhatsApp e abre o painel).
- Aparece uma lista dos teus leads na lateral direita, priorizando a pré-qualificação. Busca no topo.
- Clica em **Abordar** num lead, escolhe a mensagem, e a conversa abre **sem recarregar a página** (ver seção 3).

**CRM completo — janela separada** (o funil grande):
- Botão **Abrir CRM ↗** no topo do painel de leads, ou botão **CRM** no Maps.
- Abre numa janela própria com o Kanban: **Pré-qualificação → Abordado → Respondeu → Reunião → Fechou / Perdeu**. Arrasta os cards, edita notas, lembretes, mensagens, exporta.
- É o mesmo banco de dados dos dois lugares.

### 3. Abordar no WhatsApp (1 a 1, sem recarregar)
- No **painel de leads dentro do WhatsApp**, clica em **Abordar**.
- Escolhe uma das tuas mensagens prontas. As variáveis `{{nome}}`, `{{categoria}}`, `{{cidade}}` são preenchidas sozinhas.
- Ajusta o texto e clica em **Abrir conversa →**.
- A conversa abre **sem recarregar a página** e o texto já vai colado no campo. Você revisa e envia. O lead pula pra "Abordado".
- A mensagem também é copiada pro clipboard, então se por algum motivo o texto não colar sozinho, é só dar Ctrl+V.

> **Sobre o "sem recarregar":** isso usa o código interno do WhatsApp (a mesma técnica de extensões tipo Waspeed). O WhatsApp muda esse código de tempos em tempos; **se um dia parar de funcionar**, a extensão cai sozinha no modo antigo (abre com reload) e ninguém fica na mão. Aí me chama que eu recalibro o `content/wa_store.js`.

> Pela **janela do CRM** (não pelo painel do WhatsApp), o botão WhatsApp abre o `wa.me` em nova aba — ali recarrega mesmo, porque é fora do WhatsApp Web.

> ⚠️ **Não existe disparo em massa aqui, de propósito.** Você aborda um por um. É mais lento que mandar pra lista inteira, e é exatamente isso que mantém teu número longe do ban.

### 4. Notas, lembretes e detalhes
- **Detalhes** no card abre a ficha do lead: notas, editar telefone, definir etapa e **lembrete de follow-up** (dispara um alerta no ícone da extensão na data marcada).

### 5. Reunião → Google Agenda
- Em Configurações, liga "Criar evento no Google Agenda ao marcar reunião".
- Quando você arrasta um lead pra coluna **Reunião**, abre o Google Agenda já preenchido (título, telefone, notas) pra você confirmar o horário.

### 6. Exportar
- Botão **Exportar Excel** (topo) baixa um CSV com todos os leads e a etapa de cada um. Abre direto no Excel/Sheets, dá pra jogar no Apify ou numa planilha mãe.

---

## Mensagens prontas (texto, áudio e imagem)
Aba **Mensagens prontas**. Já vem com 3 modelos de texto. Edita, cria os teus, usa as variáveis: `{{nome}}`, `{{categoria}}`, `{{cidade}}`, `{{site}}` e `{{eu}}` (teu nome, das Configurações).

Cada mensagem tem um **tipo**:
- **💬 Texto** — o de sempre.
- **🎤 Áudio** — grava direto na extensão (botão Gravar, pede permissão do microfone na 1ª vez) ou anexa um arquivo de áudio. Dá pra pôr um texto de legenda junto.
- **🖼 Imagem** — anexa uma imagem (print de oferta, etc.) + legenda.

Na hora de **abordar**, se a mensagem for áudio ou imagem, aparece a mídia com um botão **⬇ Baixar pra anexar no WhatsApp**. Você baixa e arrasta/anexa na conversa, e o texto vai como legenda. O WhatsApp não deixa uma extensão enviar áudio/imagem sozinha, então esse passo é manual de propósito (e mais seguro).

Tudo (inclusive os áudios e imagens) fica salvo no navegador. Áudios grandes ocupam espaço — se acumular muito, o navegador pode reclamar; nesse caso apaga mensagens antigas.

---

## Onde os dados moram
Tudo em **IndexedDB local** (no teu Chrome). Nada sai pra servidor nenhum. Se você desinstalar a extensão ou limpar os dados do navegador, os leads somem — então **exporta o Excel de tempos em tempos** como backup.

---

## Se parar de capturar no Maps
O Google muda o HTML do Maps de vez em quando. Se um dia o "Capturar leads" não achar nada, o ponto a revisar é a função `lerCards()` em `content/maps.js` (os seletores dos cards). Me chama que eu atualizo.

---

## O que NÃO foi incluído (de propósito)
- **Disparo em massa automático** — vetor nº1 de ban. Substituído pela abordagem 1 a 1 dentro do Kanban.
- **Enriquecimento** (visitar site pra caçar e-mail/decisor) — você pediu pra tirar.

## Ideias pra evoluir depois
- Rodar o mesmo capturador em cima do Google Maps de outras buscas salvas.
- Botão dentro do WhatsApp Web pra puxar a nota do lead enquanto conversa.
- Contador de "quantos abordei hoje" pra não estourar volume e cair no radar da Meta.
