---
name: prospeccao-apify
description: Extrai listas de leads via Apify (Google Maps Scraper) pra prospecção de agências de marketing/tráfego e gestores de tráfego com objetivo de convidar pro webinar do Cockpit (stack de IA pra gestor de tráfego). Também serve pra prospecção genérica B2B local. Salva CSV em `dados/prospeccao/`. Use quando o Matheus disser "prospectar agências em [cidade]", "lista pra webinar Cockpit", "extrai agências de marketing", "prospecção de gestores de tráfego", "/prospectar", ou pedir base pra abordar.
---

# Prospecção via Apify — Cockpit / L.M

Skill pra montar lista de prospecção pra **convidar pro webinar do Cockpit** (esteira de venda da L.M Agência: webinar gratuito → consultoria → Cockpit Kick/Install/Operation/Black).

O motor padrão é Google Maps Scraper porque captura bem agências e gestores de tráfego com Google Meu Negócio cadastrado.

## ICP (Cockpit)

O avatar é **"O Gestor Sufocado"** em 3 sub-perfis:

1. **Solo Sobrecarregado** — gestor freelancer com 4-8 clientes, R$8-25k/mês
2. **Agência Pequena Travada** — 1 dono + 2-4 pessoas, R$30-80k/mês
3. **Gestor In-house** — CLT/PJ que quer montar o próprio (não pega no Google Maps, esse vem por LinkedIn)

**Não filtrar por tamanho na extração**. Pega agência pequena, média e grande — o webinar é gratuito, quem não é ICP filtra sozinho não aparecendo.

## Termos de busca que funcionam (PT-BR, Google Maps reconhece)

Combinar todos numa run só, variando por cidade:

- `agência de marketing digital [cidade]`
- `agência de tráfego pago [cidade]` (termo de ouro — só usa quem é do nicho)
- `agência de publicidade [cidade]`
- `agência de marketing [cidade]`
- `marketing digital [cidade]`
- `social media [cidade]`
- `gestor de tráfego [cidade]` (pega solo com GMB)
- `consultoria de marketing [cidade]`

## Cidades-alvo (concentração do avatar)

Capitais e cidades médias com ecossistema de marketing forte:

**Tier 1 (volume):** São Paulo, Belo Horizonte, Rio de Janeiro, Curitiba, Porto Alegre, Brasília, Florianópolis
**Tier 2 (médias):** Campinas, Goiânia, Recife, Fortaleza, Salvador, Ribeirão Preto, Joinville, Londrina, Maringá, Uberlândia
**Tier 3 (regional do Matheus):** Varginha, Pouso Alegre, Poços de Caldas

## Fluxo

1. **Confirmar parâmetros** com o Matheus se faltar:
   - Cidades (ou tier)
   - Termos a usar (default: os 8 acima)
   - Volume (default: 80 por busca)

2. **Carregar token** do `.env` do Ratos OS:
   ```bash
   set -a && source "/Users/matheusjardim/claude/Ratos OS/.env" && set +a
   echo $APIFY_API_TOKEN
   ```

3. **Disparar Google Maps Scraper** (`compass/crawler-google-places`) síncrono:
   ```bash
   curl -s -X POST \
     "https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=$APIFY_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d @/tmp/apify_input.json > /tmp/apify_raw.json
   ```

   Input típico:
   ```json
   {
     "searchStringsArray": [
       "agência de marketing digital São Paulo",
       "agência de tráfego pago São Paulo",
       "agência de marketing digital Belo Horizonte",
       "agência de tráfego pago Belo Horizonte"
     ],
     "maxCrawledPlacesPerSearch": 80,
     "language": "pt-BR",
     "countryCode": "br",
     "scrapeContacts": true
   }
   ```

   **Não usar** `placeMinimumStars` nem filtros de tamanho. Pegar tudo.

4. **Tratar e salvar CSV** em `dados/prospeccao/[EXPORTACAO]-Matheus-[Cidade]-[YYYY-MM-DD].csv`:

   **Formato fiel à planilha modelo do Matheus** (template Araxá). Ordem e nomes exatos das colunas:

   | Coluna | Conteúdo | Mapping JSON |
   |---|---|---|
   | A | Maps | `.url` (link Google Maps) |
   | B | Lead Título | `.title` |
   | C | Nome da empresa | `.title` |
   | D | Nome | `.title` (cópia, pra preencher manualmente depois com nome do dono) |
   | E | Nota | `.totalScore` |
   | F | Numero de avaliações | `.reviewsCount` (formato `-XX` se quiser manter o padrão da planilha; senão número puro) |
   | G | telefone com DDD | `.phone` ou `.phoneUnformatted` |
   | H | site | `.website` |
   | I | Nicho | preencher fixo: `Agência de Marketing` (ou variação por busca) |

   **Importante:** primeira linha é o header igualzinho (`Maps`, `Lead Título`, `Nome da empresa`, `Nome`, `Nota`, `Numero de avaliações`, `telefone com DDD`, `site`, `Nicho`). Sem colunas extras — manter o formato exato.

   Salvar também um arquivo `_completo.csv` paralelo com email, instagram, endereço etc. pra não perder esses dados (o principal entregue ao Matheus é o do template).

5. **Filtrar antes de salvar** (Google Maps mistura lixo na busca):
   - **Categoria** deve conter substring de: `marketing`, `publicidade`, `agência de propaganda`, `comunicação`, `social media`, `tráfego`, `consultoria de marketing`, `design`, `advertising`, `website designer`. Se não bater, descartar.
   - **Localização** deve bater com a cidade/estado pedido. Validar por `state`/`city` no JSON OU pelo DDD do telefone (mapa DDD→estado: SP=11-19, RJ=21-22-24, MG=31-38, PR=41-46, RS=51-55, SC=47-49, BA=71-77, DF=61, etc).

6. **Deduplicar** por telefone (e por nome+endereço se sem telefone). Aplicar dedup **depois** do filtro.

6. **Reportar pro Matheus**:
   - Total bruto extraído
   - Total único após dedup
   - % com email, % com WhatsApp, % com site
   - Top 5 cidades em volume
   - Caminho do CSV
   - Sugerir próximo passo: rodar copy de abordagem com `/schwartz-copy` ou importar pro CRM/disparador

## Custos

Google Maps Scraper: ~$0,50 a $4 por 1.000 lugares (com `scrapeContacts: true` puxa pro lado caro). Free tier de $5/mês cobre ~1.500 leads tranquilo.

## Outros Actors disponíveis

- **Website Contact Scraper** (`vdrmota/contact-info-scraper`) — enriquecer URLs sem contato. ~$1/1k.
- **Instagram Scraper** (`apify/instagram-scraper`) — bio, business email, seguidores de concorrente. ~$2/1k.
- **LinkedIn Sales Navigator** — pra pegar **Gestor In-house** (sub-perfil 3) com filtro por cargo. ~$5-15/1k.
- **Google Search Scraper** — varrer SERP atrás de diretórios setoriais.

## Como funciona Apify (curto)

Marketplace de scrapers prontos (Actors). Você dispara via API com input JSON, ele roda na cloud deles, devolve dataset. Endpoint padrão: `POST /v2/acts/{actor}/run-sync-get-dataset-items?token=...`. Síncrono até 5min de execução.

## Notas de operação

- Sempre `run-sync-get-dataset-items` pra runs até ~500 leads. Acima disso, async + polling.
- Cada cidade grande precisa de 2-3 termos diferentes pra cobrir bem (Maps limita ~120 resultados por busca).
- Sempre `language: pt-BR` e `countryCode: br`.
- Após dedup, dá uma olhada nos top 20 manualmente antes de escalar pra disparo — confirma que o filtro tá pegando ICP certo.
- Salvar em `dados/prospeccao/` na raiz do Ratos OS, **não** em pasta de cliente (Cockpit é produto do Matheus, não cliente).
- Pra abordagem do webinar: usar o script em `obsidian/.../Cockpit/17 — Script Prospecção.md` como base.
