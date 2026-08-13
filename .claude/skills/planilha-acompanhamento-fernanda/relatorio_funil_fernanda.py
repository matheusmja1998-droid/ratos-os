#!/usr/bin/env python3
"""
Relatorio diario do FUNIL de captacao da FERNANDA (AGV_AGO_26), no Telegram (@rota_wv_bot), 9h.
Self-contained: le TUDO da planilha MAE (Leads_TRF/ORG, Grupo_Wpp, Pesquisa_1/2 via SA) + invest Meta.
DEDICADO Fernanda — separado do Caio.

Reporta SEMPRE de ONTEM (dia fechado). Metricas:
  - Leads captados        = Leads_TRF + Leads_ORG na data (email valido)
  - Custo por lead (TRF)  = invest Meta do dia / leads de TRAFEGO
  - Pessoas no grupo      = Grupo_Wpp members.added na data
  - Taxa de entrada       = grupo / leads
  - Respostas de pesquisa = Pesquisa_1+_2 (dedupe email) na data
  - Taxa de resposta      = pesquisa / leads
  - Lead score medio      = media de "Pontuacao Total" das pesquisas da data
"""
import os, sys, json, datetime as dt
from pathlib import Path
import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build

ENV_PATH = Path(os.environ.get("AGENTE_ENV", "/root/agente/.env"))
SA_PATH = os.environ.get("SA_JSON", "/root/agente/sa_caio_spend.json")
DRY_RUN = os.environ.get("DRY_RUN") == "1"

MAE_ID = os.environ.get("MAE_SHEET", "1MeBTkAowscsvwjrMYHFyYEi1CUz1OeuWF_Sx8O5HaQg")
META_API = "https://graph.facebook.com/v21.0"
AD_ACCOUNT = os.environ.get("FERNANDA_AD_ACCOUNT", "act_362367444")
TAG_CAMP = os.environ.get("CAPTACAO_TAG", "AGV_AGO_26").upper()
EXCLUI = [x.strip().upper() for x in os.environ.get("CAPTACAO_EXCLUI",
          "REPLAY,CARRINHO,CONVER,RMKT,REMARKET,VIP,TSUNAMI,PRESENCIAL").split(",") if x.strip()]
CAP_INICIO = dt.date(2026, 6, 25)
CAP_FIM = dt.date(2026, 7, 26)
META_LEADS = int(os.environ.get("META_LEADS", "5600"))


def load_env(path):
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("META_TOKEN_FERNANDA", "TELEGRAM_BOT_TOKEN_ROTA_WV", "TELEGRAM_BOT_TOKEN",
              "TELEGRAM_CHAT_ID_MATHEUS", "TELEGRAM_CHAT_ID"):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


ENV = load_env(ENV_PATH)
META_TOKEN = ENV.get("META_TOKEN_FERNANDA")
TG_TOKEN = ENV.get("TELEGRAM_BOT_TOKEN_ROTA_WV") or ENV.get("TELEGRAM_BOT_TOKEN")
TG_CHAT = ENV.get("TELEGRAM_CHAT_ID_MATHEUS") or ENV.get("TELEGRAM_CHAT_ID")


def sheets():
    creds = service_account.Credentials.from_service_account_file(
        SA_PATH, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def get_vals(svc, rng):
    return (svc.spreadsheets().values()
            .get(spreadsheetId=MAE_ID, range=rng, valueRenderOption="UNFORMATTED_VALUE",
                 dateTimeRenderOption="FORMATTED_STRING").execute().get("values", []))


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


def leads_por_dia(svc, tab):
    out = {}
    for r in get_vals(svc, f"{tab}!A2:C200000"):
        if "@" not in cell(r, 0):
            continue
        iso = norm_iso(cell(r, 2))
        if iso:
            out[iso] = out.get(iso, 0) + 1
    return out


def grupo_por_dia(svc):
    out = {}
    for r in get_vals(svc, "Grupo_Wpp!A2:K200000"):
        if cell(r, 1) != "group.updated.members.added":
            continue
        ts = cell(r, 9) or cell(r, 8)
        if len(ts) >= 10:
            out[ts[:10]] = out.get(ts[:10], 0) + 1
    return out


def pesquisa_por_dia(svc):
    seen = set(); cnt, sc = {}, {}
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


def invest_dia(iso):
    camps = requests.get(
        f"{META_API}/{AD_ACCOUNT}/campaigns",
        params={"fields": "id,name", "limit": 300, "access_token": META_TOKEN,
                "filtering": json.dumps([{"field": "name", "operator": "CONTAIN", "value": TAG_CAMP}])},
        timeout=60).json().get("data", [])
    total = 0.0
    for c in camps:
        nu = c["name"].upper()
        if any(x in nu for x in EXCLUI):
            continue
        ins = requests.get(
            f"{META_API}/{c['id']}/insights",
            params={"time_range": json.dumps({"since": iso, "until": iso}),
                    "fields": "spend", "level": "campaign", "access_token": META_TOKEN},
            timeout=60).json().get("data", [])
        for x in ins:
            total += float(x.get("spend", 0) or 0)
    return round(total, 2)


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

    l_trf = trf.get(iso, 0); l_org = org.get(iso, 0); leads = l_trf + l_org
    g = grupo.get(iso, 0); p = pcnt.get(iso, 0)
    scl = psc.get(iso, []); score = sum(scl) / len(scl) if scl else 0
    invest = invest_dia(iso)

    custo_trf = invest / l_trf if l_trf else 0
    tx_grupo = g / leads * 100 if leads else 0
    tx_pesq = p / leads * 100 if leads else 0

    acum = sum(trf.values()) + sum(org.values())
    dia_n = (ontem - CAP_INICIO).days + 1
    tot_dias = (CAP_FIM - CAP_INICIO).days + 1
    pct_meta = acum / META_LEADS * 100 if META_LEADS else 0

    L = "━━━━━━━━━━━━━━"
    return (
        f"📊 <b>Funil de Captação · {TAG_CAMP}</b>\n"
        f"<i>Ontem · {ddmm}</i>\n{L}\n"
        f"🎯 <b>Leads captados:</b> {num(leads)}\n"
        f"💰 <b>Custo por lead (tráfego):</b> {brl(custo_trf)}\n"
        f"👥 <b>Pessoas no grupo:</b> {num(g)}\n"
        f"📈 <b>Taxa de entrada no grupo:</b> {pct(tx_grupo)}\n"
        f"📝 <b>Respostas de pesquisa:</b> {num(p)}\n"
        f"✅ <b>Taxa de resposta:</b> {pct(tx_pesq)}\n"
        f"⭐ <b>Lead score médio:</b> {('%0.1f' % score).replace('.', ',')}\n{L}\n"
        f"📦 <b>Acumulado:</b> {num(acum)} / {num(META_LEADS)} ({pct(pct_meta)})\n"
        f"🗓️ Dia {dia_n} de {tot_dias} da captação"
    )


def telegram(msg):
    if not (TG_TOKEN and TG_CHAT):
        print("[telegram] sem token/chat, pulando"); return
    requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
                  json={"chat_id": TG_CHAT, "text": msg, "parse_mode": "HTML",
                        "disable_web_page_preview": True}, timeout=30)


def main():
    if not META_TOKEN:
        print("ERRO: META_TOKEN_FERNANDA ausente"); sys.exit(1)
    svc = sheets()
    msg = montar(svc)
    print(msg.replace("<b>", "").replace("</b>", "").replace("<i>", "").replace("</i>", ""))
    if not DRY_RUN:
        telegram(msg)


if __name__ == "__main__":
    main()
