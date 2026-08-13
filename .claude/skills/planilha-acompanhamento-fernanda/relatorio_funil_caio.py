#!/usr/bin/env python3
"""
Relatorio diario do FUNIL de captacao do Caio (lancamento IE30), enviado no
Telegram (@rota_caio_bot) todo dia 9h JUNTO com a msg da planilha (run.sh roda
os dois em sequencia: preencher.py -> relatorio_funil_caio.py).

Reporta SEMPRE de ONTEM (dia fechado -> grupo/pesquisa ja sincronizados).
Metricas (formato fixo definido pelo Matheus 23/06):
  - Leads captados        = Leads_TRF + Leads_ORG na data (email valido)
  - Custo por lead (TRF)  = invest Meta do dia / leads de TRAFEGO (so trafego, ORG e' free)
  - Pessoas no grupo      = Grupo_Wpp event members.added (TODOS os grupos) na data
  - Taxa de entrada       = grupo / leads
  - Respostas de pesquisa = Pesquisa_1+_2 (dedupe email) na data
  - Taxa de resposta      = pesquisa / leads
  - Lead score medio      = media de "Pontuacao Total" das pesquisas da data

Fontes: planilha mae 1V-mvtJwAt... (SA do /root/agente/sa_caio_spend.json),
Meta token META_TOKEN_CAIO, Telegram BOT_ROTA_CAIO. DRY_RUN=1 so imprime.
"""
import os
import sys
import json
import datetime as dt
from pathlib import Path

import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build

ENV_PATH = Path(os.environ.get("AGENTE_ENV", "/root/agente/.env"))
SA_PATH = os.environ.get("SA_JSON", "/root/agente/sa_caio_spend.json")
DRY_RUN = os.environ.get("DRY_RUN") == "1"

# planilha mae (leads/grupo/pesquisa)
MAE_ID = "1V-mvtJwAtRtkagoogyPqF2fthNNLkFk4ZAjhLLCubaE"
META_API = "https://graph.facebook.com/v21.0"
AD_ACCOUNT = "act_191737889662177"
TAG_CAMP = "[IE30]"          # campanhas de captacao no Gerenciador
CAP_INICIO = dt.date(2026, 6, 16)
CAP_FIM = dt.date(2026, 7, 8)
META_LEADS = 12500


def load_env(path):
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("META_TOKEN_CAIO", "TELEGRAM_BOT_TOKEN_ROTA_CAIO", "TELEGRAM_CHAT_ID_MATHEUS"):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


ENV = load_env(ENV_PATH)
META_TOKEN = ENV.get("META_TOKEN_CAIO")
TG_TOKEN = ENV.get("TELEGRAM_BOT_TOKEN_ROTA_CAIO")
TG_CHAT = ENV.get("TELEGRAM_CHAT_ID_MATHEUS")


def sheets():
    creds = service_account.Credentials.from_service_account_file(
        SA_PATH, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def get_vals(svc, rng):
    return (
        svc.spreadsheets().values()
        .get(spreadsheetId=MAE_ID, range=rng,
             valueRenderOption="UNFORMATTED_VALUE",
             dateTimeRenderOption="FORMATTED_STRING")
        .execute().get("values", [])
    )


def norm_iso(s):
    s = str(s or "").strip()
    if not s:
        return None
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    if len(s) >= 10 and s[2] == "/" and s[5] == "/":
        return f"{s[6:10]}-{s[3:5]}-{s[0:2]}"
    return None


def cell(row, i):
    return str(row[i]) if len(row) > i and row[i] is not None else ""


# ---- leads -----------------------------------------------------------------
def leads_por_dia(svc, tab):
    out = {}
    for r in get_vals(svc, f"{tab}!A2:C200000"):
        if "@" not in cell(r, 0):
            continue
        iso = norm_iso(cell(r, 2))
        if iso:
            out[iso] = out.get(iso, 0) + 1
    return out


# ---- grupo (todos os grupos) -----------------------------------------------
def grupo_por_dia(svc):
    out = {}
    for r in get_vals(svc, "Grupo_Wpp!A2:K200000"):
        if cell(r, 1) != "group.updated.members.added":
            continue
        ts = cell(r, 9) or cell(r, 8)
        if len(ts) >= 10:
            out[ts[:10]] = out.get(ts[:10], 0) + 1
    return out


# ---- pesquisa + score ------------------------------------------------------
def pesquisa_por_dia(svc):
    seen = set()
    cnt, sc = {}, {}
    for tab in ("Pesquisa_1", "Pesquisa_2"):
        for r in get_vals(svc, f"{tab}!A2:I200000"):
            email = (cell(r, 1) or cell(r, 8)).strip().lower()
            if "@" not in email or email in seen:
                continue
            seen.add(email)
            iso = norm_iso(cell(r, 0))
            if not iso:
                continue
            cnt[iso] = cnt.get(iso, 0) + 1
            try:
                pts = float(cell(r, 7)) if cell(r, 7) != "" else None
            except ValueError:
                pts = None
            if pts is not None:
                sc.setdefault(iso, []).append(pts)
    return cnt, sc


# ---- meta invest -----------------------------------------------------------
def invest_dia(iso):
    """Soma spend das campanhas de captacao [IE30] no dia."""
    camps = requests.get(
        f"{META_API}/{AD_ACCOUNT}/campaigns",
        params={"fields": "id,name", "limit": 300, "access_token": META_TOKEN,
                "filtering": json.dumps([{"field": "name", "operator": "CONTAIN", "value": TAG_CAMP}])},
        timeout=60).json().get("data", [])
    total = 0.0
    for c in camps:
        nu = c["name"].upper()
        if "PRESENCIAL" in nu or "CHECKLIST" in nu:
            continue
        ins = requests.get(
            f"{META_API}/{c['id']}/insights",
            params={"time_range": json.dumps({"since": iso, "until": iso}),
                    "fields": "spend", "level": "campaign", "access_token": META_TOKEN},
            timeout=60).json().get("data", [])
        for x in ins:
            total += float(x.get("spend", 0) or 0)
    return round(total, 2)


# ---- formatacao ------------------------------------------------------------
def brl(v):
    return ("R$ %0.2f" % v).replace(".", ",")


def num(v):
    return f"{v:,}".replace(",", ".")


def pct(v):
    return ("%0.0f%%" % v)


def montar(svc):
    ontem = dt.date.today() - dt.timedelta(days=1)
    iso = ontem.strftime("%Y-%m-%d")
    ddmm = ontem.strftime("%d/%m")

    trf = leads_por_dia(svc, "Leads_TRF")
    org = leads_por_dia(svc, "Leads_ORG")
    grupo = grupo_por_dia(svc)
    pcnt, psc = pesquisa_por_dia(svc)

    l_trf = trf.get(iso, 0)
    l_org = org.get(iso, 0)
    leads = l_trf + l_org
    g = grupo.get(iso, 0)
    p = pcnt.get(iso, 0)
    scl = psc.get(iso, [])
    score = sum(scl) / len(scl) if scl else 0
    invest = invest_dia(iso)

    custo_trf = invest / l_trf if l_trf else 0
    tx_grupo = g / leads * 100 if leads else 0
    tx_pesq = p / leads * 100 if leads else 0

    # acumulado
    acum = sum(trf.values()) + sum(org.values())
    dia_n = (ontem - CAP_INICIO).days + 1
    tot_dias = (CAP_FIM - CAP_INICIO).days + 1
    pct_meta = acum / META_LEADS * 100 if META_LEADS else 0

    L = "━━━━━━━━━━━━━━"
    msg = (
        f"📊 <b>Funil de Captação · IE30</b>\n"
        f"<i>Ontem · {ddmm}</i>\n"
        f"{L}\n"
        f"🎯 <b>Leads captados:</b> {num(leads)}\n"
        f"💰 <b>Custo por lead (tráfego):</b> {brl(custo_trf)}\n"
        f"👥 <b>Pessoas no grupo:</b> {num(g)}\n"
        f"📈 <b>Taxa de entrada no grupo:</b> {pct(tx_grupo)}\n"
        f"📝 <b>Respostas de pesquisa:</b> {num(p)}\n"
        f"✅ <b>Taxa de resposta:</b> {pct(tx_pesq)}\n"
        f"⭐ <b>Lead score médio:</b> {('%0.1f' % score).replace('.', ',')}\n"
        f"{L}\n"
        f"📦 <b>Acumulado:</b> {num(acum)} / {num(META_LEADS)} ({pct(pct_meta)})\n"
        f"🗓️ Dia {dia_n} de {tot_dias} da captação"
    )
    return msg


def telegram(msg):
    if not (TG_TOKEN and TG_CHAT):
        print("[telegram] sem token/chat, pulando")
        return
    requests.post(
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
        json={"chat_id": TG_CHAT, "text": msg, "parse_mode": "HTML",
              "disable_web_page_preview": True},
        timeout=30,
    )


def main():
    if not META_TOKEN:
        print("ERRO: META_TOKEN_CAIO ausente"); sys.exit(1)
    svc = sheets()
    msg = montar(svc)
    print(msg.replace("<b>", "").replace("</b>", "").replace("<i>", "").replace("</i>", ""))
    if not DRY_RUN:
        telegram(msg)


if __name__ == "__main__":
    main()
