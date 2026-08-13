#!/usr/bin/env python3
"""
Cava padroes adicionais usando os dados ja coletados:
- Vida util de criativo (dia que CPM cruza R$10 desde o primeiro dia ativo)
- Dia da semana (CPM seg/ter/.../dom)
- Velocidade de escala (delta % de budget diario vs impacto no CPM no dia seguinte)
- ABO vs CBO (FASE 01 ABO vs FASE 05 CBO)
- Advantage+ vs sem ADV
- Concentracao de budget (top N criativos absorvem X% do gasto)
- Eficiencia por adset
"""
import json, re, statistics
from pathlib import Path
from collections import defaultdict
from datetime import date, datetime, timedelta

BASE = Path(__file__).parent
RAW = BASE / "raw"
OUT = Path("/Users/matheusjardim/claude/Ratos OS/winvision/clientes/prof-caio-pickcius/analise-padroes-adicionais.md")

camps_all = json.loads((RAW / "campanhas.json").read_text())
ins_camps_all = json.loads((RAW / "insights_campanhas.json").read_text())
ads_por_camp = json.loads((RAW / "ads.json").read_text())
ins_ads = json.loads((RAW / "insights_ads.json").read_text())

camps = [c for c in camps_all if "[LEADS]" in c["name"].upper()]
ids_leads = {c["id"] for c in camps}
camp_by_id = {c["id"]: c for c in camps}

def lanc_de(nome):
    if "ANE_JUN_26" in nome: return "JUN"
    if "ANE_MAI_26" in nome: return "MAI"
    return "OUTRO"

def actions_dict(actions):
    return {a.get("action_type",""): float(a.get("value", 0)) for a in (actions or [])}

def leads_de_ins(ins):
    a = actions_dict(ins.get("actions"))
    for k in ("complete_registration","onsite_conversion.lead_grouped","offsite_conversion.fb_pixel_lead","lead"):
        if k in a: return int(a[k])
    return 0

def link_clicks_de_ins(ins):
    a = actions_dict(ins.get("actions"))
    if "link_click" in a: return int(a["link_click"])
    return int(ins.get("inline_link_clicks", 0) or 0)

L = []
def P(*a): L.append(" ".join(str(x) for x in a))

P("# Análise de Padrões Adicionais — Conta do Caio")
P(f"*Gerado em {date.today().isoformat()} | Só campanhas de LEADS | MAI + JUN 26*")
P("")
P("Sequência da análise profunda anterior. Já sabemos:")
P("- CPM é o sinal antecedente do CPL")
P("- Duplicar criativo em 3+ campanhas infla CPM (auto-canibalismo)")
P("- Frequência não satura (sempre <1.10)")
P("- CTR/Connect/Conv. página são estáveis")
P("")
P("Agora cavo padrões adicionais que podem virar regras pro `caio.yaml`.")
P("")

# Insights pelo ad só de campanhas de leads
ins_ads_leads = {aid: info for aid, info in ins_ads.items() if info["campanha_id"] in ids_leads}

# ──────────────────────────────────────────────────────────────
# 1. Vida útil de criativo — quantos dias até CPM cruzar R$10
# ──────────────────────────────────────────────────────────────
P("## 1. Vida útil de criativo — dias até CPM cruzar R$10")
P("")
P("Pra cada ad com >R$300 de gasto, calculo: (a) data do primeiro dia ativo, (b) primeiro dia em que CPM diário cruzou R$10. Mede quanto tempo o criativo dura antes do leilão ficar caro.")
P("")

vida_util = []
for aid, info in ins_ads_leads.items():
    inss = sorted([i for i in info["insights"] if float(i.get("spend") or 0) > 0],
                  key=lambda x: x.get("date_start") or "")
    if not inss: continue
    total_spend = sum(float(i.get("spend") or 0) for i in inss)
    if total_spend < 300: continue
    primeiro = inss[0].get("date_start")
    # Procura o primeiro dia em que CPM cruzou 10 (com pelo menos 100 imp no dia pra evitar ruído)
    cruzou = None
    for ins in inss:
        imp = int(ins.get("impressions") or 0)
        if imp < 200: continue
        cpm = float(ins.get("spend") or 0) / imp * 1000 if imp else 0
        if cpm > 10:
            cruzou = ins.get("date_start"); break
    cnome = camp_by_id.get(info["campanha_id"], {}).get("name", "")
    lanc = lanc_de(cnome)
    if lanc == "OUTRO": continue
    if cruzou:
        d_pri = datetime.fromisoformat(primeiro)
        d_cru = datetime.fromisoformat(cruzou)
        dias = (d_cru - d_pri).days
        vida_util.append({"nome": info["nome_ad"], "lanc": lanc, "primeiro": primeiro, "cruzou": cruzou, "dias": dias, "spend": total_spend})

vida_util.sort(key=lambda x: x["dias"])
P(f"**{len(vida_util)} criativos cruzaram CPM R$10 em algum dia (de {len([1 for _,i in ins_ads_leads.items() if sum(float(x.get('spend') or 0) for x in i['insights'])>300])} com gasto >R$300).**")
P("")
P("| Lanç. | Criativo | 1º dia ativo | Dia que CPM passou R$10 | Dias até furar |")
P("|---|---|---|---|---:|")
for v in vida_util[:25]:
    P(f"| {v['lanc']} | `{v['nome'][:40]}` | {v['primeiro']} | {v['cruzou']} | {v['dias']} |")
P("")

if vida_util:
    medianas = {}
    for lanc in ["MAI", "JUN"]:
        ds = [v["dias"] for v in vida_util if v["lanc"] == lanc]
        if ds:
            medianas[lanc] = (statistics.median(ds), statistics.mean(ds), min(ds), max(ds), len(ds))
    P("**Estatísticas dias até CPM>R$10:**")
    P("")
    for lanc, (med, avg, mn, mx, n) in medianas.items():
        P(f"- {lanc}: mediana **{med:.0f}d**, média {avg:.1f}d, min {mn}d, max {mx}d (n={n})")
    P("")

# ──────────────────────────────────────────────────────────────
# 2. Dia da semana — CPM/CPL por dia
# ──────────────────────────────────────────────────────────────
P("## 2. Comportamento por dia da semana")
P("")
P("Soma todos os ads de LEADS por dia da semana ao longo dos 2 lançamentos.")
P("")

DIAS_PT = ["Seg","Ter","Qua","Qui","Sex","Sab","Dom"]
por_dia_semana = defaultdict(lambda: {"spend":0.0,"imp":0,"clicks":0,"link_clicks":0,"leads":0})

for cid in ids_leads:
    for ins in ins_camps_all.get(cid, []):
        d = ins.get("date_start")
        if not d: continue
        try:
            dt = datetime.fromisoformat(d)
            ds = dt.weekday()
            v = por_dia_semana[ds]
            v["spend"] += float(ins.get("spend") or 0)
            v["imp"] += int(ins.get("impressions") or 0)
            v["clicks"] += int(ins.get("clicks") or 0)
            v["link_clicks"] += link_clicks_de_ins(ins)
            v["leads"] += leads_de_ins(ins)
        except: pass

P("| Dia | Spend | Leads | CPL | CPM | CTR link |")
P("|---|---:|---:|---:|---:|---:|")
for i in range(7):
    v = por_dia_semana[i]
    if v["spend"] == 0: continue
    cpl = v["spend"]/v["leads"] if v["leads"] else 0
    cpm = v["spend"]/v["imp"]*1000 if v["imp"] else 0
    ctr = v["link_clicks"]/v["imp"]*100 if v["imp"] else 0
    P(f"| {DIAS_PT[i]} | R$ {v['spend']:,.0f} | {v['leads']} | R$ {cpl:.2f} | R$ {cpm:.2f} | {ctr:.2f}% |")
P("")

# ──────────────────────────────────────────────────────────────
# 3. ABO vs CBO + Advantage+ vs sem ADV
# ──────────────────────────────────────────────────────────────
P("## 3. ABO vs CBO + Advantage+ vs sem ADV")
P("")

def tipo_camp(nome):
    abo = "_[ABO]_" in nome
    cbo = "_[CBO]_" in nome
    adv = "+ ADV" in nome or "TESTE_ANDROMEDA" in nome
    if abo: return "ABO"
    if cbo and adv: return "CBO+ADV"
    if cbo: return "CBO"
    return "?"

por_tipo = defaultdict(lambda: {"camps":set(),"spend":0.0,"imp":0,"link_clicks":0,"leads":0})
for c in camps:
    lanc = lanc_de(c["name"])
    if lanc == "OUTRO": continue
    t = tipo_camp(c["name"])
    chave = (lanc, t)
    por_tipo[chave]["camps"].add(c["id"])
    for ins in ins_camps_all.get(c["id"], []):
        por_tipo[chave]["spend"] += float(ins.get("spend") or 0)
        por_tipo[chave]["imp"] += int(ins.get("impressions") or 0)
        por_tipo[chave]["link_clicks"] += link_clicks_de_ins(ins)
        por_tipo[chave]["leads"] += leads_de_ins(ins)

P("| Lanç. | Tipo | # camps | Spend | Leads | CPL | CPM | CTR link |")
P("|---|---|---:|---:|---:|---:|---:|---:|")
for (lanc, t), v in sorted(por_tipo.items()):
    if v["spend"] < 100: continue
    cpl = v["spend"]/v["leads"] if v["leads"] else 0
    cpm = v["spend"]/v["imp"]*1000 if v["imp"] else 0
    ctr = v["link_clicks"]/v["imp"]*100 if v["imp"] else 0
    P(f"| {lanc} | {t} | {len(v['camps'])} | R$ {v['spend']:,.0f} | {v['leads']:,} | R$ {cpl:.2f} | R$ {cpm:.2f} | {ctr:.2f}% |")
P("")

# ──────────────────────────────────────────────────────────────
# 4. Concentração de budget — top N% absorve X% spend
# ──────────────────────────────────────────────────────────────
P("## 4. Concentração de budget — distribuição entre criativos")
P("")
P("Pra cada lançamento, ordeno ads por gasto e calculo qual % de ads concentra X% do budget total. Mede se a conta tá apostando muito em poucos criativos.")
P("")

for lanc in ["MAI", "JUN"]:
    ads_lanc = []
    for aid, info in ins_ads_leads.items():
        cid = info["campanha_id"]
        cn = camp_by_id.get(cid, {}).get("name", "")
        if lanc_de(cn) != lanc: continue
        s = sum(float(i.get("spend") or 0) for i in info["insights"])
        if s > 0:
            ads_lanc.append((s, info["nome_ad"]))
    ads_lanc.sort(reverse=True)
    total = sum(s for s,_ in ads_lanc)
    if not total: continue
    P(f"### {lanc} — {len(ads_lanc)} ads ativos, spend total R$ {total:,.0f}")
    P("")
    # Acumulado
    acumulado = 0
    pontos = [25, 50, 75, 90]
    impressos = []
    for i, (s, nm) in enumerate(ads_lanc, 1):
        acumulado += s
        pct = acumulado/total*100
        for p in pontos[:]:
            if pct >= p:
                impressos.append(f"- **{p}%** do spend concentrado em **{i} ads** ({i/len(ads_lanc)*100:.0f}% do total de ads)")
                pontos.remove(p)
    for line in impressos:
        P(line)
    P("")
    P("Top 5 ads:")
    P("")
    for s, nm in ads_lanc[:5]:
        P(f"  - `{nm[:55]}` — R$ {s:,.0f} ({s/total*100:.1f}%)")
    P("")

# ──────────────────────────────────────────────────────────────
# 5. Velocidade de escala — delta diário de spend vs CPM no dia seguinte
# ──────────────────────────────────────────────────────────────
P("## 5. Velocidade de escala — escalar rápido infla CPM no dia seguinte?")
P("")
P("Pra cada lançamento, vejo dia a dia: spend hoje vs spend ontem (delta %). Depois cruzo com CPM diário. Hipótese: subir budget muito rápido (>30% em 1 dia) infla CPM.")
P("")

def curva_diaria_global(lanc):
    por_dia = {}
    for cid in ids_leads:
        cn = camp_by_id.get(cid, {}).get("name", "")
        if lanc_de(cn) != lanc: continue
        for ins in ins_camps_all.get(cid, []):
            d = ins.get("date_start")
            if not d: continue
            v = por_dia.setdefault(d, {"spend":0.0,"imp":0,"leads":0})
            v["spend"] += float(ins.get("spend") or 0)
            v["imp"] += int(ins.get("impressions") or 0)
            v["leads"] += leads_de_ins(ins)
    return por_dia

for lanc in ["MAI", "JUN"]:
    diario = curva_diaria_global(lanc)
    dias = sorted(diario.keys())
    if len(dias) < 3: continue
    P(f"### {lanc}")
    P("")
    P("| Dia | Spend | Δ% spend vs ontem | CPM hoje | CPM amanhã | Δ CPM (próximo dia) |")
    P("|---|---:|---:|---:|---:|---:|")
    for i, d in enumerate(dias):
        v = diario[d]
        if v["spend"] < 100: continue
        cpm = v["spend"]/v["imp"]*1000 if v["imp"] else 0
        if i == 0:
            P(f"| {d} | R$ {v['spend']:,.0f} | — | R$ {cpm:.2f} | — | — |")
            continue
        prev = diario[dias[i-1]]
        delta_spend = (v["spend"] - prev["spend"])/prev["spend"]*100 if prev["spend"] else 0
        cpm_amanha = ""
        delta_cpm = ""
        if i+1 < len(dias):
            v_n = diario[dias[i+1]]
            cpm_n = v_n["spend"]/v_n["imp"]*1000 if v_n["imp"] else 0
            cpm_amanha = f"R$ {cpm_n:.2f}"
            delta_cpm = f"{(cpm_n - cpm)/cpm*100:+.1f}%" if cpm else ""
        marca = "⚠️" if abs(delta_spend) > 30 else ""
        P(f"| {d} | R$ {v['spend']:,.0f} | {marca} {delta_spend:+.0f}% | R$ {cpm:.2f} | {cpm_amanha} | {delta_cpm} |")
    P("")

# ──────────────────────────────────────────────────────────────
# 6. Hora do dia — usar quando coleta_extras terminar (apenas referencia)
# ──────────────────────────────────────────────────────────────
hora_path = RAW / "insights_hora.json"
if hora_path.exists():
    P("## 6. Padrão por hora do dia")
    P("")
    P("Performance agregada por hora do dia (TZ da conta).")
    P("")
    hora_data = json.loads(hora_path.read_text())
    por_hora = defaultdict(lambda: {"spend":0.0,"imp":0,"link_clicks":0,"leads":0})
    for cid, info in hora_data.items():
        if cid not in ids_leads: continue
        for row in info.get("data", []):
            h = row.get("hourly_stats_aggregated_by_advertiser_time_zone")
            if not h: continue
            v = por_hora[h]
            v["spend"] += float(row.get("spend") or 0)
            v["imp"] += int(row.get("impressions") or 0)
            v["link_clicks"] += link_clicks_de_ins(row)
            v["leads"] += leads_de_ins(row)
    P("| Hora | Spend | Leads | CPL | CPM | CTR link |")
    P("|---|---:|---:|---:|---:|---:|")
    for h in sorted(por_hora.keys()):
        v = por_hora[h]
        if v["spend"] < 100: continue
        cpl = v["spend"]/v["leads"] if v["leads"] else 0
        cpm = v["spend"]/v["imp"]*1000 if v["imp"] else 0
        ctr = v["link_clicks"]/v["imp"]*100 if v["imp"] else 0
        P(f"| {h} | R$ {v['spend']:,.0f} | {v['leads']} | R$ {cpl:.2f} | R$ {cpm:.2f} | {ctr:.2f}% |")
    P("")

# ──────────────────────────────────────────────────────────────
# 7. Placement
# ──────────────────────────────────────────────────────────────
place_path = RAW / "insights_placement.json"
if place_path.exists():
    P("## 7. Placement (onde o ad aparece)")
    P("")
    pdata = json.loads(place_path.read_text())
    por_place = defaultdict(lambda: {"spend":0.0,"imp":0,"link_clicks":0,"leads":0})
    for cid, info in pdata.items():
        if cid not in ids_leads: continue
        for row in info.get("data", []):
            plat = row.get("publisher_platform","?")
            pos = row.get("platform_position","?")
            key = f"{plat}/{pos}"
            v = por_place[key]
            v["spend"] += float(row.get("spend") or 0)
            v["imp"] += int(row.get("impressions") or 0)
            v["link_clicks"] += link_clicks_de_ins(row)
            v["leads"] += leads_de_ins(row)
    rows = sorted(por_place.items(), key=lambda x: -x[1]["spend"])
    P("| Placement | Spend | Leads | CPL | CPM | CTR link |")
    P("|---|---:|---:|---:|---:|---:|")
    for p, v in rows:
        if v["spend"] < 100: continue
        cpl = v["spend"]/v["leads"] if v["leads"] else 0
        cpm = v["spend"]/v["imp"]*1000 if v["imp"] else 0
        ctr = v["link_clicks"]/v["imp"]*100 if v["imp"] else 0
        P(f"| {p} | R$ {v['spend']:,.0f} | {v['leads']} | R$ {cpl:.2f} | R$ {cpm:.2f} | {ctr:.2f}% |")
    P("")

# ──────────────────────────────────────────────────────────────
# 8. Age + Gender
# ──────────────────────────────────────────────────────────────
ag_path = RAW / "insights_age_gender.json"
if ag_path.exists():
    P("## 8. Idade + Gênero")
    P("")
    agdata = json.loads(ag_path.read_text())
    por_ag = defaultdict(lambda: {"spend":0.0,"imp":0,"link_clicks":0,"leads":0})
    for cid, info in agdata.items():
        if cid not in ids_leads: continue
        for row in info.get("data", []):
            age = row.get("age","?")
            gen = row.get("gender","?")
            key = f"{age}/{gen}"
            v = por_ag[key]
            v["spend"] += float(row.get("spend") or 0)
            v["imp"] += int(row.get("impressions") or 0)
            v["link_clicks"] += link_clicks_de_ins(row)
            v["leads"] += leads_de_ins(row)
    rows = sorted(por_ag.items(), key=lambda x: -x[1]["spend"])
    P("| Idade/Gênero | Spend | Leads | CPL | CPM | CTR link |")
    P("|---|---:|---:|---:|---:|---:|")
    for p, v in rows:
        if v["spend"] < 100: continue
        cpl = v["spend"]/v["leads"] if v["leads"] else 0
        cpm = v["spend"]/v["imp"]*1000 if v["imp"] else 0
        ctr = v["link_clicks"]/v["imp"]*100 if v["imp"] else 0
        P(f"| {p} | R$ {v['spend']:,.0f} | {v['leads']} | R$ {cpl:.2f} | R$ {cpm:.2f} | {ctr:.2f}% |")
    P("")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(L))
print(f"OK {OUT}")
print(f"{OUT.stat().st_size} bytes / {len(L)} linhas")
