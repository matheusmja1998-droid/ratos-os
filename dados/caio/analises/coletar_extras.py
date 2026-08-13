#!/usr/bin/env python3
"""
Coleta extras: breakdowns por placement, hora do dia, age/gender.
So pra ANE_MAI_26 + ANE_JUN_26 e so campanhas de LEADS.
"""
import os, json, time, sys
from pathlib import Path
import requests

TOKEN = os.environ["META_TOKEN_CAIO"]
ACCOUNT = "act_191737889662177"
API = "https://graph.facebook.com/v21.0"
OUT = Path(__file__).parent / "raw"

camps = json.loads((OUT / "campanhas.json").read_text())
leads_camps = [c for c in camps if "[LEADS]" in c["name"].upper()]

def gget(url, params, retries=3):
    params = {**params, "access_token": TOKEN}
    for i in range(retries):
        r = requests.get(url, params=params, timeout=60)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 429:
            time.sleep((i+1)*20); continue
        print(f"HTTP {r.status_code}: {r.text[:200]}", flush=True)
        return {"error": r.text}
    return {"error": "max retries"}

def paginado(url, params):
    out = []
    while url:
        d = gget(url, params)
        if "error" in d: break
        out.extend(d.get("data", []))
        nxt = d.get("paging", {}).get("next")
        url = nxt if nxt else None
        if nxt: params = {}
    return out

print(f"[1/3] Insights por PLACEMENT — {len(leads_camps)} campanhas")
out_place = {}
for i, c in enumerate(leads_camps, 1):
    print(f"  [{i}/{len(leads_camps)}] {c['name'][:70]}", flush=True)
    ins = paginado(f"{API}/{c['id']}/insights", {
        "fields": "spend,impressions,clicks,inline_link_clicks,actions,cpm,frequency,reach",
        "breakdowns": "publisher_platform,platform_position",
        "date_preset": "last_90d",
        "limit": 200,
    })
    out_place[c["id"]] = {"name": c["name"], "data": ins}
    time.sleep(0.4)
(OUT / "insights_placement.json").write_text(json.dumps(out_place, ensure_ascii=False, indent=2))

print(f"\n[2/3] Insights por AGE+GENDER — {len(leads_camps)} campanhas")
out_ag = {}
for i, c in enumerate(leads_camps, 1):
    print(f"  [{i}/{len(leads_camps)}] {c['name'][:70]}", flush=True)
    ins = paginado(f"{API}/{c['id']}/insights", {
        "fields": "spend,impressions,clicks,inline_link_clicks,actions,cpm,frequency,reach",
        "breakdowns": "age,gender",
        "date_preset": "last_90d",
        "limit": 200,
    })
    out_ag[c["id"]] = {"name": c["name"], "data": ins}
    time.sleep(0.4)
(OUT / "insights_age_gender.json").write_text(json.dumps(out_ag, ensure_ascii=False, indent=2))

print(f"\n[3/3] Insights por HORA DO DIA — {len(leads_camps)} campanhas")
out_hour = {}
for i, c in enumerate(leads_camps, 1):
    print(f"  [{i}/{len(leads_camps)}] {c['name'][:70]}", flush=True)
    ins = paginado(f"{API}/{c['id']}/insights", {
        "fields": "spend,impressions,clicks,inline_link_clicks,actions,cpm",
        "breakdowns": "hourly_stats_aggregated_by_advertiser_time_zone",
        "date_preset": "last_90d",
        "limit": 500,
    })
    out_hour[c["id"]] = {"name": c["name"], "data": ins}
    time.sleep(0.4)
(OUT / "insights_hora.json").write_text(json.dumps(out_hour, ensure_ascii=False, indent=2))

print("\nOK")
