#!/usr/bin/env python3
"""
Robo de preenchimento diario da planilha de acompanhamento da Fernanda (VISAO GERAL).

Roda todo dia 8h (cron na VPS, TZ America/Sao_Paulo).
Preenche SOMENTE as 4 colunas que o Matheus preenche na mao, para ONTEM e HOJE:
  B = Investimento (TFG)  <- Meta Ads (campanhas ACTIVE com nome contendo a tag)
  D = Cliques (TFG)       <- Meta Ads (mesmas campanhas)
  E = Leads (TFG)         <- contagem de linhas da planilha LEADS-TRF na data
  G = Leads (ORG)         <- contagem de linhas da planilha LEADS-ORG na data

Depois ARRASTA as formulas (copia H:N da linha anterior, ajustando refs) nas 2 linhas.
Manda resumo no Telegram.

A linha de cada dia e achada por BUSCA DE TEXTO na coluna A (ex "09/06"),
nunca por offset/contagem -> imune a erro de data.
"""
import os
import sys
import json
import datetime as dt
from pathlib import Path

import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build

# ----------------------------------------------------------------------------
# Config
# ----------------------------------------------------------------------------
BASE = Path(__file__).resolve().parent
ENV_PATH = Path(os.environ.get("AGENTE_ENV", "/root/agente/.env"))
SA_PATH = os.environ.get("SA_JSON", "/root/agente/sa_caio_spend.json")

SHEET_ID = "1qdg3EpBsfS8bSEKg8NtM1BWX9OaJfwYeSj-uoxdGmng"
ABA = "VISÃO GERAL"

# Meta
META_API = "https://graph.facebook.com/v21.0"
AD_ACCOUNT = "act_362367444"
TAG = "AGV_JUN_26"  # nome de campanha de captacao contem isso

# Planilhas de leads (fonte de verdade dos leads)
TRF_SHEET = "12BX0ueGhxil-Z19k6DSdMfCRbuvwiWI_Y_O3KrrDnvw"
ORG_SHEET = "1T_z9Guxmi885gR-EkGQHdLRh98WH5rh40oE9xbfg4ZU"
LEADS_TAB = "Página1"
LEADS_DATE_COL = "C"  # "date lead" em dd/mm/aaaa

# Colunas alvo na VISAO GERAL
COL_INVEST = "B"
COL_CLIQUES = "D"
COL_LEADS_TRF = "E"
COL_LEADS_ORG = "G"
# Colunas de formula que sao "arrastadas"
FORMULA_COLS = ["H", "I", "J", "K", "L", "M", "N"]


def load_env(path):
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    # tambem aceita variaveis ja no ambiente
    for k in ("META_TOKEN_FERNANDA", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID_MATHEUS"):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


ENV = load_env(ENV_PATH)
META_TOKEN = ENV.get("META_TOKEN_FERNANDA")
TG_TOKEN = ENV.get("TELEGRAM_BOT_TOKEN")
TG_CHAT = ENV.get("TELEGRAM_CHAT_ID_MATHEUS")


def col_letter_to_index(letter):
    idx = 0
    for ch in letter:
        idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
    return idx - 1  # 0-based


# ----------------------------------------------------------------------------
# Google Sheets
# ----------------------------------------------------------------------------
def sheets_service():
    creds = service_account.Credentials.from_service_account_file(
        SA_PATH, scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def get_values(svc, sheet_id, rng, render="FORMATTED_VALUE"):
    return (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=rng, valueRenderOption=render)
        .execute()
        .get("values", [])
    )


# ----------------------------------------------------------------------------
# Achar a linha de uma data na coluna A da VISAO GERAL
# Coluna A vem como "09/06 - ter." -> casamos pelo prefixo "dd/mm"
# ----------------------------------------------------------------------------
def achar_linha_por_data(col_a, alvo_ddmm):
    """col_a = lista de [valor] da coluna A a partir da linha 1. Retorna nº da linha (1-based) ou None."""
    for i, row in enumerate(col_a):
        val = (row[0] if row else "").strip()
        if val.startswith(alvo_ddmm):
            return i + 1
    return None


# ----------------------------------------------------------------------------
# Meta Ads: somar spend + clicks das campanhas de captacao numa data
# ----------------------------------------------------------------------------
def meta_get(path, params):
    params = dict(params)
    params["access_token"] = META_TOKEN
    r = requests.get(f"{META_API}/{path}", params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def campanhas_captacao():
    data = meta_get(
        f"{AD_ACCOUNT}/campaigns",
        {
            "fields": "id,name,effective_status",
            "filtering": json.dumps(
                [
                    {"field": "name", "operator": "CONTAIN", "value": TAG},
                    {"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]},
                ]
            ),
            "limit": 200,
        },
    )
    return data.get("data", [])


def meta_spend_clicks(dia_iso):
    """Soma spend e cliques-no-link das campanhas de captacao no dia (YYYY-MM-DD).
    Cliques = inline_link_clicks (cliques no link), que e o que a planilha usa na col D.
    NAO usar 'clicks' (totais), que inflam ~2x (curtida, comentario, expandir foto, etc)."""
    total_spend = 0.0
    total_clicks = 0
    for c in campanhas_captacao():
        data = meta_get(
            f"{c['id']}/insights",
            {
                "time_range": json.dumps({"since": dia_iso, "until": dia_iso}),
                "fields": "spend,inline_link_clicks",
                "level": "campaign",
            },
        )
        for ins in data.get("data", []):
            total_spend += float(ins.get("spend", 0) or 0)
            total_clicks += int(ins.get("inline_link_clicks", 0) or 0)
    return round(total_spend, 2), total_clicks


# ----------------------------------------------------------------------------
# Leads: contar linhas com a data na coluna C
# ----------------------------------------------------------------------------
def contar_leads(svc, sheet_id, dia_ddmmaaaa):
    vals = get_values(svc, sheet_id, f"'{LEADS_TAB}'!{LEADS_DATE_COL}2:{LEADS_DATE_COL}", "FORMATTED_VALUE")
    n = 0
    for row in vals:
        if row and row[0].strip() == dia_ddmmaaaa:
            n += 1
    return n


# ----------------------------------------------------------------------------
# Escrever celulas + arrastar formulas
# ----------------------------------------------------------------------------
def montar_formula_arrastada(svc, sheet_id, linha_destino, linha_modelo):
    """Le as formulas (FORMULA) da linha_modelo para H:N e ajusta os numeros de linha
    de linha_modelo -> linha_destino. Retorna dict col->formula."""
    rng = f"'{ABA}'!H{linha_modelo}:N{linha_modelo}"
    formulas = get_values(svc, sheet_id, rng, "FORMULA")
    out = {}
    if not formulas or not formulas[0]:
        return out
    src = formulas[0]
    import re

    def shift(m):
        return m.group(1) + str(int(m.group(2)) + (linha_destino - linha_modelo))

    for off, col in enumerate(FORMULA_COLS):
        if off >= len(src):
            break
        f = src[off]
        if isinstance(f, str) and f.startswith("="):
            # desloca refs A1 do tipo Letra+Numero (col absoluta de linha relativa)
            f = re.sub(r"([A-Z]{1,3})(\d+)", shift, f)
        out[col] = f
    return out


def escrever(svc, updates):
    """updates: lista de (range_a1, valor). Faz batchUpdate com USER_ENTERED (interpreta formulas)."""
    data = [{"range": f"'{ABA}'!{rng}", "values": [[val]]} for rng, val in updates]
    body = {"valueInputOption": "USER_ENTERED", "data": data}
    svc.spreadsheets().values().batchUpdate(spreadsheetId=SHEET_ID, body=body).execute()


# ----------------------------------------------------------------------------
# Telegram
# ----------------------------------------------------------------------------
def telegram(msg):
    if not (TG_TOKEN and TG_CHAT):
        print("[telegram] sem token/chat, pulando")
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            json={"chat_id": TG_CHAT, "text": msg, "parse_mode": "HTML"},
            timeout=30,
        )
    except Exception as e:
        print("[telegram] erro:", e)


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def processar_dia(svc, col_a, label, dia):
    """dia = date. Retorna texto de resumo do dia ou erro."""
    ddmm = dia.strftime("%d/%m")
    ddmmaaaa = dia.strftime("%d/%m/%Y")
    iso = dia.strftime("%Y-%m-%d")

    linha = achar_linha_por_data(col_a, ddmm)
    if not linha:
        return f"⚠️ {label} ({ddmm}): linha nao encontrada na coluna A, pulei."

    spend, clicks = meta_spend_clicks(iso)
    leads_trf = contar_leads(svc, TRF_SHEET, ddmmaaaa)
    leads_org = contar_leads(svc, ORG_SHEET, ddmmaaaa)

    updates = [
        (f"{COL_INVEST}{linha}", spend),
        (f"{COL_CLIQUES}{linha}", clicks),
        (f"{COL_LEADS_TRF}{linha}", leads_trf),
        (f"{COL_LEADS_ORG}{linha}", leads_org),
    ]
    # arrasta formulas da linha de cima
    if linha > 4:
        fmap = montar_formula_arrastada(svc, SHEET_ID, linha, linha - 1)
        for col, f in fmap.items():
            updates.append((f"{col}{linha}", f))

    escrever(svc, updates)

    return (
        f"<b>{label} {ddmm}</b> (linha {linha})\n"
        f"  Invest: R$ {spend:,.2f} | Cliques: {clicks:,}\n"
        f"  Leads TFG: {leads_trf} | Leads ORG: {leads_org}"
    ).replace(",", ".")


def main():
    if not META_TOKEN:
        print("ERRO: META_TOKEN_FERNANDA ausente no env")
        sys.exit(1)

    hoje = dt.date.today()
    ontem = hoje - dt.timedelta(days=1)

    svc = sheets_service()
    col_a = get_values(svc, SHEET_ID, f"'{ABA}'!A1:A40", "FORMATTED_VALUE")

    blocos = []
    for label, dia in (("Ontem", ontem), ("Hoje (parcial)", hoje)):
        try:
            blocos.append(processar_dia(svc, col_a, label, dia))
        except Exception as e:
            blocos.append(f"❌ {label} ({dia:%d/%m}): erro -> {e}")

    msg = "📊 <b>Planilha Fernanda atualizada</b>\n\n" + "\n\n".join(blocos)
    print(msg.replace("<b>", "").replace("</b>", ""))
    telegram(msg)


if __name__ == "__main__":
    main()
