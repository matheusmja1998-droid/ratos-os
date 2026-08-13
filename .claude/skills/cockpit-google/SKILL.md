---
name: cockpit-google
description: Gerencia campanhas Google Ads via API oficial. Lê campanhas, ad groups, anúncios, palavras-chave, públicos. Cria, edita, pausa, duplica e deleta. Edita lances e orçamentos por linguagem natural. Use quando o usuário disser "/cockpit-google", "google ads", "campanha google", "search ads", "performance max", "pausar google", "criar campanha google". Disponível a partir do Cockpit Install (R$997).
---

## 🚀 Setup conversacional (primeira vez)

> Quando rodar `/cockpit-google` pela primeira vez ou `/cockpit-google setup`.

### Passo 1 — Verificar pré-requisitos

> "Cockpit Google gerencia Google Ads por linguagem natural. Pra configurar preciso:
>
> 1. ✅ Conta Google Ads ativa
> 2. ✅ MCC (Manager Account) — vou te ajudar a criar se não tem
> 3. ✅ Acesso ao Google Cloud Console
> 4. ✅ Developer Token aprovado (pode levar 24-48h)
>
> Tu tem MCC? (sim/não)"

Se não:
> "Vou te guiar pra criar:
>
> 1. Abre https://ads.google.com/home/tools/manager-accounts
> 2. Clica **Create a manager account**
> 3. Preenche dados da agência
> 4. Confirma
>
> Me confirma quando criar."

### Passo 2 — Pegar Customer ID

> "Show. Agora pega o **Customer ID** da conta principal:
>
> 1. Abre https://ads.google.com
> 2. Customer ID aparece no canto superior direito (formato: XXX-XXX-XXXX)
>
> Me passa."

Salvar:
```bash
echo "GOOGLE_ADS_CUSTOMER_ID={{customer_id}}" >> ~/Cockpit/.env
```

### Passo 3 — Solicitar Developer Token

> "Agora o Developer Token. Esse pode demorar 24-48h pra aprovar.
>
> 1. Abre https://ads.google.com/aw/apicenter (precisa estar logado no MCC)
> 2. Clica em **Apply for Basic Access**
> 3. Preenche o form:
>    - Empresa: nome da agência
>    - Caso de uso: 'Internal tool to manage clients accounts'
>    - Volume: '< 10.000 operações/mês'
> 4. Submete
>
> Vai aparecer um **Test Token** que tu pode usar AGORA. Quando aprovarem, tu recebe o Production Token.
>
> Me passa o Test Token (começa com algo tipo `xxx-yyy-zzz...`)."

Salvar:
```bash
echo "GOOGLE_ADS_DEVELOPER_TOKEN={{token}}" >> ~/Cockpit/.env
```

### Passo 4 — Criar OAuth Client

> "Agora as credenciais OAuth. Vai no Google Cloud Console:
>
> 1. https://console.cloud.google.com/
> 2. Cria um projeto novo (ou usa um existente). Nome: 'Cockpit Google Ads'
> 3. Vai em **APIs & Services** → **Library**
> 4. Procura por 'Google Ads API' e clica **Enable**
> 5. Vai em **APIs & Services** → **Credentials**
> 6. Clica **+ Create Credentials** → **OAuth client ID**
> 7. Application type: **Desktop app**
> 8. Nome: 'Cockpit'
> 9. Cria
> 10. Copia **Client ID** e **Client Secret**
>
> Me passa os 2."

Salvar:
```bash
cat >> ~/Cockpit/.env << EOF
GOOGLE_OAUTH_CLIENT_ID={{client_id}}
GOOGLE_OAUTH_CLIENT_SECRET={{client_secret}}
EOF
```

### Passo 5 — Gerar Refresh Token

> "Última credencial: o refresh token (que renova acesso automaticamente)."

Rodar script:
```bash
cd ~/Cockpit
source .env

# Gera URL de autorização
AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth?client_id=$GOOGLE_OAUTH_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/adwords&access_type=offline&prompt=consent"

echo ""
echo "============================================"
echo "Abre essa URL no navegador:"
echo "$AUTH_URL"
echo ""
echo "Faz login com a conta admin do MCC."
echo "Aceita as permissões."
echo "Copia o código que aparece (xxxxxxxxxxxx)."
echo "============================================"
echo ""
read -p "Cola o código aqui: " AUTH_CODE

# Troca código por refresh_token
curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "code=$AUTH_CODE" \
  -d "client_id=$GOOGLE_OAUTH_CLIENT_ID" \
  -d "client_secret=$GOOGLE_OAUTH_CLIENT_SECRET" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
  -d "grant_type=authorization_code" | python3 -m json.tool
```

Pegar `refresh_token` retornado e salvar:
```bash
echo "GOOGLE_ADS_REFRESH_TOKEN={{refresh_token}}" >> ~/Cockpit/.env
```

### Passo 6 — Validar conexão

```bash
# Lista campanhas pra validar
python3 << 'PY_EOF'
import os, requests
from urllib.parse import urlencode

# Renova access token
r = requests.post('https://oauth2.googleapis.com/token', data={
    'client_id': os.environ['GOOGLE_OAUTH_CLIENT_ID'],
    'client_secret': os.environ['GOOGLE_OAUTH_CLIENT_SECRET'],
    'refresh_token': os.environ['GOOGLE_ADS_REFRESH_TOKEN'],
    'grant_type': 'refresh_token'
})
access_token = r.json()['access_token']
print(f"✅ Access token gerado: {access_token[:20]}...")
PY_EOF
```

### Passo 7 — Mapear contas

```bash
# Lista contas que o token tem acesso
# (gera arquivo ~/Cockpit/_contexto/contas-google.md)
```

### Passo 8 — Teste ao vivo

> "Vou listar as campanhas ativas pra validar."

Rodar comando-teste, mostrar resultado.

### Passo 9 — Confirmação + próximos passos

> "✅ **Cockpit Google configurado.**
>
> Comandos:
>
> - `/cockpit-google listar campanhas`
> - `/cockpit-google pausa palavras com CPA acima de R$50`
> - `/cockpit-google duplica campanha X com público Y`
> - `/cockpit-google insights últimos 30 dias`
>
> **Stack completa.** Toda a infra do Cockpit tá rodando agora.
>
> Próximo passo é começar a usar no dia a dia. Suporte WhatsApp ativo pelos próximos {{14|30|60|90}} dias.
>
> Boas pilotagens. 🚀"

---

## Comandos de uso

```
/cockpit-google listar campanhas [filtros]
/cockpit-google pausar [critério]
/cockpit-google ativar [campanha]
/cockpit-google duplicar [campanha]
/cockpit-google editar orçamento [campanha] [valor]
/cockpit-google adicionar negativa [campanha] [palavra]
/cockpit-google insights [campanha] [periodo]
```

## Variáveis de ambiente

```bash
GOOGLE_ADS_CUSTOMER_ID
GOOGLE_ADS_DEVELOPER_TOKEN
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_ADS_REFRESH_TOKEN
```
