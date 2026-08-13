# Aprendizados — Meta Ads Ratos

Regras aprendidas durante o uso. O Claude DEVE ler este arquivo antes de criar qualquer objeto.

---

### 2026-04-03 — Sempre incluir CTA no criativo
**Regra:** Ao criar criativos (create.py creative), SEMPRE incluir call_to_action_type. Padrão: LEARN_MORE pra tráfego, SIGN_UP pra leads, SHOP_NOW pra vendas. Nunca criar criativo sem CTA.
**Contexto:** Criou carrossel sem botão de CTA. Usuário teve que corrigir manualmente.

### 2026-04-03 — Carrossel Instagram: multi_share_end_card=false
**Regra:** Em campanhas de visita ao perfil Instagram, SEMPRE usar multi_share_end_card=false e multi_share_optimized=false no criativo.
**Contexto:** Cartão "Ver mais" sem URL quebrou o anúncio em 10 posicionamentos. O end_card exige uma URL de destino que não existe em campanhas de perfil.

### 2026-04-03 — Sempre passar instagram_user_id no criativo
**Regra:** Ao criar criativos pra Instagram, SEMPRE usar --instagram-user-id com o ID da conta Instagram do cliente (do contas.yaml).
**Contexto:** Sem instagram_user_id, o ad não publica no Instagram. Erro: "Seu anúncio deve ser associado a uma conta do Instagram."

### 2026-04-03 — Desligar format options em carrosséis
**Regra:** Ao criar ads de carrossel, SEMPRE passar --degrees-of-freedom-spec com OPT_OUT pra carousel_to_video, image_touchups e standard_enhancements.
**Contexto:** "Blocos de coleção" e "mídia única" distorcem o carrossel sequencial. Desligar pra manter ordem dos slides.

### 2026-04-28 — Arquitetura: app na BM (não no perfil), System User Token
**Regra:** Pra qualquer setup de Meta Ads novo, SEMPRE: (1) app criado em BM com 3+ admins humanos — nunca BM de cliente; (2) System User Token (validade Nunca), nunca User Token 60d como permanente; (3) acesso a contas de cliente via parceria entre BMs + atribuição explícita ao System User.
**Contexto:** Setup antigo (perfil-dono + User Token 60d) caiu junto com o perfil pessoal de FB e exigiu refazer tudo. A arquitetura correta sobrevive a queda de perfil porque o token pertence à BM e há outros admins pra acessar.

### 2026-04-28 — ForceRunStatus #1487083 (erro UI da Meta)
**Regra:** Erro `Invalid usage of ForceRunStatus (#1487083)` é bug da interface da Meta, não da API. Causas comuns: ad set/ad com status travado (arquivado tentando reativar, otimização incompatível com destino, revisão pendente). Workaround: duplicar o objeto e configurar do zero — o duplicado limpa o estado bugado.
**Contexto:** Apareceu ao editar ad da Fernanda (AGV_MAI_26) pela UI. Não bloqueava criação via API.

### 2026-04-28 — Compartilhar contas: parceria genérica NÃO compartilha contas de ads
**Regra:** Ao adicionar uma BM como parceira de outra, marcar "atua como agência" / "veicula anúncios" NÃO compartilha automaticamente as contas de ads. Tem que ir em "Atribuir ativos" especificamente e marcar cada conta de anúncios. Instagram costuma vir junto da parceria genérica, mas conta de ads não.
**Contexto:** No setup do Caio, parceria foi criada mas só o Instagram apareceu na BM02. Contas de ads precisaram de aprovação separada de admin pra serem compartilhadas como ativo.
