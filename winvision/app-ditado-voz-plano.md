# Plano: App de Ditado por Voz por Assinatura (Whisper Local, Brasil)

> Pesquisa e plano gerados em 01/07/2026. Produto: app desktop de ditado por voz estilo Wispr Flow, rodando Whisper LOCAL (custo de inferência zero), vendido pro Brasil inteiro por assinatura. Objetivo do Matheus: renda o mais passiva possível, além das agências.

## 1. A oportunidade em 3 frases

O ditado por voz virou categoria quente lá fora (Wispr Flow levantando a US$2bi, Superwhisper), mas os gringos tratam português como bloco único, erram nome próprio, escrevem em pt-PT e cobram em dólar sem opção vitalícia. Rodando Whisper local, o custo de inferência é literalmente zero pro dono (a transcrição roda na máquina do usuário, offline), o que transforma um SaaS de margem média num produto de margem ~90% que aguenta até venda vitalícia. Dá pra construir o MVP em dias a poucas semanas adaptando open-source pronto (VoiceInk), testar na própria máquina, e vender pro Brasil inteiro com preço em reais e Pix.

## 2. O produto (o que é o MVP)

**O MVP em uma frase:** tu seguras um atalho de teclado, falas, e o texto aparece limpo no cursor de qualquer app (WhatsApp Web, Gmail, Notion, editor de código).

**Features must-have (o piso da categoria):**
1. Ditado global por atalho em qualquer campo de texto, não preso a um app só.
2. Pontuação e capitalização automáticas sem falar "vírgula" ou "ponto final".
3. Limpeza automática de fala: tira "é", "tipo", "né", "então", gagueira, devolve texto corrido.
4. Latência baixa e inserção confiável (sub-1s), sem falha de colagem em blocos longos.
5. Precisão real em pt-BR com sotaque e termos do dia a dia.
6. Dicionário/vocabulário personalizado (nomes próprios, marcas, siglas, jargão).
7. Plano gratuito honesto + preço em reais com Pix.
8. App leve (menu-bar no Mac / tray no Windows).

**V2 (não precisa no dia 1):** modos por contexto (formal/casual), edição por comando de voz ("põe em tópicos"), histórico de transcrições, transcrição de arquivo de áudio/vídeo, app mobile com teclado de ditado.

## 3. O diferencial Brasil (por que ganha dos gringos)

Ângulo central: **"o ditado por voz que fala brasileiro de verdade"**. Contra a dor concreta: chega de app gringo que erra teu nome, escreve português de Portugal e te cobra em dólar.

- Sotaque e oralidade BR de verdade (nordestino, gaúcho, mineiro, paulista, gíria).
- Formatação nativa de WhatsApp (`*negrito*`, `_itálico_`, quebras, emoji).
- Comandos de voz em português natural ("põe em tópicos", "manda pro grupo").
- Vocabulário de negócio BR embarcado (tráfego pago, jurídico, contábil, médico, marcas BR).
- Números, moeda e datas no padrão BR (R$ 1.500,00, "dez e meia", 15/07, CPF/CNPJ).
- Confiabilidade e privacidade como bandeira: Wispr tem Trustpilot 2.7/5 e manda áudio pra servidor. Teu app roda offline. As duas maiores reclamações do líder viram teu argumento de venda.
- Suporte, faturamento e conteúdo 100% em português + preço em reais com Pix.

**Avatares de entrada:** (1) profissional/empreendedor que vive no WhatsApp e email (advogado, médico, corretor, vendedor, dono de agência) e (2) criador de conteúdo/dev.

## 4. A tecnologia explicada simples

**Stack recomendada (Mac + Windows num codebase só):** Tauri 2.x (core em Rust, UI web) + whisper.cpp (via `whisper-rs`) + `tauri-plugin-global-shortcut` (atalho) + `cpal` (áudio) + `enigo` (simular teclado). Tauri em vez de Electron: bundle 5-10MB vs 100MB+, RAM 30-50MB vs 150-300MB.

**Atalho mais curto pra validar:** começar SÓ no Mac com Swift nativo + WhisperKit (roda no Neural Engine da Apple) forkando/estudando o **VoiceInk** (open-source GPL v3, ~4.3k stars, é o open-source por trás do Superwhisper/Wispr). Trade-off: código Mac não reaproveita pro Windows. Como o teste é no Mac do Matheus primeiro, dá pra começar Mac-only e portar depois.

**Como o ditado global funciona:**
1. Atalho global: segura tecla, começa a gravar mic.
2. Transcrição local: solta, áudio passa por VAD e vai pro Whisper na máquina. Nada sobe pra servidor.
3. Inserção: salva clipboard atual → escreve texto no clipboard → dispara Cmd+V (Mac) / Ctrl+V (Windows) → restaura clipboard. Método que o Wispr usa, cobre 90%+ dos apps. Fallback onde falha: digitar char-a-char.

**Whisper local é grátis porque:** Whisper é da OpenAI, licença MIT (uso comercial liberado). Roda 100% no hardware do usuário. Nenhum servidor teu é acionado por transcrição → custo de inferência = zero. Teu servidor só responde "licença ativa? sim/não".

## 5. Modelo de receita

**Preço (espelhando o Superwhisper, mesmo modelo on-device, mas em R$):**
- Mensal: R$ 24,90 a R$ 29,90 (sweet spot).
- Anual: R$ 149 a R$ 297 (âncora de "2-4 meses de graça").
- Vitalício: R$ 297 a R$ 497 one-time (converte bem no BR, custo marginal zero = altamente lucrativo).
- Free tier limitado (ex: X min/dia) pra aquisição.

**Margem (R$ 29,90/mês na Kiwify, taxa 8,99% + R$ 2,49):**
- Inferência: R$ 0. Validação de licença: ~R$ 0.
- Taxa Kiwify: ~R$ 5,18/mês. Sobram ~R$ 24,72 (82,7% margem bruta).
- Anual R$ 297: sobram R$ 267,81 (90,2% margem).
- Vitalício R$ 397: sobram ~R$ 359, margem quase pura.

**Por que local = renda passiva:** no cloud, um usuário de 90 min/mês custaria ~R$ 2,92/mês de inferência (pesado: ~R$ 9,70), comendo 1/3 da mensalidade, margem cai pra 55-70% e fica refém do uso. No local não existe teto: dá pra vender "ilimitado" sem medo. Único custo que importa é aquisição, não operação.

## 6. Os números

**Custo pra construir o MVP:**
- MVP mínimo (Tauri/Electron + whisper.cpp, atalho, cola no cursor, 1 tela config, licença): R$ 6.000 a R$ 12.000 (~100-160h a R$ 60-90/h).
- MVP polido (Win + Mac, auto-update, onboarding, tray): R$ 12.000 a R$ 25.000.
- Se o Matheus construir com Claude Code adaptando o VoiceInk, custo de dev cai muito e vira tempo dele.

**Assinatura de código (obrigatória, app injeta teclas = comportamento de keylogger):**
- Mac: Apple Developer Program US$ 99/ano (inclui notarização).
- Windows: Azure Artifact Signing ~US$ 9,99/mês (~R$ 120/ano) se qualificar; senão cert EV US$ 400-700/ano.

**Custo fixo mensal:**
- MVP validando: ~R$ 3-5/mês (só domínio .com.br, R$ 40/ano).
- Operando: ~R$ 140-170/mês (Supabase Pro US$ 25 + domínio) OU VPS enxuta ~R$ 30-40/mês (Matheus já tem VPS).
- Ponto de equilíbrio: 6 assinantes/mês cobrem o Supabase Pro.

**Assinantes pra bater cada meta (líquido, R$ 29,90/mês = ~R$ 24,72 líquido/assinante):**

| Meta líquida/mês | Assinantes ativos |
|---|---|
| R$ 5.000 | ~203 |
| R$ 10.000 | ~405 |
| R$ 20.000 | ~809 |

Referência: 500 assinantes a R$ 29,90 = bruto R$ 14.950, taxas R$ 2.590, custo fixo ~R$ 138, **lucro ~R$ 12.222/mês (margem líquida ~81,8%)**. Mix pendendo pra anual/vitalício reduz o número de ativos necessário e melhora caixa.

## 7. Como vender (funil + canais)

**Funil: FREEMIUM com teto de uso, não trial de 7 dias.** O valor do ditado só aparece com uso repetido na rotina; 7 dias raramente cria hábito. Freemium deixa o app instalado e usado por meses, criando dependência até bater o limite e pagar sozinho (o funil mais passivo possível).

- Estrutura: grátis com limite (ex: X min/dia) que entrega valor mas incomoda quem usa de verdade. Gatilho de upgrade no momento que bate o limite.
- Cobrança: Pix recorrente + cartão. Plano anual com desconto pra travar receita.
- Tráfego de intenção alta (Google Search): venda direta com garantia de 7 dias (público já quer resolver).
- Regra: freemium no tráfego frio (Meta/TikTok/conteúdo), venda direta com garantia no Google Search.

**Canais (ordem de prioridade):**
1. Meta Ads (motor principal, Matheus domina): criativo de screen recording mostrando fala virando texto na tela. Otimizar por instalação/trial iniciado.
2. Google Ads Search: "ditar texto no computador", "transcrever áudio em texto", "alternativa ao [concorrente]". CAC saudável, escalável sem criativo novo.
3. YouTube: ads de demo 2min + orgânico/SEO. Tráfego passivo por anos.
4. SEO/blog evergreen: cauda longa. Não depende de verba diária, ideal pra renda passiva.
5. Afiliados e creators de nicho (produtividade/direito/medicina), comissão recorrente.
6. TikTok/Reels orgânico de demo + retargeting.

**Retenção:** ativação D0 (ditar primeiro texto real em 2 min), dunning com Pix como fallback (recupera 20-40% do churn involuntário), empurrar anual após 2-3 meses, alertas de valor, fluxo de save no cancelamento.

## 8. Riscos e como mitigar (verificado adversarialmente)

**Whisper local = custo zero. CONFIRMADO, mas:**
- Desempenho em hardware BR típico é o maior asterisco. PC fraco (4GB, Celeron) roda bem só `tiny`/`base`. `small` cai pra 0,4-0,6x tempo real em CPU; `medium`/`large` sem GPU são impraticáveis. **Mitigação:** modelo pequeno/turbo por padrão, modelo carregado na memória (warm start), detectar hardware. No Mac, WhisperKit resolve via Neural Engine.
- O custo migra pro usuário (energia, CPU, espera). Zero pro dono, não em absoluto.
- Custo zero só vale enquanto for 100% on-device. Fallback cloud volta a ter custo. **Mitigação:** manter arquitetura local; precificar fallback se houver.
- Se usar modelo destilado de terceiros, checar licença daquele checkpoint antes de uso comercial.

**Ditado global viável. CONFIRMADO, mas:**
- Inserção não é 100% universal (~95%). Campo de senha (Secure Input Mac / Winlogon Windows) bloqueia de propósito. Citrix, desktops virtuais, alguns apps corporativos bloqueiam clipboard. **Mitigação:** clipboard+paste padrão + fallback char-a-char + botão manual "colar último".
- Mac exige permissão de Acessibilidade concedida manualmente. Fricção de onboarding. **Mitigação:** onboarding guiado que detecta se foi concedido.
- Distribuição fora da App Store (Developer ID + notarização); Accessibility API reprova na Mac App Store. Viável, só não é "App Store".
- Windows UIPI: app normal não injeta em janela rodando como admin (falha silenciosa). Contornar dá trabalho, nem sempre vale no MVP.

**Assinatura recorrente desktop no BR. CONFIRMADO, mas:**
- Kiwify e Hotmart são gateways de infoproduto, não sistemas de licenciamento. Não geram license key, ativação por máquina nem grace period. **Toda a camada de licença você constrói por cima do webhook.**
- Vender app puro é zona cinzenta nessas plataformas (risco de suspensão maior). **Mitigação:** preferir Hotmart (tem GET de assinaturas pra reconciliar; Kiwify só tem `/sales`). Alternativa mais aderente: Paddle/FastSpring/Lemon Squeezy ou Keygen/Cryptlex.
- Webhook é frágil (pode falhar/atrasar/chegar fora de ordem). **Mitigação:** idempotência, retry, verificação de assinatura, reconciliação.
- Offline: checagem online não cobre uso sem internet. **Mitigação:** emitir JWT assinado com validade/grace period pra validar local.
- O corte de acesso é responsabilidade do TEU código (a plataforma corta a área de membros, não o app). Esquecer = inadimplente continua usando.
- Assinatura do app importa contra antivírus (simula teclado = comportamento de keylogger). Publisher novo pode ver aviso do SmartScreen nos primeiros ~1000 downloads mesmo assinado; reputação acumula com volume.

**Riscos de negócio:**
- "Passivo" com ads pagos é ilusão parcial. Tráfego pago exige criativo novo constante. Renda passiva de verdade vem de SEO/orgânico/afiliados (demoram a maturar). **Mitigação:** montar SEO e YouTube orgânico em paralelo desde o começo.
- Concorrência de gigantes (Windows, Google, Apple, WhatsApp têm ditado nativo grátis). **Mitigação:** o diferencial pt-BR é a resposta ao "por que pagar?".
- Churn de ticket baixo. **Mitigação:** ativação D0 + integração no fluxo + retenção estruturada.
- Suporte em pt escala mal com ticket baixo. **Mitigação:** FAQ/autoatendimento forte.

## 9. Roadmap de fases

**Fase 0 — Testar o MVP na máquina do Matheus (dias a 2 semanas)**
- Núcleo Mac-only: Swift + WhisperKit (ou Tauri + whisper-rs), adaptando o VoiceInk.
- Fluxo mínimo: segurar atalho → gravar → transcrever local → colar no cursor.
- Sem licença, sem cobrança, sem onboarding bonito. Só provar que "falo e o texto aparece" funciona bem em pt-BR nos apps que o Matheus usa.
- **Meta:** validar qualidade de transcrição pt-BR, latência e confiabilidade de inserção na máquina real.

**Fase 1 — Lançar (Mac-first)**
- Adicionar: onboarding de permissões, dicionário custom, limpeza de fala, pontuação automática, formatação WhatsApp, tray, free tier.
- Camada de licença: webhook Hotmart/Kiwify → banco → JWT assinado com grace period. Tratar `subscription_late`/`canceled`.
- Assinar e notarizar (Apple Developer US$ 99/ano).
- Preço: mensal R$ 29,90 + anual + vitalício, Pix + cartão.
- Aquisição: Meta Ads + Google Search + começar SEO/YouTube.
- **Meta:** primeiros assinantes pagantes, validar LTV/churn real antes de pisar no acelerador.

**Fase 2 — Escalar**
- Portar pro Windows (aí o valor do Tauri aparece; se começou em Swift, é reescrita da parte nativa). Assinar Windows (~R$ 120/ano).
- V2: modos por contexto, comandos de voz pt, histórico, transcrição de arquivo.
- Escalar canais: afiliados/creators de nicho, SEO evergreen, YouTube.
- **Meta:** 400-800+ assinantes ativos (R$ 10k-20k/mês líquido).

## 10. Próximo passo imediato

**Construir a Fase 0, Mac-only, adaptando o VoiceInk.** Ordem exata:
1. Fork/estudo do VoiceInk (Swift + whisper.cpp/WhisperKit) como esqueleto.
2. Registrar atalho global que grava ao segurar e para ao soltar.
3. Capturar áudio 16kHz mono, VAD pra cortar silêncio.
4. Rodar Whisper local (modelo `small` ou turbo, warm start) e pegar o texto.
5. Inserir via clipboard+paste (salvar → escrever → Cmd+V → restaurar).
6. Pedir permissões no onboarding: Acessibilidade + Microfone.
7. Testar em app real (WhatsApp Web, Gmail, Notion, editor). Anotar onde o paste falha.

Factível com Claude Code em dias, adaptando o open-source. Só depois de provar que funciona bem em pt-BR na máquina real é que entra licença, cobrança e polimento. Não gastar tempo em assinatura de código, Windows ou funil antes do núcleo estar sólido.
