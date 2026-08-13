#!/usr/bin/env python3
"""Coleta adsets por campanha (LEADS, MAI+JUN) + insights por adset."""
import os, json, time
from pathlib import Path
import requests

TOKEN = os.environ["META_TOKEN_CAIO"]
API = "https://graph.facebook.com/v21.0"
OUT = Path(__file__).parent / "raw"
camps = json.loads((OUT / "campanhas.json").read_text())
leads_camps = [c for c in camps if "[LEADS]" in c["name"].upper()]

def g(url, params, retries=3):
    params = {**params, "access_token": TOKEN}
    for i in range(retries):
        r = requests.get(url, params=params, timeout=60)
        if r.status_code == 200: return r.json()
        if r.status_code == 429: time.sleep((i+1)*20); continue
        return {"error": r.text}
    return {"error":"max"}

def pag(url, params):
    out=[]
    while url:
        d=g(url,params)
        if "error" in d: break
        out.extend(d.get("data",[]))
        nxt=d.get("paging",{}).get("next")
        url=nxt if nxt else None
        if nxt: params={}
    return out

result={}
for i,c in enumerate(leads_camps,1):
    print(f"[{i}/{len(leads_camps)}] {c['name'][:60]}", flush=True)
    adsets = pag(f"{API}/{c['id']}/adsets", {
        "fields":"id,name,status,daily_budget,created_time",
        "limit":"100"})
    # insight agregado da campanha (last_90d, total) - pra CPM/CPL/leads geral
    ins = pag(f"{API}/{c['id']}/insights", {
        "fields":"spend,impressions,clicks,inline_link_clicks,actions,cpm,frequency,reach",
        "date_preset":"last_90d","limit":"50"})
    # contar criativos unicos via ads
    ads = pag(f"{API}/{c['id']}/ads", {"fields":"id,name,status","limit":"200"})
    result[c["id"]]={"name":c["name"],"adsets":adsets,"insights":ins,"ads":ads,
                     "n_adsets":len(adsets),"n_ads":len(ads)}
    time.sleep(0.4)

(OUT/"estrutura.json").write_text(json.dumps(result,ensure_ascii=False,indent=2))
print("OK")
