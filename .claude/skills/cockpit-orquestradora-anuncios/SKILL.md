---
name: cockpit-orquestradora-anuncios
description: Camada de inteligência da Cockpit Tráfego — orquestra a skill cockpit-meta-ads pra gerar diagnóstico, relatório, auditoria e estratégia de tráfego pago. Usa benchmarks brasileiros, Quality Gates e Health Score. Entrega sugestões diretas e acionáveis sem citar fontes externas. Use quando o usuário disser /cockpit-orquestradora-anuncios, /cockpit orquestradora, /cockpit diagnostico, /cockpit relatorio, /cockpit auditoria, "analisa a conta", "diagnóstico de tráfego", "health score", "relatório do cliente", "audita essa campanha", "como tá a conta", ou pedir análise estratégica de Meta Ads.
---

# Cockpit Orquestradora de Anúncios

> **Fase beta:** opera só com Meta Ads. Google Ads e GA4 entram na fase 2.

Camada de inteligência da Cockpit Tráfego. Diagnostica contas, gera relatórios visuais, audita campanhas e aplica Quality Gates com benchmarks do mercado brasileiro e frameworks operacionais do Pedro Sobral.

**Não executa ações na API diretamente** — delega pra skill de execução:

- **Meta Ads**: skill `cockpit-meta-ads` (SDK oficial `facebook-business`)

Se a skill `cockpit-meta-ads` não estiver instalada ou configurada, orientar o usuário a rodar `/cockpit-meta-ads setup` antes.

---

## Setup

Na primeira vez, rodar:
```
/cockpit-orquestradora-anuncios setup
```

### Fluxo do setup

1. **Detectar Python correto** com SDK Meta instalado (ver seção abaixo)
2. **Verificar se `cockpit-meta-ads` está disponível e configurada**:
   ```bash
   ls "$HOME/claude/Ratos OS/.claude/skills/cockpit-meta-ads/SKILL.md" 2>/dev/null && echo "META_OK"
   grep -E '^META_ADS_TOKEN="?.+"?' "$HOME/claude/Ratos OS/.claude/skills/cockpit-meta-ads/.env" 2>/dev/null && echo "META_CONFIGURED"
   ```
   Se faltar: orientar `/cockpit-meta-ads setup`.
3. **Importar contas do `cockpit-meta-ads/contas.yaml`** pra popular o `contas.yaml` da orquestradora
4. Testar conexão listando contas: `read.py accounts`
5. Confirmar pronto

### Importação de contas

**Passo A** — verificar se já existe `cockpit-meta-ads/contas.yaml`:
```bash
ls "$HOME/claude/Ratos OS/.claude/skills/cockpit-meta-ads/contas.yaml" 2>/dev/null && echo "TEM_CONTAS"
```

**Passo B** — se existir, perguntar ao usuário:
> "Encontrei contas já cadastradas em cockpit-meta-ads. Posso puxar os IDs e preencher o cockpit-orquestradora-anuncios automaticamente?"

**Passo C** — se sim, ler o yaml e copiar a estrutura. Mostrar o resultado e perguntar se ficou certo.

**Passo D** — se não tiver yaml ou for cadastrar mais, listar contas via API (`read.py accounts`) e perguntar quais salvar.

---

## Comandos

| Comando | O que faz | Quando usar |
|---|---|---|
| `/cockpit-orquestradora-anuncios setup` | Configura contas e testa conexões | Primeira vez |
| `/cockpit diagnostico [cliente]` | Health Score + KPIs + alertas automáticos | Check diário (5 min) |
| `/cockpit relatorio [cliente]` | Dashboard HTML com benchmarks BR | Entrega pro cliente (semanal/mensal) |
| `/cockpit auditoria [cliente]` | Análise profunda com Quality Gates + frameworks Sobral | Revisão mensal |
| `/cockpit historico [cliente]` | Registra e consulta otimizações e hipóteses | Após cada ação |
| `/cockpit estrategia [cliente]` | Plano de ação estratégico baseado em Sobral | Antes de subir verba ou lançar |

Se o usuário não especificar cliente, perguntar qual.

---

## Cadastro de contas (`contas.yaml`)

**Arquivo:** `contas.yaml` (na raiz da skill, `Ratos OS/.claude/skills/cockpit-orquestradora-anuncios/contas.yaml`)

Antes de executar qualquer comando, o Claude DEVE ler este arquivo pra resolver nome de cliente → ID de conta.

Estrutura mínima esperada:
```yaml
clientes:
  - nome: "Hypertech"
    meta:
      conta_anuncio: "act_191737889662177"
      page_id: "..."
      instagram_id: "..."
```

Se o cliente não estiver cadastrado, perguntar e oferecer adicionar.

---

## Referências (carregar sob demanda)

| Arquivo | Quando carregar |
|---|---|
| `references/benchmarks-br.md` | Diagnóstico, relatório e auditoria |
| `references/quality-gates.md` | Auditoria e diagnóstico |
| `references/principios-sobral.md` | **Sempre que for sugerir melhoria, diagnosticar problema ou gerar recomendação acionável.** Mapeia métrica → framework do Sobral. |

**O Claude DEVE ler o arquivo de referência relevante ANTES de executar o comando.**

### Princípios Sobral aplicados (a inteligência desta orquestradora)

A orquestradora foi calibrada com base nas Lives do Pedro Sobral (canal Subido). O Obsidian do Matheus tem o material indexado em:

```
/Users/matheusjardim/claude/obsidian/Matheus/Trabalho/Aprendizado/Cursos/Pedro Sobral — Lives Subido/
```

**Fluxo quando o comando envolve gerar sugestão:**

1. Ler `references/principios-sobral.md` (mapa rápido de métrica → live)
2. Se sintoma se encaixa num framework do Sobral, **ler a nota da live específica** no Obsidian pra detalhe operacional
3. Gerar sugestão **direta e acionável**, sem citar a fonte. A inteligência do Sobral é insumo interno — o aluno não precisa saber de qual Live veio.
4. **NUNCA citar "Live 361", "Live 367", "Pedro Sobral disse...", "pela aula X..."** no output final. A sugestão deve soar como conhecimento próprio da orquestradora.
5. Se o sintoma **não** tem cobertura nas lives, gerar sugestão própria sem disclaimer.

**Exemplos:**

❌ **Errado:** "Pela Live 361 (Andrômeda), teu conjunto tem 4 anúncios e o ideal é 8-15 conceitualmente distintos."

✅ **Certo:** "Teu conjunto tem 4 anúncios. Pra essa fase do algoritmo, o ideal é 8-15 anúncios conceitualmente distintos (não variações cosméticas). Sugiro adicionar 4 anúncios novos com ângulo, formato ou narrativa diferentes."

❌ **Errado:** "Pela Live 367, anúncio é a isca, segmentação é o lago."

✅ **Certo:** "Tua segmentação tá muito ampla. Refina pelo próprio anúncio (gancho + corpo) — o criativo filtra melhor que público frio."

**Frameworks-chave aplicados em diagnóstico/auditoria** (usar como insumo interno, NUNCA citar a referência no output):

#### Estrutura de campanha
- 3 níveis: Campanha (POR QUÊ + QUANTO) → Conjunto (PARA QUEM + ONDE) → Anúncio (O QUÊ)
- Se a conta não respeita essa hierarquia, **flag de auditoria estrutural**

#### Andrômeda — Meta Ads
- Conjunto com **menos de 6 anúncios** = subótimo. Ideal: **8-15 anúncios conceitualmente distintos** (não variações cosméticas).
- Mesmo criativo com cor diferente = Meta detecta como o mesmo. Diversificar: formato + narrativa + gancho + ângulo + público implícito.
- **Orçamento Advantage (CBO)** = usar em 99% dos casos. Se a conta tá com ABO em campanha pra escala, **flag**.
- **Posicionamento Advantage** = usar 80% das vezes. Manual só pra anúncio específico ou qualificação de renda.
- **Criativo Advantage "Automaticamente melhorar"** = sempre desativar.

#### Segmentação
- 7 formas no Meta: objetivo + automática + manual + manual de conteúdo + pixel/CAPI + interações passadas + **o próprio anúncio** (mais poderoso)
- Anúncio é a isca, segmentação é o lago, pixel torna o ímã da isca mais forte
- Públicos super quentes > quentes > frios — testar nessa ordem

#### Copy
- Anúncio camuflado × explícito — usar os dois. Camuflado pega nível baixo de consciência, explícito pega nível alto.
- 5 elementos: referências + camuflado/explícito + filtro (não ímã) + estrutura GCC (Gancho/Corpo/CTA) + quantidade/qualidade
- 3 tipos de gancho: falado + escrito + visual. **NUNCA repetir o falado no escrito** (maior erro).
- 44% dos usuários do Instagram assistem sem som → gancho escrito é essencial.

#### Lead Ad
- Mais etapa = lead mais caro mas mais qualificado
- Lead Scoring pra priorizar comercial
- "Maximizar leads" como ponto de partida. Se vier desqualificado, muda pra "Maximizar leads convertidos" (precisa de 60+ conversões/sem)
- Lógica condicional fecha formulário pra perfis ruins → Meta para de buscar parecidos

#### WhatsApp / Negócio local
- CBO primeiro. ABO só pra controle manual de público
- "Total" quando tem horário comercial
- Follow-up é o maior diferencial
- 19 Regras de Ouro do atendimento WhatsApp (carregar `principios-sobral.md`)

#### Estratégia geral
- **Google = INTENÇÃO. Meta = ATENÇÃO + RELAÇÃO.** Saber qual ferramenta pra qual nicho.
- Verba mínima recomendada: R$1.200/mês
- Iniciante cobra R$300-500/mês por negócio local. 10 contas → R$3-5k/mês.

---

## Quality Gates aplicados

Carregar `references/quality-gates.md`. Os principais (resumo):

### Sinais críticos (red flag — agir AGORA)
- CTR < 0.5% no Meta (link click) — criativo morrendo
- Frequência > 5 sem aumento de conversão — saturação de público
- CPA 2x acima do benchmark do nicho — escalar pode ser piorar
- Conjunto < 6 anúncios ativos — perdendo Andrômeda (L361)
- ROAS < 1.0 sustentado por 7+ dias — perdendo dinheiro

### Sinais amarelos (atenção)
- Frequência entre 3 e 5 — começar a renovar criativo
- CTR entre 0.5% e 1.0% — testar novo gancho
- CPA entre 1.2x e 2x do benchmark — auditar criativos e públicos
- Conjunto com 6-7 anúncios — adicionar 2-3 conceitos novos

### Sinais verdes (escalar)
- CTR > 1.5% sustentado 7+ dias
- Frequência < 2 com CTR alto = público com room pra crescer
- CPA < benchmark e ROAS > 2.5 — pode subir 20% de verba sem cair eficiência

---

## Health Score (nota A-F)

Compõe da seguinte forma:

| Item | Peso | Critério |
|---|---|---|
| Estrutura | 20% | Hierarquia respeitada + nomenclatura clara + CBO usado |
| Andrômeda | 20% | 6+ anúncios por conjunto + diversidade de conceito |
| Copy | 15% | GCC presente + gancho escrito + camuflado+explícito |
| Segmentação | 15% | Usa 3+ tipos diferentes + pixel ativo |
| Performance | 20% | CTR + CPA + ROAS vs benchmark BR |
| Frequência | 10% | Distribuição saudável, não saturado |

**Faixas:**
- 90-100: A (escalar)
- 75-89: B (otimizar pontos médios)
- 60-74: C (atenção — refazer fundamentos)
- 40-59: D (reestruturar)
- 0-39: F (refazer do zero)

---

## Aprendizados (memória persistente)

**Arquivo:** `aprendizados.md` (na raiz da skill)

1. **Ler `aprendizados.md` no início de QUALQUER comando** (diagnóstico, relatório, auditoria)
2. **Quando o usuário corrigir algo**, perguntar: "Quer que eu registre isso nos aprendizados pra não esquecer nas próximas vezes?"
3. **Quando o usuário pedir** ("lembra disso", "registra", "anota"), registrar imediatamente
4. **Ser proativo**: se o usuário pedir pra refazer ou ajustar algo, perguntar se quer registrar
5. **Não duplicar** — verificar se já existe regra similar antes de adicionar

A `cockpit-meta-ads` tem seu próprio `aprendizados.md` pra regras de execução. O da orquestradora é pra preferências de formato, regras de análise e diagnóstico.

---

## Regras gerais

1. **NUNCA usar MCPs** — toda execução é via scripts Python da `cockpit-meta-ads`. Sem fb-ads-mcp-server, adloop ou qualquer outro MCP de terceiro.
2. **Benchmarks BR** — sempre usar benchmarks do mercado brasileiro (não americano)
3. **Terminologia PT-BR** — nunca usar termos em inglês no output (spend → gasto, reach → alcance)
4. **Números sempre** — alertas e recomendações com números específicos, nunca vagos
5. **Comparativo** — sempre comparar com período anterior quando possível
6. **Priorizar por impacto financeiro** — alertas ordenados por maior economia primeiro
7. **NUNCA citar fonte** — sugestões calibradas com lives do Sobral são entregues como conhecimento próprio. Não mencionar "Live X", "Pedro Sobral", "pela aula Y" no output. A fonte é insumo interno apenas.

---

## Detecção do Python correto (OBRIGATÓRIO)

Antes de rodar qualquer script da `cockpit-meta-ads`, detectar qual `python3` tem o SDK instalado:

```bash
PYTHON=$(python3 -c "import facebook_business; print('OK')" 2>/dev/null && echo "python3" || \
  (/opt/homebrew/bin/python3 -c "import facebook_business; print('OK')" 2>/dev/null && echo "/opt/homebrew/bin/python3") || \
  echo "NONE")
```

Se `NONE`: orientar `pip3 install facebook-business`.

Depois, SEMPRE usar esse Python:
```bash
$PYTHON "$HOME/claude/Ratos OS/.claude/skills/cockpit-meta-ads/scripts/read.py" accounts
```

---

## Detecção da skill cockpit-meta-ads

```bash
SKILL_PATH="$HOME/claude/Ratos OS/.claude/skills/cockpit-meta-ads"
ls "$SKILL_PATH/SKILL.md" 2>/dev/null && echo "META_OK"
```

Se não existir, orientar:
> "A skill `cockpit-meta-ads` não tá instalada. Roda `/cockpit-meta-ads setup` primeiro pra configurar o acesso à API do Meta Ads."

---

## Tabela de terminologia PT-BR

| Inglês | Português |
|---|---|
| spend | gasto |
| reach | alcance |
| impressions | impressões |
| clicks | cliques |
| conversions | conversões |
| cost per lead | custo por lead (CPL) |
| click-through rate | taxa de cliques (CTR) |
| cost per click | custo por clique (CPC) |
| cost per mille | custo por mil (CPM) |
| frequency | frequência |
| return on ad spend | retorno sobre investimento (ROAS) |
| budget | orçamento |
| ad set | conjunto de anúncios |
| ad creative | criativo |
| landing page | página de destino |
| conversion rate | taxa de conversão |
| audience | público |
| placement | posicionamento |
| daily budget | orçamento diário |
| lifetime budget | orçamento vitalício |

---

## Próximas fases (roadmap)

- **Fase 2:** adicionar Google Ads (skill `cockpit-google-ads` — duplicar `google-ads-ratos`)
- **Fase 2:** adicionar GA4 (skill `cockpit-ga4` — duplicar `ga4-ratos` se existir)
- **Fase 3:** análise cross-platform (Meta + Google + GA4 num diagnóstico unificado)
