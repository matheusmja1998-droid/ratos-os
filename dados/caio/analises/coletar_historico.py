#!/usr/bin/env python3
"""
Coleta todo o historico das campanhas ANE_MAI_26 e ANE_JUN_26 do Caio
e salva em JSON pra analise posterior.

Puxa:
- Campanhas (todas, status, datas, budget)
- Ads de cada campanha (nome, status, criativo, datas)
- Insights diarios por ad (spend, impressions, clicks, leads, cpm, ctr, freq, video views)
- Insights diarios por campanha
"""
import os, json, time, sys
from pathlib import Path
from datetime import date
import requests

TOKEN = os.environ["META_TOKEN_CAIO"]
ACCOUNT = "act_191737889662177"
API = "https://graph.facebook.com/v21.0"
OUT = Path(__file__).parent / "raw"
OUT.mkdir(exist_ok=True)

TAGS = ["ANE_MAI_26", "ANE_JUN_26"]

def gget(url, params, retries=3):
    params = {**params, "access_token": TOKEN}
    for i in range(retries):
        r = requests.get(url, params=params, timeout=60)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 429 or "rate" in r.text.lower():
            print(f"  ! rate limit, espera {(i+1)*20}s...", flush=True)
            time.sleep((i+1)*20)
            continue
        print(f"  ! HTTP {r.status_code}: {r.text[:200]}", flush=True)
        return {"error": r.text, "status": r.status_code}
    return {"error": "max retries"}

def paginado(url, params):
    out = []
    while url:
        d = gget(url, params)
        if "error" in d: break
        out.extend(d.get("data", []))
        nxt = d.get("paging", {}).get("next")
        if nxt:
            url = nxt; params = {}
        else:
            url = None
    return out

def main():
    print("[1/4] Listando todas as campanhas do Caio...", flush=True)
    camps = paginado(f"{API}/{ACCOUNT}/campaigns", {
        "fields": "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,buying_type,bid_strategy,special_ad_categories,created_time,updated_time",
        "limit": 200,
    })
    alvo = [c for c in camps if any(t in c["name"] for t in TAGS)]
    print(f"  Total contas: {len(camps)} | Filtradas (MAI+JUN 26): {len(alvo)}", flush=True)
    (OUT / "campanhas.json").write_text(json.dumps(alvo, ensure_ascii=False, indent=2))

    print("[2/4] Coletando insights diarios por campanha (last 90d)...", flush=True)
    insights_camps = {}
    for i, c in enumerate(alvo, 1):
        cid = c["id"]
        print(f"  [{i}/{len(alvo)}] {c['name'][:70]}", flush=True)
        ins = paginado(f"{API}/{cid}/insights", {
            "fields": "date_start,spend,impressions,reach,clicks,inline_link_clicks,inline_link_click_ctr,cpm,ctr,frequency,actions,action_values,cost_per_action_type,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions",
            "time_increment": 1,
            "date_preset": "last_90d",
            "limit": 500,
        })
        insights_camps[cid] = ins
        time.sleep(0.4)
    (OUT / "insights_campanhas.json").write_text(json.dumps(insights_camps, ensure_ascii=False, indent=2))

    print("[3/4] Listando ads de cada campanha...", flush=True)
    ads_por_camp = {}
    for i, c in enumerate(alvo, 1):
        cid = c["id"]
        print(f"  [{i}/{len(alvo)}] ads de {c['name'][:60]}", flush=True)
        ads = paginado(f"{API}/{cid}/ads", {
            "fields": "id,name,status,effective_status,created_time,updated_time,adset_id,creative{id,name,video_id,image_url,thumbnail_url,object_story_spec}",
            "limit": 200,
        })
        ads_por_camp[cid] = ads
        time.sleep(0.4)
    (OUT / "ads.json").write_text(json.dumps(ads_por_camp, ensure_ascii=False, indent=2))

    print("[4/4] Insights diarios por ad (last 90d)...", flush=True)
    all_ads = [(cid, a) for cid, ads in ads_por_camp.items() for a in ads]
    print(f"  Total ads: {len(all_ads)}", flush=True)
    insights_ads = {}
    for i, (cid, a) in enumerate(all_ads, 1):
        aid = a["id"]
        if i % 25 == 0:
            print(f"  [{i}/{len(all_ads)}]", flush=True)
        ins = paginado(f"{API}/{aid}/insights", {
            "fields": "date_start,spend,impressions,reach,clicks,inline_link_clicks,inline_link_click_ctr,cpm,ctr,frequency,actions,video_play_actions,video_p25_watched_actions,video_p100_watched_actions",
            "time_increment": 1,
            "date_preset": "last_90d",
            "limit": 500,
        })
        insights_ads[aid] = {"campanha_id": cid, "nome_ad": a["name"], "insights": ins}
        time.sleep(0.3)
    (OUT / "insights_ads.json").write_text(json.dumps(insights_ads, ensure_ascii=False, indent=2))

    print(f"OK Tudo salvo em {OUT}", flush=True)

if __name__ == "__main__":
    main()
