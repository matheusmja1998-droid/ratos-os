---
name: dossie-cliente
description: Cria ou completa o dossiê (CLAUDE.md) de um cliente da WinVision ou L.M Agência via entrevista guiada + pesquisa automática de site, Instagram e mercado. Use quando o Matheus disser "monta o dossiê do [cliente]", "completa a ficha do [cliente]", "preenche o CLAUDE.md do [cliente]", "criar dossiê", ou /dossie-cliente. Ideal pros clientes com ficha incompleta (EV Cosméticos, Liso Ideal) ou cliente novo que ainda não foi documentado.
---

# Skill: Dossiê de Cliente

Constrói ou completa o `CLAUDE.md` de um cliente da WinVision ou L.M Agência. Combina entrevista guiada com pesquisa automática (site, Instagram, Google) pra montar uma ficha completa que vira fonte de verdade pro Claude e pro Matheus.

## Quando usar

- Cliente novo entrou e precisa documentar
- Cliente antigo com `CLAUDE.md` incompleto (EV Cosméticos, Liso Ideal são casos clássicos)
- Matheus pede pra atualizar dossiê de cliente que mudou de fase/produto/estratégia

## Fluxo

### Passo 1 — Identificar e localizar

1. Perguntar qual cliente (se não foi dito)
2. Perguntar agência: WinVision ou L.M Agência?
3. Verificar se já existe pasta:
   - WinVision: `winvision/clientes/[slug-cliente]/`
   - L.M: `lm/clientes/[slug-cliente]/`
4. Se não existir, criar a pasta
5. Se já existir um `CLAUDE.md`, **ler antes** pra não duplicar perguntas e identificar o que falta

### Passo 2 — Entrevista guiada (15 perguntas)

Fazer **uma pergunta por vez**, esperando resposta. Não despejar 15 de uma vez. Adaptar perguntas ao que já sabe (não perguntar o que já tá no CLAUDE.md).

**Bloco 1 — Identidade (3 perguntas)**
1. Nome completo / razão social do cliente
2. Nicho / o que ele vende
3. Posicionamento em 1 frase (o que ele promete entregar)

**Bloco 2 — Produto (4 perguntas)**
4. Produto principal: nome, preço, formato (curso, mentoria, serviço, infoproduto)
5. Promessa central do produto
6. Outros produtos / escada de valor
7. Plataforma de venda (Hotmart, Bagy, site próprio, etc)

**Bloco 3 — Audiência e canais (3 perguntas)**
8. Avatar (ICP): quem compra, dor principal, desejo principal
9. Canais ativos com métricas (Instagram, YouTube, TikTok, lista email — pedir handle e seguidores)
10. Provas sociais relevantes (cases, depoimentos, números fortes)

**Bloco 4 — Operação e estratégia (3 perguntas)**
11. Estratégia atual de aquisição (lançamento, perpétuo, prospecção ativa, indicação)
12. Ferramentas que ele usa (CRM, plataforma de email, anúncios, automação)
13. Status atual de receita / faturamento (se confortável compartilhar)

**Bloco 5 — Restrições e particularidades (2 perguntas)**
14. Compliance / restrições legais? (Fernanda tem NZ, médico tem CRM, etc)
15. Particularidades importantes (ex: mora fora, sócio, sazonalidade, problema operacional conhecido)

### Passo 3 — Pesquisa automática

Pedir ao Matheus:
- Site oficial (URL)
- Instagram (handle)
- LinkedIn (se for B2B)

Com isso, usar `WebFetch` ou `WebSearch` pra:
- Confirmar dados do site (sobre, produtos, contato)
- Validar nº de seguidores Instagram (perfil público)
- Buscar reviews/menções no Google ("[nome do cliente] avaliações")
- Pesquisar mercado/concorrentes (1-2 buscas: "[nicho] mercado brasil 2026")

Se algum dado pesquisado contradisser ou enriquecer o que o Matheus disse, **mostrar antes de salvar** ("Achei isso no site, confirma?").

### Passo 4 — Gerar o CLAUDE.md

Usar essa estrutura padrão (espelhada no da Fernanda Serraglia, que é o template ouro):

```markdown
# [Nome do Cliente] — [Marca/Posicionamento curto]

## Quem é
[Bio em 2-3 frases. Nome, contexto, localização, background relevante]

**Nicho:** [nicho]
**Audiência combinada:** [se aplicável]
**Posicionamento:** [1 frase do que promete]

---

## Produto principal — [Nome]
- **Preço:** R$ X
- **Promessa:** [1 frase]
- **Conteúdo:** [aulas, módulos, formato]
- **Garantia:** [se houver]
- **Plataforma:** [Hotmart, Bagy, etc]

### Método / Pilares
1. [pilar 1]
2. [pilar 2]
3. [pilar 3]

### Outros produtos
- [produto 2 com preço]
- [produto 3 com preço]
- [escada de valor]

---

## Presença digital
| Canal | Métricas |
|---|---|
| Instagram (@handle) | X mil seguidores |
| YouTube | X inscritos |
| TikTok | X |
| Lista email | X contatos |

---

## Estratégia de aquisição
[Lançamento? Perpétuo? Prospecção? Como ele faz hoje]

**Gatilhos / abordagem:** [escassez, urgência, prova social, etc]

---

## Avatar (ICP)
[Quem compra. Dor. Desejo. Comportamento. Onde tá.]

**Dores:** [lista curta]
**Desejos:** [lista curta]

---

## Provas sociais
- [case 1 com número/resultado]
- [case 2]
- [case 3]

---

## Compliance / Restrições
[Se aplicável: regulação de área, restrições legais, palavras proibidas]

---

## Ferramentas e integrações
[CRM, email, ads, automação, plataforma de venda]

---

## Status atual
**Faturamento:** [se confortável]
**Fase do negócio:** [escala, validação, manutenção]
**Foco do mês/trimestre:** [o que ele quer agora]

---

## Particularidades
[Qualquer coisa importante que não cabe em outra seção: sazonalidade, sócio, mora fora, etc]

---

## Histórico de trabalho com a agência
[Quando começou, o que já entregamos, próximos passos]
```

**Regras de preenchimento:**
- Se uma seção não tiver info, escrever `[A definir]` em vez de deixar vazio (sinaliza que precisa completar depois)
- Não inventar nada — só usar o que veio da entrevista ou da pesquisa
- Compliance é OBRIGATÓRIO (se não souber, perguntar explicitamente "Tem alguma restrição legal/regulatória?")

### Passo 5 — Salvar e confirmar

1. Salvar em `[agencia]/clientes/[slug-cliente]/CLAUDE.md`
2. Mostrar ao Matheus o que foi salvo
3. Perguntar:
   - "Tá completo ou falta algo?"
   - "Quer que eu adicione esse cliente ao `_contexto/empresa.md`?" (se for cliente novo)
   - "Quer que eu rode `/checklist-cliente-novo` agora pra estruturar o resto da operação?" (se for cliente novo)

### Passo 6 — Atualizar memória

Se descobriu coisas importantes (cliente tem restrição legal, cliente novo entrou, mudança de produto), adicionar à memória persistente em `~/.claude/projects/-Users-matheusjardim-claude-Ratos-OS/memory/` no formato project memory.

## Regras importantes

1. **Uma pergunta por vez** — não despejar 15. Conversa fluida.
2. **Não duplicar perguntas** — sempre ler o `CLAUDE.md` existente primeiro.
3. **Pesquisa NÃO substitui entrevista** — pesquisa enriquece, mas o Matheus sabe coisas que a internet não tem.
4. **Compliance é obrigatório** — perguntar explicitamente, não assumir que "não tem".
5. **`[A definir]` é melhor que invenção** — se não souber, marcar pra completar depois.
6. **Tom da escrita do dossiê** — informal, direto, sem floreios. Estilo do Matheus.
7. **Confirmar antes de salvar** — mostrar o draft completo antes de gravar arquivo final.

## Caso de uso típico

**Matheus:** "monta o dossiê da EV Cosméticos"

**Claude:**
1. Lê `winvision/clientes/ev-cosmeticos/CLAUDE.md` existente
2. Identifica que tem só info de automação pós-venda; falta tudo o resto
3. "Beleza, vi que tem só a parte de automação documentada. Vou perguntar o que falta. Primeira: qual o nome completo/razão social da EV Cosméticos?"
4. Conduz entrevista
5. Pede site/Instagram pra pesquisar
6. Gera CLAUDE.md completo
7. Mostra pro Matheus aprovar
8. Salva
9. Pergunta se quer adicionar ao contexto geral
