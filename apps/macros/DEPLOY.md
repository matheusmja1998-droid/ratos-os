# Deploy na Vercel

O projeto já está linkado (`macros` em `matheusmja1998-droids-projects`) e o
deploy funciona. Falta só o banco.

## Por que precisa de Postgres

Local, o app usa SQLite num arquivo e não exige nada. Na Vercel isso não
funciona: cada requisição roda numa instância nova, com disco somente-leitura
que some depois. Toda refeição registrada se perderia.

Por isso o código aceita os dois:

- `DATABASE_URL` (ou `POSTGRES_URL`) definida → Postgres
- nenhuma delas → SQLite em arquivo, para rodar no seu computador

## Passo a passo (2 minutos)

1. Abra `vercel.com/dashboard` → projeto **macros** → aba **Storage**
2. **Create Database** → **Postgres** (Neon) → região `gru1` (São Paulo, mais
   perto) → Create
3. A Vercel injeta `POSTGRES_URL` sozinha no projeto. Nada mais a fazer ali.
4. Publique:

```bash
cd apps/macros
vercel deploy --prod
```

Na primeira requisição o TypeORM cria as tabelas e a base de alimentos entra
sozinha (as 649 entradas da TACO).

## Se preferir usar um Postgres próprio

Qualquer Postgres serve (Supabase, Neon, Railway). Basta:

```bash
vercel env add DATABASE_URL production
# cole a connection string quando pedir
vercel deploy --prod
```

## Verificar se subiu

```bash
curl -s -X POST https://macros-nu.vercel.app/api/calculo \
  -H 'Content-Type: application/json' \
  -d '{"sexo":"masculino","idadeAnos":33,"pesoKg":95,"alturaCm":178,"nivelAtividade":"moderado"}'
```

Deve devolver as metas com os sete passos da conta. Se vier erro citando
`DATABASE_URL`, o banco ainda não foi criado.

## Custo

O tier gratuito do Postgres na Vercel cobre um app de uso pessoal com folga —
a base de alimentos ocupa poucos megabytes e o volume de escrita é de algumas
refeições por dia.

## Sobre a proteção de acesso

Deploys de preview ficam atrás do login da Vercel (redirect 302 para
`vercel.com/sso-api`). A URL de produção, `macros-nu.vercel.app`, é pública.
Se quiser fechar também a produção: Settings → Deployment Protection.
