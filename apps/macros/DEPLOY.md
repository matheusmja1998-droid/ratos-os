# Deploy

**No ar:** https://macros-nu.vercel.app

## Como está montado

- **Cliente web** (`publico/`) servido como estático pela CDN da Vercel
- **API** (`api/index.ts`) numa função serverless, região `gru1` (São Paulo)
- **Banco** Postgres no Supabase, projeto "App Macronutrientes"

O `vercel.json` manda só `/api/*` e `/docs` para a função; o resto sai da CDN.

## Publicar de novo

```bash
cd apps/macros
vercel deploy --prod
```

O `nest build` roda sozinho no deploy e a função importa de `dist/`.

## Variáveis de ambiente (já configuradas)

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres do Supabase (pooler, porta 6543) |
| `JWT_SECRET` | assina os tokens de login |
| `ANTHROPIC_API_KEY` | recursos de IA; sem ela o resto funciona igual |

Para ver ou trocar: `vercel env ls production`.

## Rodar local

Sem `DATABASE_URL` o app usa SQLite em arquivo e não depende de nada:

```bash
npm run start:dev     # http://localhost:3000
```

Para testar local contra o Postgres de produção:

```bash
DATABASE_URL="postgresql://..." npm start
```

## Armadilhas que já custaram tempo aqui

Registradas porque cada uma virou meia hora de depuração:

1. **`pg` precisa de import explícito.** O TypeORM carrega o driver por
   `require` dinâmico, que o bundler da Vercel não enxerga. Sem o `import 'pg'`
   no topo de `api/index.ts`, o boot morre com *"Postgres package has not been
   found installed"*.

2. **Nada de módulo nativo.** A Vercel não roda install scripts, então
   `node-gyp` não compila. O `bcrypt` virou `bcryptjs` (JS puro) e o
   `better-sqlite3` foi para `optionalDependencies` — ele só serve ao
   desenvolvimento local.

3. **`builds` no vercel.json desliga o npm install.** A chave legada `builds`
   faz a Vercel pular a instalação de dependências. Use `functions` +
   `rewrites`.

4. **Um script `vercel-build` vazio também pula a instalação.** Deixe o `build`
   normal (`nest build`).

5. **A função precisa ficar perto do banco.** Sem `"regions": ["gru1"]` ela
   subia em Washington e a conexão com o Supabase de São Paulo estourava o
   tempo no boot.

6. **Senha com caractere especial quebra a URL.** A senha do banco tem `#`, que
   precisa virar `%23` na connection string.

## Custo

Tier gratuito da Vercel e do Supabase cobrem uso pessoal com folga: a base de
alimentos ocupa poucos megabytes e o volume é de algumas refeições por dia.

## Acesso

A URL de produção é pública. Deploys de preview ficam atrás do login da Vercel.
Para fechar a produção também: Settings → Deployment Protection.
