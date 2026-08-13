# IA Clinicas — SaaS de atendimento por IA no WhatsApp

Produto da L.M Agencia. A IA atende o paciente no WhatsApp, marca a consulta na agenda,
confirma um dia antes e depois da consulta pede avaliacao no Google. Multi-clinica.

## Rodar em 2 minutos (sem conta nenhuma)

```bash
npm install
npm run seed        # cria a clinica-demo (Comtato) com 2 medicos e agenda
export ANTHROPIC_API_KEY=sk-ant-...   # sua chave da Claude API
npm run chat        # conversa com a IA no terminal (agenda de verdade)
```

Ou sobe o painel:

```bash
npm run dev         # http://localhost:3100/painel
```

O app roda em **MODO DEMO** enquanto `UAZAPI_URL` nao estiver setado: os envios de
WhatsApp viram `console.log` em vez de sair de verdade. Assim da pra testar tudo
sem conta da uazapi.

## O que tem aqui

```
lib/
  db.ts        camada de dados (SQLite hoje; troca aqui pra migrar pro Supabase)
  uazapi.ts    conector WhatsApp (envio + parse de webhook + QR code)
  agenda.ts    motor de agenda: disponibilidade, agendar, remarcar, cancelar
  ia.ts        cerebro: Claude + tools (ver_horarios, agendar, passar_pra_humano)
  reguas.ts    confirmacao D-1 + pos-consulta (review Google)
app/
  painel/      painel web (lista de clinicas, agenda, cadastro)
  api/
    webhook/   recebe mensagem da uazapi, roteia pra clinica, responde
    clinicas/  CRUD de clinica + profissionais + instancias
    consultas/ agenda da clinica, remarcar, cancelar
    instancias/ cria instancia uazapi + QR code
    cron/      dispara as reguas (protegido por CRON_SECRET)
scripts/
  seed.ts             clinica-demo
  simular-conversa.ts  chat no terminal (npm run chat)
  cron-reguas.ts       roda as reguas na mao (npm run cron)
```

## Colocar em producao

1. **Conta uazapi** → setar `UAZAPI_URL` e `UAZAPI_ADMIN_TOKEN` no `.env`
2. **Deploy** na Vercel ou Railway (Next.js). O `vercel.json` ja tem os 2 crons das reguas (12h e 21h) — trocar `SEU_CRON_SECRET` pelo valor real
3. **Webhook**: na uazapi, apontar o webhook de cada instancia pra `https://SEU_HOST/api/webhook`
4. **Banco**: SQLite serve pro MVP e pro piloto. Pra escalar, migrar pra Supabase/Postgres trocando so o `lib/db.ts` (o schema em `db/schema.sql` ja e compativel)

## Fluxo por clinica (onboarding)

1. Cadastra a clinica no painel (dados, convenios, precos, FAQ, tom de voz, link do Google Reviews)
2. Cadastra os profissionais e a grade de horarios
3. Conecta o WhatsApp: cria instancia (`POST /api/instancias`) e escaneia o QR code
4. Pronto — a IA ja atende, marca, confirma D-1 e pede review

## O que ainda falta pro estado 100% final

- Sync com Google Calendar do medico (agenda hoje e so no banco)
- Painel: tela de conectar WhatsApp com o QR code embutido (a API `/api/instancias` ja devolve o QR)
- Handler de resposta de confirmacao ("SIM" do paciente atualiza status pra confirmada)
- LGPD: politica de retencao + criptografia de dados sensiveis antes de escalar
- Migracao SQLite → Supabase quando passar de umas 5-10 clinicas

Detalhes de escopo, arquitetura e plano de venda: `../projeto.md`
