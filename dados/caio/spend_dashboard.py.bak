#!/usr/bin/env python3
"""
Alimenta a planilha de investimento do dashboard de vendas do Caio (WT + Checklist).
Roda na VPS a cada 4h via cron.

- Puxa insights diarios da Meta (token Caio) de campanhas com WT/WORKSHOP ou CHECKLIST no nome.
- Escreve na planilha de spend (aba Pagina1) no formato exato de 10 colunas que o dashboard ja le.
- Idempotente: reescreve as linhas das datas dentro da janela (remove e reinsere), nao duplica.

Janela: ultimos N dias (default 45) — cobre o buraco desde 26/04 e mantem atualizado.
O dashboard classifica WT vs Checklist pelo nome da campanha sozinho, entao so precisamos
jogar TODAS as campanhas WT+Checklist com data/nome/gasto/metricas.
"""
import os, sys, json, urllib.request, urllib.parse, re
from datetime import date, timedelta
from google.oauth2 import service_account
from googleapiclient.discovery import build

TOKEN = os.environ["META_TOKEN_CAIO"]
ACC = "act_191737889662177"
API = "https://graph.facebook.com/v21.0"
SHEET = "1zkxFwcLYRK0L216AFYyBvsKhWmIW6uNCZ1IunxuSE00"
ABA = "Página1"
SA_FILE = os.environ.get("CAIO_SA_FILE", "/root/agente/sa_caio_spend.json")
JANELA_DIAS = int(os.environ.get("SPEND_JANELA_DIAS", "45"))

HEADER = ["Date","Campaign Name","Spend (Cost, Amount Spent)","Impressions",
          "Reach (Estimated)","Unique Inline Link Clicks","CPM (Cost per 1000 Impressions)",
          "CPC (Cost per Click)","Action Omni Purchase","Cost Per Action Omni Purchase"]

def gget(url, params, retries=3):
    import time
    # se a url ja vem com query (caso do paging 'next'), nao re-encoda; so garante o token
    if "?" in url:
        full = url if "access_token=" in url else url + "&access_token=" + urllib.parse.quote(TOKEN)
    else:
        full = url + "?" + urllib.parse.urlencode({**params, "access_token": TOKEN})
    for i in range(retries):
        try:
            return json.load(urllib.request.urlopen(full, timeout=90))
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 429 or "rate" in body.lower():
                time.sleep((i+1)*20); continue
            print("HTTP", e.code, body[:200]); return {"error": body}
    return {"error": "max retries"}

def paginado(url, params):
    out = []
    first = True
    while url:
        # na 1a chamada passa params; nas seguintes o 'next' ja vem com tudo embutido
        d = gget(url, params if first else {})
        first = False
        if "error" in d: break
        out.extend(d.get("data", []))
        url = d.get("paging", {}).get("next")
    return out

def br(v):
    """float -> string com virgula decimal (formato BR que a planilha usa)."""
    return ("%.6f" % float(v)).rstrip("0").rstrip(".").replace(".", ",") if v else "0"

def acts(a):
    return {x["action_type"]: float(x["value"]) for x in (a or [])}

def is_alvo(nome):
    n = nome.upper()
    return ("WT" in n) or ("WORKSHOP" in n) or ("CHECKLIST" in n)

def purchases(ins):
    a = acts(ins.get("actions"))
    # omni_purchase = compra (cobre web + offsite)
    for k in ("omni_purchase","purchase","offsite_conversion.fb_pixel_purchase"):
        if k in a: return int(a[k])
    return 0

def main():
    hoje = date.today()
    desde = hoje - timedelta(days=JANELA_DIAS)
    since, until = desde.isoformat(), hoje.isoformat()
    print(f"[1/4] Janela: {since} -> {until}", flush=True)

    # 1) campanhas alvo
    camps = paginado(f"{API}/{ACC}/campaigns", {"fields":"id,name","limit":"500"})
    alvo = [c for c in camps if is_alvo(c["name"])]
    print(f"  {len(alvo)} campanhas WT/Checklist", flush=True)

    # 2) insights diarios por campanha
    print("[2/4] Puxando insights diarios...", flush=True)
    linhas = []  # cada uma = lista de 10 colunas
    for c in alvo:
        ins = paginado(f"{API}/{c['id']}/insights", {
            "fields":"date_start,spend,impressions,reach,inline_link_clicks,cpm,cpc,actions",
            "time_increment":"1",
            "time_range": json.dumps({"since":since,"until":until}),
            "limit":"500",
        })
        for r in ins:
            sp = float(r.get("spend") or 0)
            if sp <= 0: continue
            p = purchases(r)
            cpa = (sp/p) if p else 0
            linhas.append([
                r.get("date_start",""),
                c["name"],
                br(sp),
                str(int(r.get("impressions") or 0)),
                str(int(r.get("reach") or 0)),
                str(int(r.get("inline_link_clicks") or 0)),
                br(r.get("cpm") or 0),
                br(r.get("cpc") or 0),
                str(p),
                br(cpa),
            ])
    print(f"  {len(linhas)} linhas (campanha x dia) com gasto", flush=True)
    if not linhas:
        print("  nada a escrever, saindo."); return

    # 3) le APENAS as datas que ja existem na planilha (nao apaga nada)
    print("[3/4] Lendo datas existentes (modo append seguro)...", flush=True)
    creds = service_account.Credentials.from_service_account_file(
        SA_FILE, scopes=["https://www.googleapis.com/auth/spreadsheets"])
    svc = build("sheets","v4",credentials=creds)
    atual = svc.spreadsheets().values().get(
        spreadsheetId=SHEET, range=f"{ABA}!A:B").execute().get("values", [])
    # chave de dedup: (data, nome_campanha) ja presente
    existentes = set()
    for r in atual[1:]:
        if len(r) >= 2:
            existentes.add((r[0], r[1]))
    # so as linhas (data+campanha) que ainda NAO estao na planilha
    novas = [l for l in linhas if (l[0], l[1]) not in existentes]
    print(f"  {len(existentes)} combinacoes data+campanha ja existem · {len(novas)} novas a adicionar", flush=True)
    if not novas:
        print("OK nada novo pra adicionar (planilha ja em dia)."); return

    # 4) APPEND no fim — nunca toca no que ja existe
    print("[4/4] Append...", flush=True)
    svc.spreadsheets().values().append(
        spreadsheetId=SHEET, range=f"{ABA}!A:J",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": novas}).execute()
    print(f"OK {len(novas)} linhas adicionadas (append, sem apagar nada).", flush=True)

if __name__ == "__main__":
    main()
