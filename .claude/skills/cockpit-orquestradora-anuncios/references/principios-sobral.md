# Princípios Sobral — Referência pra diagnóstico e sugestões de melhoria

Esta referência consulta as **notas de aulas do Pedro Sobral** no Obsidian do Matheus. Use estes princípios pra cruzar com as métricas observadas e sugerir melhorias **na linha de raciocínio do Sobral**.

## Localização das notas

**Pasta raiz**: `/Users/matheusjardim/claude/obsidian/Matheus/Trabalho/Aprendizado/Cursos/Pedro Sobral — Lives Subido/`

**Índice mestre**: `Pedro Sobral — Índice de Lives.md`
→ Tabela completa de lives por categoria + glossário denso de todos os frameworks do Sobral com referência cruzada (qual live cobre qual conceito).

**SEMPRE comece lendo o índice.** Ele contém o glossário consolidado que basta pra 80% dos casos. Só vai buscar a live específica quando precisar de detalhe operacional (passo a passo, prompts, exemplos).

## Quando consultar esta referência

- **Antes de gerar sugestões de melhoria** em diagnóstico, auditoria ou relatório
- **Quando o usuário pedir** "o que o Sobral faria aqui", "linha de raciocínio do Sobral", "estilo Subido"
- **Quando observar problema clássico** que tem nome/framework conhecido (lead caro, CPM alto, criativo saturado, lookalike ruim, etc) — buscar como o Sobral aborda

## Como usar (fluxo)

1. Identificar o **sintoma na métrica** (ex: CPL subiu 40% na campanha de WhatsApp)
2. Ler o índice e localizar **a live + framework relevante** (ex: Live 375, "3 filtros que definem qualidade do lead")
3. Ler a nota da live específica se precisar de detalhe
4. Cruzar o framework com o dado real
5. Sugestão de melhoria sai **linkada à fonte** (sempre citar qual live ensina aquilo)

> Não invente princípios "estilo Sobral". Se não tiver na nota, diga isso explicitamente: "esse cenário não tem cobertura nas lives indexadas, sugestão é minha".

## Mapa rápido de problema → live (heurística inicial)

Pra acelerar a busca antes mesmo de abrir o índice:

### Problemas de campanha
| Sintoma | Lives relevantes |
|---|---|
| Lead caro / desqualificado (WhatsApp) | 375 (3 filtros), 367 (segmentação), 372 (filtro via copy) |
| Lead caro / desqualificado (Formulário nativo) | 381 (lead scoring, lógica condicional, MIT) |
| CTR baixo, anúncio saturando | 372 (referências, GCC, 7 fatores), 382 (atração × qualidade) |
| Muito clique mas pouca mensagem no WhatsApp | 375 ("anúncio não comunicou o que acontece depois") |
| Google Ads CPC alto, sem conversão | 315 (lógica do bolo de cenoura), 365 (10 passos), 323 (palavras negativas) |
| Pmax/Advantage+ rendendo abaixo | 361 (8 regras de ouro de automatização) |
| Andrômeda: anúncios "semelhantes" sendo unificados | 361 (8-15 conceitos distintos, não variações) |

### Problemas de público
| Sintoma | Lives relevantes |
|---|---|
| Público frio caro | 367 (passos 2-4: superquente → quente → frio), 323 (segmentos personalizados) |
| Sem remarketing rodando | 367 (passo 2), 365 (display de remarketing) |
| Negócio local anunciando longe | 365 ("Presença" vs "Interesse"), 374 (geo 1km + pino) |
| Lookalike ruim | 367 (lista de e-mails de comprador → semelhante > lista de leads → semelhante) |

### Problemas de criativo
| Sintoma | Lives relevantes |
|---|---|
| Anúncios muito parecidos | 361 (Andrômeda detecta similaridade), 372 (8-15 conceitos distintos) |
| Sem gancho forte | 372 (3 tipos: falado, escrito, visual + 4 tipos de gancho falado) |
| Sem fator de segmentação | 372 (7 fatores: direta, conhecimento, ferramenta, situação, comportamento, crença, rotina) |
| Anúncio bonito mas não vende | 372 ("anúncio é filtro, não ímã") |
| Não tem referência | 372 (biblioteca de anúncios com filtros + Instagram do nicho) |

### Problemas de página / destino
| Sintoma | Lives relevantes |
|---|---|
| Página converte mal | 373 (20 pilares de uma boa LP) |
| Headline fraca | 373 (pilar 4-5: headline + subheadline) |
| Falta botão / CTA | 373 (pilar 6-7: botão na 1ª dobra + cada seção) |
| Sem prova social | 373 (pilar 11: 3 perguntas mágicas pra depoimento) |
| Página lenta | 373 (pilar 18: pagespeed.dev) |
| Sem quebra de objeção | 373 (pilar 12) |

### Problemas estratégicos
| Sintoma | Lives relevantes |
|---|---|
| Cliente novo, falta plano | 374 (5 perguntas + ferramenta de diagnóstico + tipos de campanha por nicho) |
| Tudo só na conversão, sem aquecimento | 374 (colher × plantar), 382 (descoberta + aquecimento) |
| Sem campanha de remarketing | 374 (campanhas obrigatórias por nicho), 365 (display) |
| Cliente reclamando da qualidade do lead | 375 (cliente oculto retroativo: análise de conversa antiga), 374 (CRM) |
| Atendimento WhatsApp mata o lead | 375 (19 regras de ouro + MIT Lead Response Study) |
| Cliente "achou que ia ser milagre" | 333 (onboarding: explicar que tráfego não é da noite pro dia), 374 |

### Problemas de retenção / relacionamento com cliente
| Sintoma | Lives relevantes |
|---|---|
| Cliente novo entrando | 333 (Onboarding completo: 3 ligações + checklist) |
| Cliente desconfiado, vai cancelar | 333 (cliente oculto + reforço de cooperação + manuais bônus) |
| Cliente reclama "achei que você ia fazer X também" | 333 (alinhamento de expectativas na ligação 1) |
| Cliente tem base inativa | 374 (Grupo VIP + reativação), 375 (lista de e-mail antigo) |

### Problemas conceituais / de mercado
| Sintoma | Lives relevantes |
|---|---|
| Tudo parecendo IA, conversão caindo | 383 (AI Blindness, mineração de contexto) |
| Mercado saturado | 383 (paradoxo de Jevons), 382 (cenário macro) |
| Gestor preso só rodando campanha | 383 (empilhar habilidades), 346 (MCV) |

## Frameworks-âncora do Sobral (mais usados em diagnóstico)

Detalhe completo no índice. Aqui é só pra a IA reconhecer o nome quando observar a métrica.

- **Lógica do bolo de cenoura fofinho** — palavra-chave pesquisada = anúncio = página. (L315)
- **8-15 anúncios conceitualmente distintos** (Andrômeda) — não variações cosméticas. (L361)
- **3 filtros de qualidade do lead** — objetivo + segmentação + anúncio. (L375)
- **GCC** — Gancho + Corpo + CTA. Gancho é o 80/20. (L372)
- **7 fatores de segmentação via copy** — direta, conhecimento, ferramenta, situação, comportamento, crença, rotina. (L372)
- **Lead scoring + lógica condicional** — fechar formulário pra perfis errados. (L381)
- **MIT Lead Response Study** — 1min de demora = 391% mais conversão; 30min = 100× pior. (L381)
- **Colher × Plantar** — campanhas de venda × campanhas de atração. (L374, L382)
- **Públicos quentes > quentes > frios** — sempre testar nessa ordem. (L367)
- **5 níveis de consciência (Schwartz)** — inconsciente → problema → solução → produto → consciente. (L372)
- **20 pilares de uma boa LP**. (L373)
- **Maldição do conhecimento** — o que é óbvio pra você um dia não foi. (L373)
- **AI Blindness + mineração de contexto** — IA sem contexto é genérica. (L383)
- **Paradoxo de Jevons** — tecnologia que barateia uma habilidade expande o mercado dela. (L383)
- **Cliente oculto retroativo** — analisar conversas antigas do cliente pra apontar gargalo de atendimento. (L375)
- **3 ligações de onboarding** — briefing + análise interna + apresentação estratégica. (L333)

## Princípios de comunicação Sobral (estilo pra sugestões)

Quando estiver gerando sugestão de melhoria, manter o tom:
- **Direto**: número + ação. Sem floreio.
- **Bilateral**: "isso é responsabilidade do gestor / isso é do dono do negócio". (L346, L333)
- **Combo > Solo**: nunca recomendar uma única campanha rodando sozinha. (L361)
- **Frequência + tempo de tela = conversão**. (L382)
- **Pixel é não-negociável**. Sem pixel correto, automação morre. (L361)
- **O que permanece > o que muda**. Tráfego permanece, IA muda. (L383)
- **Confusão é o primeiro estágio do entendimento**. Não simplificar a ponto de perder a precisão.

## Atualização

Esta referência aponta pra notas que o Matheus alimenta com novas lives no Obsidian. **Sempre que rodar um diagnóstico que use Sobral, releia o índice** — pode ter live nova com framework novo.
