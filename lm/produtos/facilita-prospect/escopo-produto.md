# Facilita SDR — Escopo de Produto

> Máquina de prospecção outbound no WhatsApp pra encher o funil do Facilita.
> Status: escopo v2 (07/08/2026). Nome: **Facilita SDR**.

## 1. O problema

O Facilita tá pronto, rodando em 2 clínicas pagantes em potencial (Pulmonar e Compass), mas não tem máquina de aquisição. Prospecção hoje é manual: achar clínica, chamar no WhatsApp, conversar, marcar call. Não escala com o Matheus operando 2 agências.

## 2. A solução em uma frase

Sistema que dispara mensagens frias pra listas de clínicas no WhatsApp, e quando a clínica responde, uma IA SDR assume a conversa com um único objetivo: **marcar reunião com o Matheus (ou Valentino)**. Lead que fecha na reunião vira clínica trial dentro do Facilita.

## 3. Fluxo completo (visão macro)

```
Lista de clínicas (Apify / Google Maps)
        ↓ importa CSV
   [ PROSPECT ]
        ↓ campanha de disparo (cadência + variação de copy)
   WhatsApp do chip de prospecção (uazapi)
        ↓ clínica responde → webhook
   IA SDR (Claude na VPS)
        ↓ qualifica + quebra objeção + oferece horários
   Reunião marcada (Google Calendar do Matheus)
        ↓ lembrete D-1 automático (mesma régua do Facilita)
   Call de venda (Matheus/Valentino)
        ↓ fechou
   Clínica criada em trial no Facilita (via API admin)
```

## 4. O que já existe e vai ser reusado

| Peça | De onde vem | Como entra no Prospect |
|---|---|---|
| Cliente uazapi completo | `ia-clinicas/lib/uazapi.ts` | copiar: enviar texto/mídia, digitando, webhook, QR, auto-recuperação de token |
| Motor de IA + tools | `ia-clinicas/lib/ia.ts` | padrão das tools adaptado pra Claude Code headless na VPS (saída em JSON de ação), prompt novo de SDR |
| Delay humanizado + debounce de rajada | webhook do Facilita | essencial em prospecção (parecer humano importa ainda mais) |
| Google Calendar | `ia-clinicas/lib/gcal.ts` | ler agenda do Matheus e criar o evento da reunião |
| Réguas (D-1, follow-up) | `ia-clinicas/lib/reguas.ts` | adaptar: lembrete de reunião + follow-up de não-resposta |
| Telegram alertas | `ia-clinicas/lib/alertas.ts` | lead quente, reunião marcada, chip caiu |
| Listas de leads | skill `prospeccao-apify` | fonte oficial de listas (clínicas por cidade/nicho) |
| Supabase | conta existente | criar projeto novo `facilita-prospect` (isolado do Facilita) |
| VPS 2.25.138.60 | já roda crons de otimização | worker de disparo + agente conversacional moram aqui |
| Instância WhatsApp | uazapi paga (`facilitaaiclinicas.uazapi.com`) | criar instância nova pro chip de prospecção |

Estimativa honesta: ~60% do código do v1 já existe no Facilita.

## 5. Arquitetura

**Decisão central: o conversacional roda na VPS, não na Vercel** (pedido do Matheus, e faz sentido técnico: disparo em fila precisa de processo vivo, sem teto de 60s de função serverless, delays longos à vontade).

```
┌─ VERCEL ────────────────────────────┐
│ Painel Next.js (prospect.vercel.app)│
│ listas, campanhas, pipeline,        │
│ conversas, métricas                 │
└──────────────┬──────────────────────┘
               │ lê/escreve
        ┌──────▼───────┐
        │   SUPABASE   │  (projeto novo)
        │ leads, msgs, │
        │ campanhas,   │
        │ reuniões     │
        └──────▲───────┘
               │ lê/escreve
┌──────────────┴──────────────────────┐
│ VPS (PM2, Node)                     │
│ 1. worker-disparo: fila com cadência│
│ 2. server-webhook: recebe respostas │
│    da uazapi e chama o agente       │
│ 3. agente SDR: Claude Code headless │
│    (plano já pago, zero API)        │
│ 4. crons: follow-up, lembrete D-1,  │
│    relatório diário no Telegram     │
└──────────────┬──────────────────────┘
               │ envia/recebe
        ┌──────▼───────┐
        │    uazapi    │ chip dedicado de prospecção
        └──────────────┘
```

Ponto importante (decisão do Matheus, 07/08): o agente roda no **Claude Code headless (`claude -p`) da VPS, usando o plano já pago**. Zero custo de API. Cada resposta de lead vira uma chamada `claude -p` com o histórico da conversa + prompt SDR; o Claude devolve JSON (ação + texto/áudio a enviar) e o worker executa. Dois cuidados: (1) o rate limit do plano é compartilhado com o uso normal do Matheus, então a fila processa uma conversa por vez (na escala de 30-80 disparos/dia sobra folga); (2) se um dia o volume estourar o plano, a troca pra API é só um flag no worker.

## 6. Módulos do produto

### 6.1 Leads e listas
- Importar CSV (formato do Apify: nome, telefone, cidade, nicho, site, nota Google)
- Dedup por telefone (nunca disparar 2x pro mesmo número, nem entre campanhas)
- Blocklist: quem pediu pra parar nunca mais recebe (obrigatório, primeiro item do backlog que vira código)
- Enriquecimento leve na importação: marcar se tem site, quantas avaliações no Google (personaliza a copy)

### 6.2 Campanhas de disparo
- **Abertura padrão definida (07/08)**: texto curto pedindo o responsável, no estilo "Oi, tudo bem? Gostaria de falar com o responsável da {nome_clinica}." Com 3-5 variações leves da mesma mensagem (sorteadas) pra não parecer spam idêntico
- Cadência anti-ban: 1 msg a cada 3-7 min (aleatório), teto de **30-40/dia por chip** nas primeiras 2 semanas, subindo até ~80/dia com chip maduro
- Janela de envio: seg-sex, 8h30-18h (configurável)
- Follow-up automático de silêncio: D+2 e D+5 sem resposta = mensagem curta de retomada (máx 2 follow-ups, depois lead vira "frio")
- Pausar/retomar campanha com um clique

### 6.3 Agente SDR (o coração)
Objetivo único: marcar a reunião. Não vende o Facilita por texto, vende a call.

- **Qualificação embutida na conversa** (sem parecer formulário): quem responde é dono ou secretária? Quantos profissionais? Sofre com telefone tocando / falta de paciente / no-show?
- **Pitch curto calibrado por dor**: anti-no-show (recupera ~R$3k/mês) ou "telefone para de tocar" (caso Pulmonar)
- **Script de vendas treinado nas fontes do Matheus, não em script genérico de SDR**: metodologia Nimoto (CLOSER, perguntas oficiais por etapa, MAGIC, tríade de ofertas, nutrição infinita) + playbook do Adriano Aquino (Os Escolhidos). Passo de construção próprio: destilar os materiais do Obsidian (`LM/Treinamentos/Mentoria Nimoto/` e `Os Escolhidos — Adriano/Playbook/`) num guia de conversa que vira o prompt do agente
- **Fluxo de abertura travado (07/08)**: disparo pede o responsável → alguém responde → agente confirma "você é o responsável?" → se SIM, envia **o áudio oficial** (um único áudio na voz do Matheus, guardado no banco) e segue a conversa pro agendamento → se NÃO, pede gentilmente pra falar com o responsável ou pega o melhor contato/horário
- **Áudio**: tool `enviar_audio` manda o áudio do banco como nota de voz (a uazapi já faz via `enviarMidia`). Um áudio só no v1; biblioteca com mais momentos fica pra depois se fizer sentido
- **Transparência (decisão 07/08)**: a IA NÃO se apresenta como IA por conta própria. Só se perguntarem: aí assume na boa, é uma IA prospectando justamente pra mostrar na prática o que ela faz. A própria conversa é a demo do produto
- **Tools do agente:**
  - `ver_horarios_reuniao`: lê Google Calendar do Matheus (e do Valentino se ativo), oferece 2-3 janelas
  - `marcar_reuniao`: cria evento com link do Meet, salva no banco, alerta Telegram
  - `atualizar_lead`: grava dor, nº de profissionais, sistema de agenda que usa (Feegow? Clinicorp? papel?)
  - `passar_pra_humano`: lead quente que quer falar agora, ou situação fora do script
  - `descartar_lead`: não é clínica, número errado, hostil (registra motivo)
- **Comportamento herdado do Facilita**: delay humanizado ~30s, digitando, debounce de rajada, "stop" cala a IA, atendente (tu) responde pelo painel e a IA pausa sozinha, transcrição de áudio

### 6.4 Agendamento e comparecimento
- Evento no Google Calendar com Meet + dados do lead na descrição
- Confirmação imediata no WhatsApp com dia/hora
- Lembrete D-1 e lembrete 1h antes (a régua que já existe, apontada pra reunião)
- No-show da call: IA tenta remarcar 1x automaticamente

### 6.5 Pipeline (CRM enxuto)
Colunas: **Novo → Disparado → Respondeu → Em conversa → Reunião marcada → Compareceu → Trial Facilita → Fechado / Perdido**

- Card do lead: dados da clínica, resumo da conversa (IA, igual o card do Facilita), dor mapeada, histórico
- Botão **"Criar trial no Facilita"**: chama a API admin do Facilita e já cria a clínica em trial (a ponte entre os dois produtos)
- Motivo de perda registrado (sem interesse, sem verba, já tem solução, sumiu)

### 6.6 Painel e métricas
- Conversas ao vivo (mesma tela do Facilita: bolhas, assumir/devolver, caixa de envio)
- Funil da campanha: disparadas → entregues → respostas (%) → reuniões (%) → fechamentos
- **Métrica-mãe: reuniões marcadas por 100 disparos**
- Custo por reunião (tokens + proporção do chip)
- Relatório diário no Telegram às 18h: disparos, respostas, reuniões do dia, leads quentes esperando

### 6.7 Multiusuário (desde o dia 1)
- Matheus e Valentino como closers desde o início: cada um com agenda conectada, round-robin ou escolha por região
- Visão de pipeline por closer

## 7. Modelo de dados (Supabase novo)

```
leads          (id, nome_clinica, telefone, cidade, nicho, site, avaliacoes,
                origem_lista, status, dor, num_profissionais, sistema_agenda,
                closer_id, motivo_perda, criado_em)
campanhas      (id, nome, templates[], cadencia_min/max, teto_dia, janela,
                status, criado_em)
campanha_leads (campanha_id, lead_id, disparado_em, followup1_em, followup2_em)
mensagens      (id, lead_id, role, texto, midia_url, criado_em)   ← histórico IA
reunioes       (id, lead_id, closer, inicio, gcal_event_id, meet_url,
                status: marcada|remarcada|realizada|no_show)
blocklist      (telefone, motivo, criado_em)
chips          (id, uazapi_token, numero, status, disparos_hoje, criado_em)
eventos        (id, lead_id, tipo, detalhe, criado_em)             ← log/auditoria
```

## 8. Riscos e regras de proteção (ler antes de ligar)

1. **Ban do WhatsApp é o risco nº 1.** uazapi é API não-oficial: disparo frio em volume é exatamente o que a Meta caça. **Decisão 07/08: começar com chip próprio** (já existente). Fica registrado o risco: se banir, cai ESSE número. Mitigação obrigatória: cadência lenta, copy variada, teto diário baixo (20-30/dia com chip que já tem histórico de uso normal), e migrar pra chip dedicado assim que a máquina provar que funciona. Arquitetura multi-chip desde o banco (tabela `chips`): trocar chip = trocar token.
2. **Blocklist é sagrada.** "Não quero", "para de mandar", "sai" = registra e nunca mais toca. Além de reduzir denúncia (o que derruba chip), é postura LGPD.
3. **LGPD**: prospecção B2B pra telefone comercial público tem defesa razoável (legítimo interesse), mas guarda a origem do dado (`origem_lista`) e honra opt-out imediato.
4. **Não misturar com o Facilita em produção**: banco separado, instância separada, deploy separado. Se o chip de prospecção cair, nenhuma clínica pagante sente.
5. **Custo: zero de mensalidade nova.** IA roda no plano Claude já pago (Claude Code headless na VPS), painel na Vercel Hobby (grátis), Supabase Free, VPS já existe. Único custo novo real: o chip de prospecção (e instância extra na uazapi, se cobrar). Vigiar só o rate limit do plano, que é compartilhado com o uso diário do Matheus.

## 9. Construção (versão completa de uma vez, decisão do Matheus 07/08)

Sem MVP fatiado: a entrega é o sistema completo, com Valentino dentro desde o dia 1. A lista abaixo é ordem de ataque (dependência técnica), não fases de entrega:

1. Projeto Supabase novo + schema completo (closers e multi-chip já no banco)
2. Portar libs do Facilita (uazapi, gcal, alertas) + montar o agente SDR headless na VPS
3. Destilar Nimoto + Adriano Aquino do Obsidian → guia de conversa → prompt do agente
4. Matheus grava os áudios-chave (roteiro sai do passo 3)
5. Worker de disparo: fila, cadência, janela, teto por chip, follow-ups D+2/D+5
6. Webhook + conversa com as 7 tools (ver_horarios, marcar, atualizar_lead, passar_pra_humano, descartar, enviar_audio, blocklist)
7. Agendamento: Calendar dos 2 closers com round-robin, Meet, lembrete D-1 + 1h antes, remarcação de no-show
8. Painel completo na Vercel: pipeline, conversas ao vivo, assumir/devolver, métricas, A/B de template, botão "Criar trial no Facilita"
9. Relatório diário no Telegram
10. Piloto real: lista de ~200 clínicas, 30/dia, chip aquecido antes

**Critério de aceite: reunião marcada pela IA sem humano encostar na conversa.**

### Fora do escopo (por decisão)
- Vender o Prospect como produto pra terceiros (por ora é ferramenta interna)
- Disparo de mídia/áudio na abertura (só texto no frio; mídia só dentro da conversa)
- CRM completo estilo Clint (pipeline enxuto resolve)

## 10. Decisões tomadas (07/08)

- **Nome: Facilita SDR** (escolhido pelo Claude por delegação do Matheus; trocar é só renomear no doc)
- **Chip**: começa com chip próprio já existente (risco de ban registrado no item 8.1; migrar pra dedicado quando a máquina provar)
- **Nicho da primeira lista**: clínicas em geral (sem recorte de especialidade)
- **Transparência**: só se perguntarem; aí assume que é uma IA prospectando justamente pra mostrar o poder do produto na prática
- **Fluxo de abertura**: texto pede o responsável → confirma "você é o responsável?" → SIM = envia o áudio oficial do banco → segue pro agendamento
- **Áudio**: um único áudio oficial na voz do Matheus (v1)
- Valentino entra desde o dia 1 como segundo closer
- Construção completa de uma vez, sem MVP fatiado
- IA roda no Claude Code headless da VPS usando o plano já pago (zero custo de API)
- Script do agente nasce do Nimoto + playbook Adriano Aquino

## Em aberto
- **Cidade/praça da primeira lista** (o nicho tá definido, falta a geografia)
- Roteiro do áudio oficial (sai do destilado Nimoto/Adriano)
