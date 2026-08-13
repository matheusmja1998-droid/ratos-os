---
name: cockpit-track
description: Configura tracking server-side via Cloudflare Workers. Manda eventos pra Meta CAPI e GA4 Measurement Protocol direto do servidor, contornando bloqueio do iOS 17+. Recupera 25-40% das conversões que pixel padrão perde. Use quando o usuário disser "/cockpit-track", "configurar tracking", "server-side", "CAPI", "Cloudflare track", "tracking iOS 17", ou "resolver tracking quebrado". Disponível a partir do Cockpit Install (R$997).
---

## 🚀 Setup conversacional (primeira vez)

> Quando rodar `/cockpit-track` pela primeira vez (sem `CLOUDFLARE_API_TOKEN` no `.env`) ou `/cockpit-track setup`.

### Passo 1 — Verificar pré-requisitos

> "Cockpit Track configura tracking server-side. Pra funcionar, vou precisar:
>
> 1. ✅ Conta Cloudflare (gratuita)
> 2. ✅ Domínio com nameservers apontando pro Cloudflare
> 3. ✅ Pixel Meta + token CAPI
> 4. ✅ GA4 Measurement ID + API Secret
>
> Tu tem domínio ativo no Cloudflare? (sim/não)"

Se não: guiar criação de conta e adicionar domínio:

> "Vou te guiar:
>
> 1. Cria conta gratuita: https://cloudflare.com
> 2. Clica em **Add a Site**
> 3. Coloca o domínio principal do cliente (ex: `agencia.com.br`)
> 4. Cloudflare gera 2 nameservers (tipo `xyz.ns.cloudflare.com`)
> 5. Vai no registrador (Registro.br, GoDaddy) e troca os nameservers
> 6. Volta no Cloudflare e clica **Verify**
>
> Pode levar 1-24h pra propagar. Me confirma quando tiver propagado."

### Passo 2 — Pegar credenciais Cloudflare

> "Show. Agora preciso de 3 valores do Cloudflare:
>
> 1. **API Token:**
>    - Vai em https://dash.cloudflare.com/profile/api-tokens
>    - Clica **Create Token**
>    - Template: **Edit Cloudflare Workers**
>    - Cria, copia o token
>
> 2. **Account ID:**
>    - Aparece no canto direito do dashboard quando tu seleciona o domínio
>
> 3. **Zone ID:**
>    - Mesma página, logo abaixo do Account ID
>
> Me passa os 3 valores."

Salvar:
```bash
cat >> ~/Cockpit/.env << EOF
CLOUDFLARE_API_TOKEN={{token}}
CLOUDFLARE_ACCOUNT_ID={{account_id}}
CLOUDFLARE_ZONE_ID={{zone_id}}
EOF
```

### Passo 3 — Pegar tokens GA4

> "Agora GA4:
>
> 1. Abre https://analytics.google.com
> 2. Vai em **Admin** (engrenagem no canto)
> 3. Em **Data Streams**, seleciona o stream do site
> 4. Procura por **Measurement Protocol API secrets**
> 5. Clica **Create**, dá nome 'Cockpit Track'
> 6. Copia a **API Secret** e o **Measurement ID** (G-XXXXXXXXXX)
>
> Me passa as 2."

Salvar:
```bash
cat >> ~/Cockpit/.env << EOF
GA4_MEASUREMENT_ID={{measurement_id}}
GA4_API_SECRET={{api_secret}}
EOF
```

### Passo 4 — Pegar token CAPI da Meta

> "Última credencial: token CAPI da Meta.
>
> 1. Abre https://business.facebook.com → Gerenciador de Eventos
> 2. Seleciona o pixel do cliente
> 3. Vai em **Configurações** → **API de conversões**
> 4. Clica **Gerar token de acesso**
> 5. Copia o token
> 6. Anota também o **ID do Pixel** (na mesma tela)
>
> Me passa os 2 valores."

Salvar:
```bash
cat >> ~/Cockpit/.env << EOF
META_CAPI_TOKEN={{capi_token}}
META_PIXEL_ID={{pixel_id}}
EOF
```

### Passo 5 — Subir Worker no Cloudflare

> "Agora vou subir o Worker que recebe os eventos e dispara pra Meta + GA4."

Rodar:
```bash
mkdir -p ~/Cockpit/.cockpit/cloudflare
cat > ~/Cockpit/.cockpit/cloudflare/worker.js << 'WORKER_EOF'
// Cockpit Track Worker
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method !== 'POST') {
    return new Response('Cockpit Track v1', { status: 200 });
  }

  const data = await request.json();
  const event = data.event || 'page_view';

  // Dispara pra Meta CAPI
  const metaPayload = {
    data: [{
      event_name: event,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: data.url || '',
      user_data: data.user_data || {},
      custom_data: data.custom_data || {}
    }]
  };

  const metaPromise = fetch(
    `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaPayload)
    }
  );

  // Dispara pra GA4
  const ga4Payload = {
    client_id: data.client_id || crypto.randomUUID(),
    events: [{
      name: event,
      params: data.custom_data || {}
    }]
  };

  const ga4Promise = fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ga4Payload)
    }
  );

  await Promise.all([metaPromise, ga4Promise]);

  return new Response('OK', {
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*' }
  });
}
WORKER_EOF
```

Subir via API:
```bash
source ~/Cockpit/.env

# Configura secrets do Worker
for var in META_PIXEL_ID META_CAPI_TOKEN GA4_MEASUREMENT_ID GA4_API_SECRET; do
  value=$(grep "^$var=" ~/Cockpit/.env | cut -d'=' -f2-)
  curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/cockpit-track/secrets" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$var\",\"text\":\"$value\",\"type\":\"secret_text\"}"
done

# Sobe o Worker
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/cockpit-track" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/javascript" \
  --data-binary @~/Cockpit/.cockpit/cloudflare/worker.js
```

### Passo 6 — Configurar rota

```bash
# Adiciona rota: track.[dominio]/* aponta pro Worker
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/workers/routes" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"pattern\":\"track.{{dominio}}/*\",\"script\":\"cockpit-track\"}"
```

### Passo 7 — Gerar snippet pro site

> "Pra usar, cliente precisa colar esse snippet no `<head>` do site dele:"

```html
<script>
  window.cockpitTrack = function(event, data) {
    fetch('https://track.{{dominio}}/event', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        event: event,
        url: window.location.href,
        client_id: localStorage.getItem('cockpit_cid') || (function(){
          const id = crypto.randomUUID();
          localStorage.setItem('cockpit_cid', id);
          return id;
        })(),
        custom_data: data || {}
      })
    });
  };

  // Auto-track de page view
  cockpitTrack('PageView');
</script>
```

> "Cola isso no `<head>` (via GTM, plugin de WordPress, ou direto no template).
>
> Pra disparar eventos custom:
> ```javascript
> cockpitTrack('Lead', { value: 100, currency: 'BRL' });
> cockpitTrack('Purchase', { value: 497, currency: 'BRL' });
> ```"

### Passo 8 — Teste ao vivo

```bash
# Dispara evento de teste
curl -X POST "https://track.{{dominio}}/event" \
  -H "Content-Type: application/json" \
  -d '{"event":"PageView","url":"https://test.com","client_id":"test-123"}'
```

> "Confere agora:
> 1. Meta Events Manager → deve aparecer evento com tag 'server-side'
> 2. GA4 Realtime → deve aparecer evento agora
>
> Apareceu nos dois?"

### Passo 9 — Confirmação + próximos passos

> "✅ **Cockpit Track rodando.**
>
> Tu agora captura conversão server-side, contornando bloqueio do iOS 17.
>
> **Próxima skill:**
>
> ```bash
> cd ~/Cockpit/.claude/skills && git clone https://github.com/matheusmja1998-droid/cockpit-google.git
> ```
>
> Roda `/cockpit-google` pra começar."

---

## Comandos de uso

```
/cockpit-track adicionar [dominio]   # Adiciona novo domínio à rota
/cockpit-track testar                 # Dispara evento de teste
/cockpit-track auditar                # Compara eventos pixel vs server-side
/cockpit-track listar                 # Lista todos domínios configurados
```

## Variáveis de ambiente

```bash
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_ZONE_ID
META_PIXEL_ID
META_CAPI_TOKEN
GA4_MEASUREMENT_ID
GA4_API_SECRET
```
