#!/usr/bin/env python3
"""
Robo de preenchimento diario da planilha de acompanhamento do CAIO (VISAO GERAL).

Copia 1:1 da logica da Fernanda (planilha-acompanhamento/preencher.py).
Diferencas do Caio:
  - Leads vem de UMA planilha mae com DUAS abas (Leads_TRF / Leads_ORG),
    nao de duas planilhas separadas.
  - contar_leads e robusto a data em dd/mm/aaaa OU ISO aaaa-mm-dd (n8n pode gravar
    em qualquer um dos dois; o dashboard de captacao trata ambos).

Roda todo dia 9h (cron na VPS, TZ -03) -> /root/planilha-acompanhamento-caio/run.sh.
Preenche SOMENTE as 4 colunas que o Matheus preenche na mao, para ONTEM e HOJE:
  B = Investimento (TFG)  <- Meta Ads (campanhas ACTIVE com nome contendo a tag)
  D = Cliques (TFG)       <- Meta Ads (inline_link_clicks, NUNCA clicks totais)
  E = Leads (TFG)         <- contagem de linhas da aba Leads_TRF na data
  G = Leads (ORG)         <- contagem de linhas da aba Leads_ORG na data

Depois ARRASTA as formulas (copia H:N da linha anterior, ajustando refs) nas 2 linhas.
Manda resumo no Telegram do Caio (@rota_caio_bot).

A linha de cada dia e achada por BUSCA DE TEXTO na coluna A (ex "16/06"),
nunca por offset/contagem -> imune a erro de data e a linhas faltando (ex: 17/06).
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

# Planilha de acompanhamento (aba VISAO GERAL) - lancamento ANE_SET_26 (captacao 14/08 -> 31/08)
SHEET_ID = "1AL_SrlSsCoUfbW-TrJEAZLxDN6ZBl-9rGQuJ23ZPxkM"
ABA = "VISÃO GERAL"

# Meta (Caio)
META_API = "https://graph.facebook.com/v21.0"
AD_ACCOUNT = "act_191737889662177"
# Captacao do ANE_SET_26: campanhas [ANE_SET_26]_[LEADS]_...
# Usar a tag COMPLETA (ANE_SET_26), nunca abreviacao que possa casar com lancamento antigo.
TAG = "ANE_SET_26"

# Leads: UMA planilha mae, DUAS abas ("Planilha mae do DASHBOARD - ANE_SET_26")
LEADS_SHEET_ID = "1bwK9YuPLm1dm03ql8FvyIgKds23UVVa8L2WIsis6epU"
TRF_TAB = "Leads_TRF"
ORG_TAB = "Leads_ORG"
LEADS_DATE_COL = "C"  # coluna "data" (dd/mm/aaaa ou ISO)

# Remarketing -> aba REMARKETING (mesma planilha de acompanhamento).
# Dentro do lancamento (TAG), separamos por "[LEADS]" no nome:
#   COM [LEADS]  = captacao  -> VISAO GERAL
#   SEM [LEADS]  = remarketing -> aba REMARKETING
# (mesma logica que a regua de captacao do Caio usa; nao depende do formato da tag,
#  entao nao quebra quando as campanhas de rmkt subirem com nome diferente)
REMARK_ABA = "REMARKETING"
MARCA_CAPTACAO = "[LEADS]"
TIPOS_ORDEM = ["Replay (CPLs)", "Ao vivo / CPL", "Lembrete (contagem)", "Carrinho/Conversão", "Outros"]

# Colunas alvo na VISAO GERAL
COL_INVEST = "B"
COL_CLIQUES = "D"
COL_LEADS_TRF = "E"
COL_LEADS_ORG = "G"
# Colunas de formula que sao "arrastadas"
FORMULA_COLS = ["H", "I", "J", "K", "L", "M", "N"]

# modo dry-run: nao escreve nada, so calcula e imprime (DRY_RUN=1)
DRY_RUN = os.environ.get("DRY_RUN") == "1"


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
    for k in ("META_TOKEN_CAIO", "TELEGRAM_BOT_TOKEN_ROTA_CAIO", "TELEGRAM_CHAT_ID_MATHEUS"):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


ENV = load_env(ENV_PATH)
META_TOKEN = ENV.get("META_TOKEN_CAIO")
TG_TOKEN = ENV.get("TELEGRAM_BOT_TOKEN_ROTA_CAIO")
TG_CHAT = ENV.get("TELEGRAM_CHAT_ID_MATHEUS")


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
# Coluna A vem como "16/06 - ter." -> casamos pelo prefixo "dd/mm"
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
    last = None
    for k in range(4):  # retry: FB as vezes da timeout transitorio
        try:
            r = requests.get(f"{META_API}/{path}", params=params, timeout=60)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last = e
            import time
            time.sleep(2 * (k + 1))
    raise last


def _campanhas_lancamento():
    """Todas as campanhas do lancamento (CONTAIN TAG), qualquer status.
    NAO filtra effective_status: campanha pausada ainda devolve o spend historico do
    dia, entao o investimento de um dia ja gasto nunca some quando o robo reescreve a
    linha. (Edge /campaigns retorna ACTIVE+PAUSED; arquivadas ficam de fora.)"""
    data = meta_get(
        f"{AD_ACCOUNT}/campaigns",
        {
            "fields": "id,name,effective_status",
            "filtering": json.dumps([{"field": "name", "operator": "CONTAIN", "value": TAG}]),
            "limit": 300,
        },
    )
    return data.get("data", [])


def campanhas_captacao():
    """Captacao = campanhas do lancamento COM [LEADS] no nome."""
    return [c for c in _campanhas_lancamento() if MARCA_CAPTACAO in (c.get("name") or "").upper()]


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
# Remarketing (aba REMARKETING): spend/impressions/cliques por dia + tabela por tipo
# ----------------------------------------------------------------------------
def campanhas_rmkt():
    """Remarketing = campanhas do lancamento SEM [LEADS] no nome (complemento da captacao)."""
    return [c for c in _campanhas_lancamento() if MARCA_CAPTACAO not in (c.get("name") or "").upper()]


def tipo_campanha(nome):
    u = (nome or "").upper()
    if "REPLAY" in u:
        return "Replay (CPLs)"
    if "AO VIVO" in u:
        return "Ao vivo / CPL"
    if "RMKT" in u or "LEMBRETE" in u or "REGRESSIVA" in u or "CONTAGEM" in u:
        return "Lembrete (contagem)"
    if "CONVERS" in u or "CARRINHO" in u:
        return "Carrinho/Conversão"
    return "Outros"


def rmkt_metricas_dia(camps, dia_iso):
    """spend, impressions, inline_link_clicks somados no dia (todas rmkt)."""
    sp = im = cl = 0.0
    for c in camps:
        ins = meta_get(
            f"{c['id']}/insights",
            {
                "time_range": json.dumps({"since": dia_iso, "until": dia_iso}),
                "fields": "spend,impressions,inline_link_clicks",
                "level": "campaign",
            },
        ).get("data", [])
        for i in ins:
            sp += float(i.get("spend", 0) or 0)
            im += int(i.get("impressions", 0) or 0)
            cl += int(i.get("inline_link_clicks", 0) or 0)
    return round(sp, 2), int(im), int(cl)


def escrever_aba(svc, aba, updates):
    """updates: lista de (range_a1, valor) numa aba qualquer, USER_ENTERED."""
    data = [{"range": f"'{aba}'!{rng}", "values": [[val]]} for rng, val in updates]
    svc.spreadsheets().values().batchUpdate(
        spreadsheetId=SHEET_ID, body={"valueInputOption": "USER_ENTERED", "data": data}
    ).execute()


def processar_remarketing(svc, rmkt_col_a, camps, label, dia):
    """Preenche B/C/D de um dia na aba REMARKETING. Retorna resumo ou None se pular."""
    ddmm = dia.strftime("%d/%m")
    iso = dia.strftime("%Y-%m-%d")
    linha = achar_linha_por_data(rmkt_col_a, ddmm)
    if not linha:
        return None
    sp, im, cl = rmkt_metricas_dia(camps, iso)
    if not DRY_RUN:
        escrever_aba(svc, REMARK_ABA, [(f"B{linha}", sp), (f"C{linha}", im), (f"D{linha}", cl)])
    return f"  RMKT {ddmm}: R$ {sp:,.2f} | impr {im:,} | clk {cl:,}".replace(",", ".")


def atualizar_tabela_tipos(svc, rmkt_col_a, camps):
    """Recalcula a tabela lateral 'POR TIPO DE CAMPANHA' (J4:J8) sobre o range do lancamento."""
    datas = [(i + 1, (r[0] if r else "").strip()) for i, r in enumerate(rmkt_col_a)]
    datas = [(row, v) for row, v in datas if row >= 4 and v[:1].isdigit() and "/" in v]
    if not datas:
        return
    def to_iso(lbl):
        dd, mm = lbl.split(" ")[0].split("/")
        return f"{dia0.year}-{mm}-{dd}"
    dia0 = dt.date.today()
    ini = to_iso(datas[0][1])
    fim = min(dia0, dt.date.fromisoformat(to_iso(datas[-1][1]))).isoformat()
    por_tipo = {t: 0.0 for t in TIPOS_ORDEM}
    for c in camps:
        ins = meta_get(
            f"{c['id']}/insights",
            {"time_range": json.dumps({"since": ini, "until": fim}), "fields": "spend", "level": "campaign"},
        ).get("data", [])
        por_tipo[tipo_campanha(c["name"])] += sum(float(i.get("spend", 0) or 0) for i in ins)
    if not DRY_RUN:
        escrever_aba(svc, REMARK_ABA, [(f"J{4+k}", round(por_tipo[t], 2)) for k, t in enumerate(TIPOS_ORDEM)])


# ----------------------------------------------------------------------------
# Leads: contar linhas com a data alvo na coluna de data de uma aba
# Robusto a dd/mm/aaaa e ISO aaaa-mm-dd (com ou sem hora).
# ----------------------------------------------------------------------------
def _norm_data_iso(s):
    """Normaliza uma celula de data para 'YYYY-MM-DD' ou None."""
    s = (s or "").strip()
    if not s:
        return None
    # ISO 2026-06-16 ou 2026-06-16T...
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    # BR 16/06/2026
    if len(s) >= 10 and s[2] == "/" and s[5] == "/":
        d, m, a = s[:2], s[3:5], s[6:10]
        return f"{a}-{m}-{d}"
    return None


def contar_leads(svc, sheet_id, tab, dia_iso):
    vals = get_values(svc, sheet_id, f"'{tab}'!{LEADS_DATE_COL}2:{LEADS_DATE_COL}", "FORMATTED_VALUE")
    n = 0
    for row in vals:
        if row and _norm_data_iso(row[0]) == dia_iso:
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
    iso = dia.strftime("%Y-%m-%d")

    linha = achar_linha_por_data(col_a, ddmm)
    if not linha:
        return f"⚠️ {label} ({ddmm}): linha nao encontrada na coluna A, pulei."

    spend, clicks = meta_spend_clicks(iso)
    leads_trf = contar_leads(svc, LEADS_SHEET_ID, TRF_TAB, iso)
    leads_org = contar_leads(svc, LEADS_SHEET_ID, ORG_TAB, iso)

    updates = [
        (f"{COL_INVEST}{linha}", spend),
        (f"{COL_CLIQUES}{linha}", clicks),
        (f"{COL_LEADS_TRF}{linha}", leads_trf),
        (f"{COL_LEADS_ORG}{linha}", leads_org),
    ]
    # arrasta formulas da linha de cima (linha 4 ja tem as formulas certas; so arrasta de 5 em diante)
    if linha > 4:
        fmap = montar_formula_arrastada(svc, SHEET_ID, linha, linha - 1)
        for col, f in fmap.items():
            updates.append((f"{col}{linha}", f))

    if not DRY_RUN:
        escrever(svc, updates)

    prefixo = "[DRY] " if DRY_RUN else ""
    return (
        f"{prefixo}<b>{label} {ddmm}</b> (linha {linha})\n"
        f"  Invest: R$ {spend:,.2f} | Cliques: {clicks:,}\n"
        f"  Leads TFG: {leads_trf} | Leads ORG: {leads_org}"
    ).replace(",", ".")


def main():
    if not META_TOKEN:
        print("ERRO: META_TOKEN_CAIO ausente no env")
        sys.exit(1)

    hoje = dt.date.today()
    ontem = hoje - dt.timedelta(days=1)

    svc = sheets_service()
    col_a = get_values(svc, SHEET_ID, f"'{ABA}'!A1:A60", "FORMATTED_VALUE")

    blocos = []
    for label, dia in (("Ontem", ontem), ("Hoje (parcial)", hoje)):
        try:
            blocos.append(processar_dia(svc, col_a, label, dia))
        except Exception as e:
            blocos.append(f"❌ {label} ({dia:%d/%m}): erro -> {e}")

    # REMARKETING (aba separada). Nunca derruba a VISAO GERAL: tudo em try/except.
    try:
        abas = [s["properties"]["title"] for s in svc.spreadsheets().get(spreadsheetId=SHEET_ID).execute()["sheets"]]
        if REMARK_ABA in abas:
            rmkt_col_a = get_values(svc, SHEET_ID, f"'{REMARK_ABA}'!A1:A60", "FORMATTED_VALUE")
            camps = campanhas_rmkt()
            rblocos = []
            for label, dia in (("Ontem", ontem), ("Hoje (parcial)", hoje)):
                r = processar_remarketing(svc, rmkt_col_a, camps, label, dia)
                if r:
                    rblocos.append(r)
            atualizar_tabela_tipos(svc, rmkt_col_a, camps)
            if rblocos:
                blocos.append("<b>Remarketing</b>\n" + "\n".join(rblocos))
    except Exception as e:
        blocos.append(f"⚠️ Remarketing: erro -> {e}")

    header = "🧪 <b>[DRY-RUN] Planilha Caio</b>\n\n" if DRY_RUN else "📊 <b>Planilha Caio atualizada</b>\n\n"
    msg = header + "\n\n".join(blocos)
    print(msg.replace("<b>", "").replace("</b>", ""))
    if not DRY_RUN:
        telegram(msg)


if __name__ == "__main__":
    main()
