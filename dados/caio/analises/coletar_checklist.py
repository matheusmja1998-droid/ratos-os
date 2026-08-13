#!/usr/bin/env python3
"""Coleta tudo das campanhas CHECKLIST do Caio (lifetime) pra análise de escala."""
import os, json, time, urllib.request, urllib.parse
from pathlib import Path
TOKEN=os.environ["META_TOKEN_CAIO"];ACC="act_191737889662177";API="https://graph.facebook.com/v21.0"
OUT=Path(__file__).parent/"raw_checklist";OUT.mkdir(exist_ok=True)
def gget(url,params):
    import time
    if "?" in url: full=url if "access_token=" in url else url+"&access_token="+urllib.parse.quote(TOKEN)
    else: full=url+"?"+urllib.parse.urlencode({**params,"access_token":TOKEN})
    for i in range(3):
        try:return json.load(urllib.request.urlopen(full,timeout=90))
        except urllib.error.HTTPError as e:
            b=e.read().decode()
            if e.code==429:time.sleep((i+1)*20);continue
            return {"error":b}
    return {"error":"max"}
def pag(url,params):
    out=[];first=True
    while url:
        d=gget(url,params if first else {});first=False
        if "error" in d:break
        out.extend(d.get("data",[]));url=d.get("paging",{}).get("next")
    return out

camps=pag(f"{API}/{ACC}/campaigns",{"fields":"id,name,effective_status,objective,daily_budget","limit":"500"})
ck=[c for c in camps if "CHECKLIST" in c["name"].upper()]
print(f"[1/4] {len(ck)} campanhas Checklist",flush=True)
(OUT/"campanhas.json").write_text(json.dumps(ck,ensure_ascii=False,indent=2))

print("[2/4] insights diarios por campanha (lifetime)...",flush=True)
ic={}
for i,c in enumerate(ck,1):
    ic[c["id"]]=pag(f"{API}/{c['id']}/insights",{"fields":"date_start,spend,impressions,reach,inline_link_clicks,inline_link_click_ctr,cpm,cpc,ctr,frequency,actions","time_increment":"1","date_preset":"maximum","limit":"500"})
    time.sleep(0.3)
(OUT/"insights_campanhas.json").write_text(json.dumps(ic,ensure_ascii=False,indent=2))

print("[3/4] ads por campanha...",flush=True)
ads={}
for c in ck:
    ads[c["id"]]=pag(f"{API}/{c['id']}/ads",{"fields":"id,name,status,effective_status,adset{name}","limit":"200"})
    time.sleep(0.3)
(OUT/"ads.json").write_text(json.dumps(ads,ensure_ascii=False,indent=2))

print("[4/4] insights lifetime por ad...",flush=True)
ia={}
allads=[(cid,a) for cid,arr in ads.items() for a in arr]
for i,(cid,a) in enumerate(allads,1):
    ins=pag(f"{API}/{a['id']}/insights",{"fields":"spend,impressions,inline_link_clicks,inline_link_click_ctr,cpm,actions","date_preset":"maximum","limit":"100"})
    ia[a["id"]]={"campanha_id":cid,"nome":a["name"],"insights":ins}
    if i%20==0:print(f"  {i}/{len(allads)}",flush=True)
    time.sleep(0.25)
(OUT/"insights_ads.json").write_text(json.dumps(ia,ensure_ascii=False,indent=2))
print("OK",flush=True)
