# Skill: Pesquisa R1

Prepara o contexto de mercado solar para uma reunião de vendas (R1) da LM Agência.
Cria a pasta da reunião e um documento simples, direto e fácil de absorver — sem enrolação.
O objetivo é o Matheus entrar na reunião parecendo que conhece o mercado do cliente melhor do que ele mesmo.

## Como usar

```
/pesquisa-r1 empresa: Hypertech | cidade: Jaraguá do Sul | estado: SC | cnpj: 00.000.000/0001-00
```

CNPJ é opcional. Cidade e estado são obrigatórios.

---

## Passo a passo

### 1. Extrair dados do usuário

Ler: empresa, cidade, estado, cnpj.
Se faltar cidade ou estado, perguntar antes de continuar.

### 2. Criar pasta da reunião

```
lm/prospeccao/reuniao/[YYYY-MM-DD]-[nome-empresa-slug]/
```

### 3. Rodar o script de market share

```bash
python3 "lm/pesquisa-mercado/energia-solar/ferramentas/market_share_solar.py" \
  --estado [ESTADO] --cidade "[CIDADE]"
```

Além do output do script, calcular manualmente com pandas:
- Evolução de instalações por ano (usando `DthAtualizaCadastralEmpreend`)
- Potência média por instalação (`MdaPotenciaInstaladaKW` / total)
- % microgeração vs minigeração (`DscPorte`)
- Distribuidora principal da cidade (`NomAgente`)

### 4. Criar o documento `contexto-r1.md`

**Princípio do documento:** simples, escaneável, sem texto desnecessário.
Cada seção deve caber em menos de 10 segundos de leitura.
Usar linguagem direta — como se fosse um briefing de guerra.

Estrutura:

```markdown
# Contexto R1 — [Empresa] | [Cidade/UF] | [Data]

---

## O mercado em [Cidade]

| | |
|---|---|
| Instalações totais | X |
| Potência instalada | X MW |
| Potência média por sistema | X kW |
| Distribuidora local | [nome] |
| Participação no Brasil | X% |

**Microgeração:** X% | **Minigeração:** X%

---

## Quem tá instalando

| Classe | Qtd | % | Leitura |
|--------|----:|--:|---------|
| Residencial | X | X% | mercado maduro |
| Comercial | X | X% | [aquecido / espaço / virgem] |
| Industrial | X | X% | [aquecido / espaço / virgem] |
| Rural | X | X% | [aquecido / espaço / virgem] |

> **Oportunidade:** [1 frase direta sobre qual classe tem mais espaço e por quê]

---

## Crescimento ano a ano

| Ano | Instalações |
|-----|----------:|
| 2020 | X |
| 2021 | X |
| 2022 | X |
| 2023 | X |
| 2024 | X |
| 2025 | X |

> **Tendência:** [mercado crescendo / estagnado / caindo — e o que isso significa]

---

## Perguntas para fazer na R1

Baseadas no perfil da cidade e do prospecto. Usar para qualificar e abrir espaço para armazenamento:

- Falta energia aqui na cidade com frequência? Quando falta, quanto tempo fica?
- Vocês já têm alguma instalação solar ou tô chegando do zero?
- Se a energia cair, qual equipamento/processo não pode parar?
- Já calcularam quanto vocês perdem quando a energia vai embora?

> Essas perguntas só fazem sentido se o perfil da cidade indicar oscilação de energia ou cliente industrial/comercial com processo crítico. Adaptar conforme contexto.

---

## Como usar esse contexto na conversa

[3 a 5 bullets curtos com angulos que o Matheus pode usar na reunião.
Exemplos: citar o número de instalações da cidade de forma natural, mencionar que o mercado industrial ainda tem espaço, usar dado de potência média para calibrar expectativa de investimento, etc.]

---

## CNPJ / Empresa

**CNPJ:** [cnpj ou "não informado"]
**Distribuidora:** [quem homologa na região]

> Se tiver CNPJ, buscar no site da Receita Federal (receitaws.com.br/v0/00000000000000) e preencher: razão social, porte, data de abertura, CNAE principal.
```

### 5. Buscar dados do CNPJ (se informado)

Se o usuário passou CNPJ, fazer GET em:
```
https://receitaws.com.br/v0/[cnpj-somente-numeros]
```

Extrair e adicionar na seção CNPJ / Empresa:
- Razão social
- Porte (ME, EPP, Grande)
- Data de abertura
- CNAE principal (o que a empresa faz oficialmente)
- Situação cadastral

### 6. Confirmar ao usuário

Mostrar no chat um resumo de 5 linhas com os números principais.
Informar o caminho do arquivo criado.

---

## Observações

- O script de market share fica em `lm/pesquisa-mercado/energia-solar/ferramentas/market_share_solar.py`
- Cache do CSV da ANEEL dura 24h
- Se a cidade não for encontrada, avisar e sugerir variação do nome
- A seção "Como usar esse contexto" deve ser gerada com inteligência — não é template, é interpretação real dos dados
- O documento deve ter no máximo 1 página. Se passar disso, cortar o que não é essencial
