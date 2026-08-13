#!/usr/bin/env python3
"""
Analise profunda lancamento por lancamento (MAI vs JUN).
- Curvas diarias por metrica (CPL, CPM, CTR, link CTR, CPC, freq, connect rate, tx pagina)
- Timeline de duplicacoes (quando cada criativo apareceu em N campanhas)
- Antes/depois de duplicar: o que mudou em cada metrica
- Saturacao via reach + freq ao longo dos dias
- Comparativo global MAI vs JUN

So campanhas de LEADS.
"""
import json, re, statistics
from pathlib import Path
from collections import defaultdict
from datetime import date

BASE = Path(__file__).parent
RAW = BASE / "raw"
OUT = Path("/Users/matheusjardim/claude/Ratos OS/winvision/clientes/prof-caio-pickcius/analise-conta-profunda.md")

camps_all = json.loads((RAW / "campanhas.json").read_text())
ins_camps_all = json.loads((RAW / "insights_campanhas.json").read_text())
ads_por_camp_all = json.loads((RAW / "ads.json").read_text())
ins_ads_all = json.loads((RAW / "insights_ads.json").read_text())

camps = [c for c in camps_all if "[LEADS]" in c["name"].upper()]
ids_leads = {c["id"] for c in camps}
ins_camps = {cid: v for cid, v in ins_camps_all.items() if cid in ids_leads}
ads_por_camp = {cid: v for cid, v in ads_por_camp_all.items() if cid in ids_leads}
ins_ads = {aid: info for aid, info in ins_ads_all.items() if info["campanha_id"] in ids_leads}

def lanc_de(nome):
    if "ANE_JUN_26" in nome: return "JUN"
    if "ANE_MAI_26" in nome: return "MAI"
    return "OUTRO"

def actions_dict(actions):
    return {a.get("action_type",""): float(a.get("value", 0)) for a in (actions or [])}

def leads_de_ins(ins):
    a = actions_dict(ins.get("actions"))
    for k in ("complete_registration","onsite_conversion.lead_grouped","offsite_conversion.fb_pixel_lead","lead"):
        if k in a:
            return int(a[k])
    return 0

def lpv_de_ins(ins):
    a = actions_dict(ins.get("actions"))
    for k in ("landing_page_view","omni_landing_page_view"):
        if k in a:
            return int(a[k])
    return 0

def link_clicks_de_ins(ins):
    a = actions_dict(ins.get("actions"))
    if "link_click" in a:
        return int(a["link_click"])
    return int(ins.get("inline_link_clicks", 0) or 0)

L = []
def P(*args): L.append(" ".join(str(a) for a in args))

P("# Análise Profunda — Comportamento da conta do Caio (lançamento a lançamento)")
P(f"*Gerado em {date.today().isoformat()} | Só campanhas de LEADS | ANE_MAI_26 (21/04–07/05) vs ANE_JUN_26 (18/05–em curso)*")
P("")
P("Pergunta que essa análise responde: **conforme o lançamento avança e a gente repete criativo/duplica, o que acontece com CPL, CPM, CTR, CPC, frequência e conversão da página?**")
P("")

# ──────────────────────────────────────────────────────────────
# 1. Curva diária global por lançamento (todas as métricas)
# ──────────────────────────────────────────────────────────────
def curva_diaria(lanc, source):
    """Soma por dia através de todos os ads/campanhas do lançamento."""
    por_dia = defaultdict(lambda: {"spend":0.0, "imp":0, "clicks":0, "link_clicks":0,
                                     "lpv":0, "leads":0, "reach":0, "freq_sum":0.0,
                                     "n_ads_freq":0})
    for ins in source:
        d = ins.get("date_start")
        if not d: continue
        v = por_dia[d]
        v["spend"] += float(ins.get("spend") or 0)
        v["imp"] += int(ins.get("impressions") or 0)
        v["clicks"] += int(ins.get("clicks") or 0)
        v["link_clicks"] += link_clicks_de_ins(ins)
        v["lpv"] += lpv_de_ins(ins)
        v["leads"] += leads_de_ins(ins)
        v["reach"] += int(ins.get("reach") or 0)
        if ins.get("frequency"):
            try:
                v["freq_sum"] += float(ins["frequency"])
                v["n_ads_freq"] += 1
            except: pass
    return por_dia

# Curva por insights de CAMPANHA (mais confiavel pra impressions/reach unicos)
def curva_lanc(lanc):
    cs = [c for c in camps if lanc_de(c["name"]) == lanc]
    todos = []
    for c in cs:
        todos.extend(ins_camps.get(c["id"], []))
    return curva_diaria(lanc, todos)

curva_mai = curva_lanc("MAI")
curva_jun = curva_lanc("JUN")

def fmt(v, casa=2):
    if v is None: return "—"
    return f"{v:.{casa}f}"

def linha_metricas(v):
    spend = v["spend"]; imp = v["imp"]; lc = v["link_clicks"]; lpv = v["lpv"]; leads = v["leads"]; clicks=v["clicks"]
    cpl = spend/leads if leads else None
    cpm = spend/imp*1000 if imp else None
    ctr = clicks/imp*100 if imp else None
    ctr_link = lc/imp*100 if imp else None
    cpc_link = spend/lc if lc else None
    connect = lpv/lc*100 if lc else None
    tx_pagina = leads/lpv*100 if lpv else None
    freq_avg = v["freq_sum"]/v["n_ads_freq"] if v["n_ads_freq"] else None
    return {
        "spend": spend, "imp": imp, "leads": leads, "lpv": lpv, "link_clicks": lc,
        "cpl": cpl, "cpm": cpm, "ctr": ctr, "ctr_link": ctr_link, "cpc_link": cpc_link,
        "connect": connect, "tx_pagina": tx_pagina, "freq": freq_avg,
    }

P("## 1. Curva diária — MAI_26 (21/04 → 07/05)")
P("")
P("| Dia | # | Spend | Leads | CPL | CPM | CTR all | CTR link | CPC link | Connect % | Conv pág % |")
P("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
mai_dias = sorted(curva_mai.keys())
for i, d in enumerate(mai_dias, 1):
    m = linha_metricas(curva_mai[d])
    if m["spend"] < 100: continue
    P(f"| {d} | {i} | R$ {m['spend']:,.0f} | {m['leads']} | R$ {fmt(m['cpl'])} | R$ {fmt(m['cpm'])} | {fmt(m['ctr'])}% | {fmt(m['ctr_link'])}% | R$ {fmt(m['cpc_link'])} | {fmt(m['connect'],1)}% | {fmt(m['tx_pagina'],2)}% |")
P("")

P("## 2. Curva diária — JUN_26 (18/05 → em curso)")
P("")
P("| Dia | # | Spend | Leads | CPL | CPM | CTR all | CTR link | CPC link | Connect % | Conv pág % |")
P("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
jun_dias = sorted(curva_jun.keys())
for i, d in enumerate(jun_dias, 1):
    m = linha_metricas(curva_jun[d])
    if m["spend"] < 100: continue
    P(f"| {d} | {i} | R$ {m['spend']:,.0f} | {m['leads']} | R$ {fmt(m['cpl'])} | R$ {fmt(m['cpm'])} | {fmt(m['ctr'])}% | {fmt(m['ctr_link'])}% | R$ {fmt(m['cpc_link'])} | {fmt(m['connect'],1)}% | {fmt(m['tx_pagina'],2)}% |")
P("")

# ──────────────────────────────────────────────────────────────
# 3. Comparativo agregado MAI vs JUN
# ──────────────────────────────────────────────────────────────
def agreg_lanc(curva):
    total = {"spend":0.0, "imp":0, "clicks":0, "link_clicks":0, "lpv":0, "leads":0, "reach":0, "freq_sum":0.0, "n_ads_freq":0}
    for d, v in curva.items():
        for k in total:
            total[k] += v[k]
    return linha_metricas(total)

ag_mai = agreg_lanc(curva_mai)
ag_jun = agreg_lanc(curva_jun)

P("## 3. Comparativo agregado MAI vs JUN")
P("")
P("| Métrica | MAI | JUN | Δ | Variação |")
P("|---|---:|---:|---:|---|")
def delta_pct(a, b):
    if a is None or b is None or a == 0: return ""
    return f"{(b-a)/a*100:+.1f}%"
for label, k, casa, prefix, sufixo, comp in [
    ("Spend total", "spend", 0, "R$ ", "", "↑"),
    ("Leads", "leads", 0, "", "", "↑"),
    ("Impressions", "imp", 0, "", "", ""),
    ("CPL", "cpl", 2, "R$ ", "", "↓"),
    ("CPM", "cpm", 2, "R$ ", "", "↓"),
    ("CTR (all)", "ctr", 2, "", "%", "↑"),
    ("CTR link", "ctr_link", 2, "", "%", "↑"),
    ("CPC link", "cpc_link", 2, "R$ ", "", "↓"),
    ("Connect rate (LPV/LC)", "connect", 1, "", "%", "↑"),
    ("Conv. página (lead/LPV)", "tx_pagina", 2, "", "%", "↑"),
]:
    a = ag_mai.get(k); b = ag_jun.get(k)
    if a is None and b is None: continue
    sa = f"{prefix}{fmt(a, casa)}{sufixo}" if a is not None else "—"
    sb = f"{prefix}{fmt(b, casa)}{sufixo}" if b is not None else "—"
    d = (b - a) if (a is not None and b is not None) else None
    sd = f"{d:+.2f}" if d is not None else ""
    pct = delta_pct(a, b)
    P(f"| {label} {comp} melhor | {sa} | {sb} | {sd} | {pct} |")
P("")

# ──────────────────────────────────────────────────────────────
# 4. Timeline de duplicações (quando criativo entrou em mais campanhas)
# ──────────────────────────────────────────────────────────────
P("## 4. Timeline de duplicações — quando cada criativo passou a rodar em N campanhas")
P("")
P("Pra cada criativo (nome de ad), conto em quantas campanhas distintas ele estava ativo em cada dia. Foco em criativos com >2 cópias e gasto significativo.")
P("")

# Para cada nome de ad, para cada dia, conta campanhas distintas com gasto >0
# Mapeia: nome -> dia -> set de campanhas com gasto naquele dia
nome_dia_camps = defaultdict(lambda: defaultdict(set))
nome_dia_metrics = defaultdict(lambda: defaultdict(lambda: {"spend":0.0,"imp":0,"link_clicks":0,"lpv":0,"leads":0,"freq_sum":0.0,"n_ins":0}))

for aid, info in ins_ads.items():
    nome = info["nome_ad"]
    cid = info["campanha_id"]
    for ins in info["insights"]:
        d = ins.get("date_start")
        sp = float(ins.get("spend") or 0)
        if not d or sp <= 0: continue
        nome_dia_camps[nome][d].add(cid)
        m = nome_dia_metrics[nome][d]
        m["spend"] += sp
        m["imp"] += int(ins.get("impressions") or 0)
        m["link_clicks"] += link_clicks_de_ins(ins)
        m["lpv"] += lpv_de_ins(ins)
        m["leads"] += leads_de_ins(ins)
        if ins.get("frequency"):
            try:
                m["freq_sum"] += float(ins["frequency"])
                m["n_ins"] += 1
            except: pass

# Para identificar duplicações: criativos com >2 campanhas em algum dia e gasto agregado >R$500
candidatos = []
for nome, dias in nome_dia_camps.items():
    max_camps = max(len(s) for s in dias.values())
    if max_camps < 2: continue
    spend_total = sum(nome_dia_metrics[nome][d]["spend"] for d in dias)
    if spend_total < 500: continue
    candidatos.append((spend_total, nome, max_camps))
candidatos.sort(reverse=True)

# Pega top 5 criativos pra fazer o "antes vs depois da duplicação"
P(f"**{len(candidatos)} criativos passaram por duplicação (>2 campanhas em algum dia) com spend total >R$500. Analiso os top 6.**")
P("")

def detect_evento_duplicacao(nome):
    """Retorna o primeiro dia em que o criativo passou a estar em N>=2 campanhas (após estar em 1)."""
    dias = sorted(nome_dia_camps[nome].keys())
    if not dias: return None
    n_prev = 1
    for d in dias:
        n = len(nome_dia_camps[nome][d])
        if n_prev < 2 and n >= 2:
            return d
        n_prev = max(n_prev, n)
    return None

P("### 4.1 Para cada criativo: dia da duplicação + CPL/CPM/CTR antes vs depois")
P("")
P("| Criativo | Dia que duplicou | # camps antes → depois | CPL antes | CPL depois | Δ | CPM antes | CPM depois | Δ | CTR link antes | CTR link depois |")
P("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
for _, nome, max_camps in candidatos[:8]:
    dia_dup = detect_evento_duplicacao(nome)
    if not dia_dup: continue
    dias = sorted(nome_dia_camps[nome].keys())
    antes = [d for d in dias if d < dia_dup]
    depois = [d for d in dias if d >= dia_dup]
    if not antes or not depois: continue
    def agg(lista_dias):
        a = {"spend":0.0,"imp":0,"link_clicks":0,"lpv":0,"leads":0}
        for d in lista_dias:
            m = nome_dia_metrics[nome][d]
            a["spend"] += m["spend"]; a["imp"] += m["imp"]; a["link_clicks"] += m["link_clicks"]
            a["lpv"] += m["lpv"]; a["leads"] += m["leads"]
        return a
    aa = agg(antes); ad = agg(depois)
    cpl_a = aa["spend"]/aa["leads"] if aa["leads"] else None
    cpl_d = ad["spend"]/ad["leads"] if ad["leads"] else None
    cpm_a = aa["spend"]/aa["imp"]*1000 if aa["imp"] else None
    cpm_d = ad["spend"]/ad["imp"]*1000 if ad["imp"] else None
    ctrl_a = aa["link_clicks"]/aa["imp"]*100 if aa["imp"] else None
    ctrl_d = ad["link_clicks"]/ad["imp"]*100 if ad["imp"] else None
    n_antes = len(nome_dia_camps[nome][antes[-1]]) if antes else 1
    n_depois = max(len(nome_dia_camps[nome][d]) for d in depois)
    d_cpl = f"{(cpl_d-cpl_a):+.2f}" if cpl_a and cpl_d else "—"
    d_cpm = f"{(cpm_d-cpm_a):+.2f}" if cpm_a and cpm_d else "—"
    P(f"| `{nome[:35]}` | {dia_dup} | {n_antes} → {n_depois} | R$ {fmt(cpl_a)} | R$ {fmt(cpl_d)} | {d_cpl} | R$ {fmt(cpm_a)} | R$ {fmt(cpm_d)} | {d_cpm} | {fmt(ctrl_a)}% | {fmt(ctrl_d)}% |")
P("")

# ──────────────────────────────────────────────────────────────
# 5. Curva semanal — CPL/CPM/CTR ao longo do tempo dentro do mesmo lançamento
# ──────────────────────────────────────────────────────────────
P("## 5. Comportamento por semana dentro de cada lançamento")
P("")
def por_semana(curva, dia_zero):
    from datetime import date as Dt
    y0,m0,dd0 = map(int, dia_zero.split("-"))
    d0 = Dt(y0,m0,dd0)
    semanas = defaultdict(lambda: {"spend":0.0,"imp":0,"clicks":0,"link_clicks":0,"lpv":0,"leads":0,"reach":0,"freq_sum":0.0,"n_ads_freq":0})
    for d, v in curva.items():
        y,m,dd = map(int, d.split("-"))
        dD = Dt(y,m,dd)
        sem = (dD - d0).days // 7 + 1
        if sem < 1: sem = 1
        for k in semanas[sem]:
            semanas[sem][k] += v[k]
    return semanas

semanas_mai = por_semana(curva_mai, "2026-04-21")
semanas_jun = por_semana(curva_jun, "2026-05-18")

for label, semanas in [("MAI (semana 1 = 21–27/abr)", semanas_mai), ("JUN (semana 1 = 18–24/mai)", semanas_jun)]:
    P(f"### {label}")
    P("")
    P("| Semana | Spend | Leads | CPL | CPM | CTR link | CPC link | Connect % | Conv pág % |")
    P("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for sem in sorted(semanas.keys()):
        m = linha_metricas(semanas[sem])
        if m["spend"] < 100: continue
        P(f"| sem {sem} | R$ {m['spend']:,.0f} | {m['leads']} | R$ {fmt(m['cpl'])} | R$ {fmt(m['cpm'])} | {fmt(m['ctr_link'])}% | R$ {fmt(m['cpc_link'])} | {fmt(m['connect'],1)}% | {fmt(m['tx_pagina'],2)}% |")
    P("")

# ──────────────────────────────────────────────────────────────
# 6. Saturação: frequência média ao longo do lançamento
# ──────────────────────────────────────────────────────────────
P("## 6. Sinais de saturação — frequência média por dia (ads ativos)")
P("")
P("Frequência média ponderada por impressions: indica quantas vezes em média o mesmo usuário viu um ad. Acima de 2,0 começa a saturar.")
P("")
for lanc, curva in [("MAI", curva_mai), ("JUN", curva_jun)]:
    P(f"### {lanc}")
    P("")
    P("| Dia | Spend | Reach acumulado dia | Impressions | Freq (imp/reach) |")
    P("|---|---:|---:|---:|---:|")
    for d in sorted(curva.keys()):
        v = curva[d]
        if v["spend"] < 100: continue
        freq_calc = v["imp"]/v["reach"] if v["reach"] else None
        P(f"| {d} | R$ {v['spend']:,.0f} | {v['reach']:,} | {v['imp']:,} | {fmt(freq_calc, 2)} |")
    P("")

# ──────────────────────────────────────────────────────────────
# 7. Conclusões automáticas
# ──────────────────────────────────────────────────────────────
P("## 7. Leitura automatizada dos números")
P("")
# CPL inflou ao longo de cada lançamento?
def tendencia(curva, dias_corte=None):
    dias = sorted(curva.keys())
    if dias_corte:
        dias = dias[:dias_corte]
    pri = [linha_metricas(curva[d]) for d in dias[:len(dias)//2]]
    seg = [linha_metricas(curva[d]) for d in dias[len(dias)//2:]]
    def avg(arr, k):
        vals = [x[k] for x in arr if x[k] is not None]
        return sum(vals)/len(vals) if vals else None
    return {k: (avg(pri, k), avg(seg, k)) for k in ["cpl","cpm","ctr_link","cpc_link","connect","tx_pagina"]}

td_mai = tendencia(curva_mai)
td_jun = tendencia(curva_jun)

P("### Primeira metade vs segunda metade do lançamento")
P("")
P("| Lanç. | Métrica | 1ª metade | 2ª metade | Variação |")
P("|---|---|---:|---:|---|")
for lanc, td in [("MAI", td_mai), ("JUN", td_jun)]:
    for label, k in [("CPL","cpl"),("CPM","cpm"),("CTR link","ctr_link"),("CPC link","cpc_link"),("Connect","connect"),("Conv pág","tx_pagina")]:
        a,b = td[k]
        if a is None or b is None: continue
        pct = (b-a)/a*100 if a else 0
        arrow = "🔴" if (k in ("cpl","cpm","cpc_link") and pct>5) or (k in ("ctr_link","connect","tx_pagina") and pct<-5) else ("🟢" if (k in ("cpl","cpm","cpc_link") and pct<-5) or (k in ("ctr_link","connect","tx_pagina") and pct>5) else "⚪")
        P(f"| {lanc} | {label} | {fmt(a,2)} | {fmt(b,2)} | {arrow} {pct:+.1f}% |")
P("")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(L))
print(f"OK Relatorio profundo salvo em {OUT}")
print(f"Tamanho: {OUT.stat().st_size} bytes / {len(L)} linhas")
