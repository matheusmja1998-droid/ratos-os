#!/bin/bash
# Provisiona um CLIENTE novo do Prospecta (SaaS replicado).
# Uso (na VPS): ./novo-cliente.sh <slug> <email> <senha> <chave_anthropic> ["Nome do Cliente"]
# Ex: ./novo-cliente.sh joao joao@empresa.com senha123 sk-ant-api03-xxx "João da Silva"
set -e

SLUG=$1; EMAIL=$2; SENHA=$3; AKEY=$4; NOME=${5:-$SLUG}; WHATS=${6:-1}
[ -z "$AKEY" ] && { echo "uso: $0 <slug> <email> <senha> <chave_anthropic> [nome]"; exit 1; }
[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "slug só letras minúsculas/números/hífen"; exit 1; }

BASE=/root/sdr-clientes/$SLUG
[ -d "$BASE" ] && { echo "cliente '$SLUG' já existe em $BASE"; exit 1; }

# proxima porta livre a partir de 8801
PORT=8801
while ss -tln | grep -q ":$PORT "; do PORT=$((PORT+1)); done

# credenciais do servidor uazapi compartilhado (mesmas do SDR interno)
UAZ_URL=$(grep '^UAZAPI_URL=' /root/facilita-sdr/.env | cut -d= -f2)
UAZ_ADMIN=$(grep '^UAZAPI_ADMIN_TOKEN=' /root/facilita-sdr/.env | cut -d= -f2)

DOMINIO="sdr-$SLUG.2-25-138-60.sslip.io"
PAINEL_TOKEN=$(openssl rand -hex 12)
WEBHOOK_SECRET=$(openssl rand -hex 16)

mkdir -p "$BASE/dados"
cat > "$BASE/.env" <<EOF
PORT=8795
APP_URL=https://$DOMINIO
PAINEL_SENHA=$PAINEL_TOKEN
PAINEL_EMAIL=$EMAIL
PAINEL_SENHA_LOGIN=$SENHA
WEBHOOK_SECRET=$WEBHOOK_SECRET
UAZAPI_URL=$UAZ_URL
UAZAPI_ADMIN_TOKEN=$UAZ_ADMIN
ANTHROPIC_API_KEY=$AKEY
SDR_IA_MODO=api
DELAY_MIN=26
DELAY_MAX=34
DADOS_DIR=/dados
CLIENTE_NOME=$NOME
SDR_MARCA=Prospecta
WHATSAPPS_LIMITE=$WHATS
EOF
chmod 600 "$BASE/.env"

docker run -d --name "sdr-$SLUG" --restart unless-stopped \
  -p 127.0.0.1:$PORT:8795 \
  --env-file "$BASE/.env" \
  -v "$BASE/dados":/dados \
  --memory=300m \
  facilita-sdr:latest >/dev/null

# subdominio no Caddy (idempotente)
if ! grep -q "$DOMINIO" /etc/caddy/Caddyfile; then
  printf '\n%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' "$DOMINIO" "$PORT" >> /etc/caddy/Caddyfile
  systemctl reload caddy
fi

sleep 6
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health" || echo "erro")

echo "=============================================="
echo "✅ Cliente '$NOME' provisionado (health: $STATUS)"
echo ""
echo "ENTREGAR PRO CLIENTE:"
echo "  Painel:  https://facilita-sdr.vercel.app"
echo "  API (campo 'avançado' no 1º login): https://$DOMINIO"
echo "  Email:   $EMAIL"
echo "  Senha:   $SENHA"
echo ""
echo "interno: container sdr-$SLUG · porta $PORT · dados em $BASE"
echo "=============================================="
