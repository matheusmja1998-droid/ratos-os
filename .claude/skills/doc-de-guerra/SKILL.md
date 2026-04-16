---
name: doc-de-guerra
description: >
  Processa transcrição de R1 da LM Agência: extrai dados do lead, salva transcrição
  no Obsidian e na pasta LM, e gera o Doc de Guerra preenchido pronto pra enviar.
  Use quando o usuário disser "fiz uma R1", "tenho transcrição de reunião",
  "cola transcrição", "gera doc de guerra" ou chamar /doc-de-guerra.
---

# /doc-de-guerra — Processo Pós-R1 da LM

## Dependências
- Template: `lm/comercial/ofertas/scripts/doc-de-guerra-template.md`
- Estratégia: `lm/comercial/funil-comercial-estrategia.md`
- Ofertas: `lm/comercial/ofertas/CLAUDE.md`

---

## Workflow

### Passo 1 — Receber a transcrição

Se o usuário ainda não colou a transcrição, perguntar:
> "Cola a transcrição da R1 aqui. Se quiser, pode ser um áudio transcrito, anotações ou texto livre — pego o que tiver."

Se já colou, seguir direto.

---

### Passo 2 — Extrair os dados da R1

Ler a transcrição e extrair:

| Campo | O que buscar |
|---|---|
| **Empresa** | Nome da integradora / empresa do lead |
| **Decisor** | Nome de quem participou da reunião |
| **Data** | Data da R1 (se não informada, usar data atual) |
| **Time comercial** | Quantos vendedores, como está estruturado |
| **Faturamento** | Faixa mensal aproximada |
| **Ticket médio** | Faixa dos projetos (residencial/comercial/industrial) |
| **Problema central** | O que ele descreveu como problema — usar as palavras dele |
| **Tempo do problema** | Há quanto tempo está assim |
| **Tentativas anteriores** | O que já tentou, o que funcionou, o que não foi |
| **Decisão** | Decide sozinho ou tem sócio |
| **Urgência** | Tem janela de tempo ou ainda avaliando |
| **Frases marcantes** | Citações diretas dele que revelam dor ou desejo |
| **Custo estimado** | Calcular: projetos perdidos × ticket médio = R$/mês |

---

### Passo 3 — Nomear os arquivos

Padrão de nome: `[empresa]-[data]`
- Transcrição: `r1-[empresa]-[data].md` (ex: `r1-hypertech-2026-04-20.md`)
- Doc de Guerra: `doc-guerra-[empresa]-[data].md` (ex: `doc-guerra-hypertech-2026-04-20.md`)

Usar nome da empresa em minúsculo, sem espaços, sem acento.

---

### Passo 4 — Salvar transcrição na LM

Criar arquivo em `lm/comercial/r1s/r1-[empresa]-[data].md` com o seguinte formato:

```
---
empresa: [nome]
decisor: [nome]
data: [data]
etapa: r1-realizada
próximo-passo: doc-de-guerra → r2
---

# R1 — [Empresa] — [Data]

## Dados extraídos
[tabela com todos os campos do Passo 2]

## Transcrição / Anotações
[conteúdo original que o usuário colou]
```

---

### Passo 5 — Salvar transcrição no Obsidian

Salvar em `Matheus/Trabalho/LM/Comercial/Reuniões de Vendas/r1-[empresa]-[data].md`

Mesmo conteúdo do Passo 4. Usar `obsidian create` com `silent`.

---

### Passo 6 — Gerar o Doc de Guerra preenchido

Usar o template em `lm/comercial/ofertas/scripts/doc-de-guerra-template.md` e preencher com os dados reais extraídos.

**Regras de preenchimento:**
- Parte 2 (O Problema): usar as palavras dele, não interpretar. Se ele disse "a gente perde venda por R$500 de diferença" — entra exatamente assim
- Parte 3 (O Custo): calcular com os números da reunião. Se não tiver números exatos, usar faixas plausíveis com base no ticket médio e projetos perdidos
- Parte 4 (O que acontece se continuar): conectar com o que ele disse que mais teme ou mais quer evitar
- Parte 5 (O que vou mostrar na R2): criar curiosidade — não entregar o plano, só prometer que existe um

---

### Passo 7 — Salvar Doc de Guerra

**Na LM:**
Criar `lm/comercial/docs-de-guerra/doc-guerra-[empresa]-[data].md`

**No Obsidian:**
Salvar em `Matheus/Trabalho/LM/Comercial/Docs de Guerra/doc-guerra-[empresa]-[data].md`

---

### Passo 8 — Retornar ao usuário

Mostrar o Doc de Guerra preenchido completo.

Em seguida, perguntar:
> "Revisou? Se quiser ajustar algum trecho — especialmente o que está nas palavras dele — me fala. Quando estiver ok, é só copiar e mandar no WhatsApp pra [nome do decisor]."

Lembrar:
> "Lembra de ligar 1h depois que enviar pra confirmar que ele recebeu."

---

## Roteamento pós-doc

Após gerar o doc, verificar o roteamento com base nos dados extraídos:

**Segue pra R2 normalmente:**
- 2+ vendedores, faturamento compatível, urgência real, decide sozinho ou sócio confirmado

**Atenção na R2:**
- Sócio ausente na R1 → garantir presença na R2 antes de agendar
- Urgência baixa → na R2 abrir com o custo do problema antes de apresentar solução

**Redirect pra Ignição Solo:**
- Solo / 1 vendedor / faturamento abaixo de R$20k/mês
- Sinalizar pro usuário antes da R2

---

## Observação sobre o Obsidian

Se o Obsidian não estiver aberto ou der erro no `obsidian create`, salvar normalmente nas pastas da LM e avisar:
> "Obsidian não estava acessível. Salvei nas pastas da LM normalmente. Quando abrir o Obsidian, posso salvar lá também."
