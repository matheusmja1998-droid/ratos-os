# Aprendizados — Google Ads Ratos

Regras aprendidas durante o uso. O Claude DEVE ler este arquivo antes de criar qualquer objeto.

---

## Editar anúncio > excluir e recriar (regra do Matheus, 14/07/2026)

- Quando precisar mudar copy/conteúdo de um anúncio existente, SEMPRE tentar editar via `AdService.mutate_ads` (update) antes de remover e recriar. Só remover+recriar se a API não permitir a edição daquele campo. Vale principalmente pra anúncio que já tem histórico de veiculação.

## Demand Gen (API v24) — targeting é no AD GROUP, não na campanha

- Campanha Demand Gen nova nasce com `upgraded_targeting=True`: geo (location) e idioma (language) entram como `ad_group_criterion`, NÃO como campaign criterion (dá erro OWNED_AND_OPERATED).
- Públicos (user lists, idade, gênero) NÃO entram como criteria soltos ("audience grouped is set to true") — precisa criar um recurso `Audience` (AudienceService) com dimensions (segments + age + gender) e exclusion_dimension, e anexar via `ad_group_criterion.audience.audience`.
- Anúncio de vídeo: `demand_gen_video_responsive_ad` com headlines (≤40), long_headlines (≤90), descriptions (≤90), videos (asset YOUTUBE_VIDEO), logo_images, business_name e call_to_actions (asset CALL_TO_ACTION).
- Sitelinks funcionam em Demand Gen (CampaignAsset field_type SITELINK, igual Search).
- Sitelink: URL de cada um não pode repetir — usar query param diferente na mesma LP (?src, ?utm_camp, ?utm_content, ?utm_term).

## API v23 (SDK 30.0.0) — campos obrigatórios para criar campanha

- `contains_eu_political_advertising` é **enum** (não boolean). Usar valor `3` (DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING)
- `maximize_clicks` não funciona como atributo direto. Usar `manual_cpc.enhanced_cpc_enabled = False` como fallback
- Budget name deve ser único. Script agora usa timestamp no nome pra evitar colisão com budgets órfãos
- Descriptions do RSA: máximo 90 caracteres. Headlines: máximo 30 caracteres

---

## Customer Match: upload via API BLOQUEADO pro nosso developer token

- Dá pra CRIAR a user list CRM_BASED via API (UserListService funciona), mas o UPLOAD de membros via `OfflineUserDataJobService` retorna `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE` / "Customer Match uploads aren't supported in the Google Ads API for the developer token". O Google migrou Customer Match pra **Data Manager API** e o nosso token não tem allowlist.
- **Solução prática:** criar a lista vazia via API (ou pela UI) e subir os contatos **manualmente pela interface** do Google Ads (Ferramentas > Público > Seus dados > Segmentos > Lista de clientes > importar CSV). O CSV tem que ter headers em inglês: `Email,Phone Number,First Name,Last Name,Country,Zip`.
- Normalização que a UI espera é a mesma da API: email lowercase (gmail sem pontos), telefone em E.164 (+55...). Se subir CSV cru a UI hasheia sozinha.
- Script de referência (cria lista + tenta upload + gera CSV): scratchpad `upload_customer_match.py` da sessão 2026-07-14 (Escola Avicultores).
