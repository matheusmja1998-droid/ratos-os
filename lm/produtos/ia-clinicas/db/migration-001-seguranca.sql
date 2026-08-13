-- Migration 001 — Seguranca e integridade (Postgres/Supabase)
-- Roda no SQL Editor do Supabase, ou via scripts/migrar-supabase.ts.
-- Nao destrutivo: so cria index e liga RLS. Nao apaga nada.

-- 1) Anti-overbooking: um profissional nao pode ter duas consultas
--    nao-canceladas no mesmo horario de inicio.
create unique index if not exists uniq_consulta_prof_inicio
  on consultas (profissional_id, inicio)
  where status <> 'cancelada';

-- 2) Row Level Security (defesa em profundidade).
--    O backend usa a service_role key, que BYPASSA RLS — entao o app
--    continua funcionando normalmente. Ligar RLS com default-deny garante
--    que, se a chave publishable/anon vazar ou for usada no browser, ninguem
--    le nada. Policies por clinica entram quando houver login por clinica.
alter table clinicas       enable row level security;
alter table instancias     enable row level security;
alter table profissionais  enable row level security;
alter table horarios       enable row level security;
alter table pacientes      enable row level security;
alter table consultas      enable row level security;
alter table mensagens      enable row level security;
alter table bloqueios      enable row level security;

-- (sem policies permissivas = default deny pra qualquer chave que nao seja service_role)
