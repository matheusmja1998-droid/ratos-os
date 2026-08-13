#!/usr/bin/env python3
"""Analise das campanhas Checklist do Caio — padroes de escala.
Cruza investimento (Meta) com vendas (planilha, regra de bump do dash)."""
import json, re, urllib.request, csv, io
from pathlib import Path
from collections import defaultdict
from datetime import datetime

BASE=Path(__file__).parent;RAW=BASE/"raw_checklist"
KEY="AIzaSyDFhiUa3LAd8yCaQusFRqf45aWRgOGnAuQ"
VENDAS="1yYf7mz3P1YxxOPddSD-EO2r634FjAHQmMcnUFfydcfA"
OUT=Path("/Users/matheusjardim/claude/Ratos OS/winvision/clientes/prof-caio-pickcius/analise-checklist.md")

camps=json.loads((RAW/"campanhas.json").read_text())
ic=json.loads((RAW/"insights_campanhas.json").read_text())
ads=json.loads((RAW/"ads.json").read_text())
ia=json.loads((RAW/"insights_ads.json").read_text())
cby={c["id"]:c for c in camps}

def acts(a): return {x["action_type"]:float(x["value"]) for x in (a or [])}
def purch(ins):
    d=acts(ins.get("actions"))
    for k in ("omni_purchase","purchase","offsite_conversion.fb_pixel_purchase"):
        if k in d: return int(d[k])
    return 0
def fase(n):
    n=n.upper()
    for f in ["TESTE_DE_PAGINA","TESTE DE PAGINA","TESTE_DE_CRIATIVO","TESTE DE CRIATIVO","TESTE_DE_ESCALA","TESTE DE ESCALA","TESTE_DE_PUBLICO","TESTE DE PUBLICO","TESTE DE PÚBLICO"]:
        if f in n: return f.replace(" ","_").replace("PÚBLICO","PUBLICO")
    if "QUENTE" in n: return "QUENTE"
    if "FRIO" in n: return "FRIO_GENERICO"
    return "OUTRO"
def modelo(n):
    n=n.upper()
    if "HONDA" in n: return "HONDA"
    if "YAMAHA" in n: return "YAMAHA"
    return "GENERICO"
def tipo(n):
    n=n.upper()
    adv="+ADV" if "+ADV" in n or "ADVANTAGE" in n else ""
    if "ABO" in n: return "ABO"+adv
    if "CBO" in n: return "CBO"+adv
    return "?"
def agg(inss):
    s=imp=clk=lk=p=0;dias=set()
    for i in inss:
        s+=float(i.get("spend") or 0);imp+=int(i.get("impressions") or 0)
        lk+=int(i.get("inline_link_clicks") or 0);p+=purch(i)
        if i.get("date_start"):dias.add(i["date_start"])
    return {"spend":s,"imp":imp,"lk":lk,"purch":p,"dias":len(dias),
            "cpm":s/imp*1000 if imp else 0,"ctr":lk/imp*100 if imp else 0,
            "cpc":s/lk if lk else 0,"cpa":s/p if p else 0}

L=[];P=lambda *a:L.append(" ".join(str(x) for x in a))
P("# Análise Checklist — Padrões de Escala | Caio Pickcius")
P("*Lifetime (jan-jun 26). Investimento via Meta API, compras via pixel (omni_purchase).*")
P("")

# 1. Por FASE/estrutura
P("## 1. Por estrutura de campanha")
P("")
P("| Estrutura | #camp | Invest | Compras | CPA | CPM | CTR link |")
P("|---|---:|---:|---:|---:|---:|---:|")
byf=defaultdict(lambda:{"c":0,"inss":[]})
for c in camps:
    f=fase(c["name"]);byf[f]["c"]+=1;byf[f]["inss"].extend(ic.get(c["id"],[]))
rows=[]
for f,d in byf.items():
    a=agg(d["inss"])
    if a["spend"]<20:continue
    rows.append((a["spend"],f,d["c"],a))
for sp,f,nc,a in sorted(rows,reverse=True):
    P(f"| {f} | {nc} | R$ {a['spend']:,.0f} | {a['purch']} | R$ {a['cpa']:.2f} | R$ {a['cpm']:.2f} | {a['ctr']:.2f}% |")
P("")

# 2. HONDA vs YAMAHA
P("## 2. HONDA vs YAMAHA")
P("")
P("| Modelo | #camp | Invest | Compras | CPA | CPM | CTR |")
P("|---|---:|---:|---:|---:|---:|---:|")
bym=defaultdict(lambda:{"c":0,"inss":[]})
for c in camps:
    m=modelo(c["name"]);bym[m]["c"]+=1;bym[m]["inss"].extend(ic.get(c["id"],[]))
for m,d in sorted(bym.items()):
    a=agg(d["inss"])
    if a["spend"]<20:continue
    P(f"| {m} | {d['c']} | R$ {a['spend']:,.0f} | {a['purch']} | R$ {a['cpa']:.2f} | R$ {a['cpm']:.2f} | {a['ctr']:.2f}% |")
P("")

# 3. CBO vs ABO
P("## 3. CBO vs ABO")
P("")
P("| Tipo | #camp | Invest | Compras | CPA | CTR |")
P("|---|---:|---:|---:|---:|---:|")
byt=defaultdict(lambda:{"c":0,"inss":[]})
for c in camps:
    t=tipo(c["name"]);byt[t]["c"]+=1;byt[t]["inss"].extend(ic.get(c["id"],[]))
for t,d in sorted(byt.items()):
    a=agg(d["inss"])
    if a["spend"]<20:continue
    P(f"| {t} | {d['c']} | R$ {a['spend']:,.0f} | {a['purch']} | R$ {a['cpa']:.2f} | {a['ctr']:.2f}% |")
P("")

# 4. Top campanhas por CPA (com volume)
P("## 4. Campanhas por eficiência (CPA, min 10 compras)")
P("")
P("| Campanha | Invest | Compras | CPA | CPM | CTR | dias |")
P("|---|---:|---:|---:|---:|---:|---:|")
crows=[]
for c in camps:
    a=agg(ic.get(c["id"],[]))
    if a["purch"]<3:continue
    crows.append((a["cpa"] if a["purch"]>=10 else 999,c["name"],a))
for _,nm,a in sorted(crows):
    P(f"| {nm[:42]} | R$ {a['spend']:,.0f} | {a['purch']} | R$ {a['cpa']:.2f} | R$ {a['cpm']:.2f} | {a['ctr']:.2f}% | {a['dias']} |")
P("")

# 5. Top CRIATIVOS (ads) por CPA
P("## 5. Top criativos (ads) — por compras")
P("")
P("| Criativo | Invest | Compras | CPA | CPM | CTR |")
P("|---|---:|---:|---:|---:|---:|")
arows=[]
for aid,info in ia.items():
    a=agg(info["insights"])
    if a["spend"]<30:continue
    arows.append((a["purch"],info["nome"],a))
for p,nm,a in sorted(arows,key=lambda x:-x[0])[:25]:
    P(f"| `{nm[:38]}` | R$ {a['spend']:,.0f} | {p} | R$ {a['cpa']:.2f} | R$ {a['cpm']:.2f} | {a['ctr']:.2f}% |")
P("")

OUT.write_text("\n".join(L))
print(f"OK {OUT} ({len(L)} linhas)")
