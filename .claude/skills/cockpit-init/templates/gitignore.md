# Tokens e credenciais — NUNCA commitar
.env
.env.local
.env.*.local
*.key
*.pem

# Dados sensíveis de cliente
clientes/*/snapshots/raw/
clientes/*/dados-brutos/
*.csv.bruto
*-confidencial-*

# Sistema
.DS_Store
Thumbs.db
*.swp
*.swo

# Editor
.vscode/
.idea/
*.sublime-*

# Obsidian (opcional — comentar se quiser versionar)
.obsidian/workspace*
.obsidian/cache
.obsidian/plugins/*/data.json

# Logs
.cockpit/logs/
*.log

# Backups locais
*.backup
*.bak

# n8n local
.cockpit/n8n/data/

# node
node_modules/
npm-debug.log*
