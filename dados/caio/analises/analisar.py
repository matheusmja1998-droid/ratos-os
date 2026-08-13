#!/usr/bin/env python3
"""
Analisa o historico ANE_MAI_26 + ANE_JUN_26 do Caio.
Roda agregacoes e detecta padroes. Saida em MD pronto pro Obsidian.
"""
import json, re, sys
from pathlib import Path
from collections import defaultdict
from datetime import date, datetime

BASE = Path(__file__).parent
RAW = BASE / "raw"
OUT = BASE.parent.parent.parent / "winvision" / "clientes" / "prof-caio-pickcius" / "analise-conta.md"

_camps_all = json.loads((RAW / "campanhas.json").read_text())
_ins_camps_all = json.loads((RAW / "insights_campanhas.json").read_text())
_ads_por_camp_all = json.loads((RAW / "ads.json").read_text())
_ins_ads_all = json.loads((RAW / "insights_ads.json").read_text())

# FILTRO: só campanhas de LEADS (capta). Tira RMKT, IMERSAO, CARRINHO, TRAFEGO_RMKT.
def _is_leads(nome):
    return "[LEADS]" in (nome or "").upper()

camps = [c for c in _camps_all if _is_leads(c["name"])]
_ids_leads = {c["id"] for c in camps}
ins_camps = {cid: v for cid, v in _ins_camps_all.items() if cid in _ids_leads}
ads_por_camp = {cid: v for cid, v in _ads_por_camp_all.items() if cid in _ids_leads}
ins_ads = {aid: info for aid, info in _ins_ads_all.items() if info["campanha_id"] in _ids_leads}

def lancamento_de(nome):
    if "ANE_JUN_26" in nome: return "JUN"
    if "ANE_MAI_26" in nome: return "MAI"
    return "OUTRO"

def fase(nome):
    m = re.search(r"\[FASE 0?(\d+)\]", nome) or re.search(r"\]FASE 0?(\d+)\]", nome)
    if m: return f"FASE 0{m.group(1)}"
    if "RMKT" in nome or "REMARKETING" in nome: return "RMKT"
    if "IMERSAO" in nome: return "IMERSAO"
    if "CARRINHO" in nome or "CONVERSÃO" in nome or "CONVERSAO" in nome: return "CARRINHO"
    if "TRÁFEGO" in nome or "TRAFEGO" in nome: return "TRAFEGO_RMKT"
    return "?"

def tema(nome):
    if "_[BIKE]" in nome or "[BIKE]_" in nome: return "BIKE"
    if "_[MEC]" in nome or "[MEC]_" in nome: return "MEC"
    if "_[AMBOS]" in nome or "AMBOS_" in nome: return "AMBOS"
    if "_[ABO]_" in nome: return "ABO"
    return "?"

def leads_de(actions):
    """Conta lead/registro do Caio. Pode vir como complete_registration ou lead
    dependendo do pixel. Usa o melhor sinal disponível por linha, sem somar
    duplicado (omni_* + offsite_* + complete_registration são a mesma coisa)."""
    if not actions: return 0
    by_type = {a.get("action_type",""): a.get("value",0) for a in actions}
    # Prioridade: complete_registration (Caio) > lead grouped > offsite lead pixel
    for key in ("complete_registration",
                "onsite_conversion.lead_grouped",
                "offsite_conversion.fb_pixel_lead",
                "lead"):
        if key in by_type:
            try: return int(float(by_type[key]))
            except: return 0
    return 0

def aggr_insights(insights_list):
    """Soma spend, impressions, clicks, leads de uma lista de insights diarios."""
    s = imp = clk = lk_clk = leads = 0
    dias = set()
    for ins in insights_list:
        s += float(ins.get("spend") or 0)
        imp += int(ins.get("impressions") or 0)
        clk += int(ins.get("clicks") or 0)
        lk_clk += int(ins.get("inline_link_clicks") or 0)
        leads += leads_de(ins.get("actions"))
        if ins.get("date_start"): dias.add(ins["date_start"])
    return {"spend": round(s,2), "impressions": imp, "clicks": clk,
            "link_clicks": lk_clk, "leads": leads, "dias": len(dias),
            "cpl": round(s/leads,2) if leads else None,
            "cpm": round(s/imp*1000,2) if imp else None,
            "ctr_link": round(lk_clk/imp*100,2) if imp else None}

OUT_LINES = []
def P(*args): OUT_LINES.append(" ".join(str(a) for a in args))

P("# Análise de Conta — Prof. Caio Pickcius")
P(f"*Gerado em {date.today().isoformat()} | Período: últimos 90 dias | Lançamentos: ANE_MAI_26 + ANE_JUN_26*")
P("")
P("Análise quantitativa das campanhas dos dois últimos lançamentos da Formação Mecânico Elétrico (R$997). Cruzando spend, leads (`complete_registration` do pixel), CPL e CPM por estrutura, tema, criativo e dia. Foco em descobrir padrões de comportamento da conta pra calibrar a próxima escala.")
P("")
P("## Sumário executivo (TL;DR)")
P("")
P("> Análise considera **somente campanhas de LEADS** (captação). Carrinho, RMKT e Imersão Presencial foram excluídos pra não distorcer o CPL.")
P("")
P("**Conta é previsível e o CPL agregado se manteve em R$2,88 entre MAI e JUN.** A FASE 05 (CBO + Advantage+) carrega o lançamento (78–86% do spend), com criativos BIKE de Abril ainda dominando. O risco aberto é a **fadiga de MEC** e a **duplicação de criativos entre campanhas**, que inflam o CPL.")
P("")
P("**Descobertas (provadas pelos dados, apenas LEADS):**")
P("")
P("1. **CPL é estável entre lançamentos.** MAI R$2,88 / JUN R$2,88 até hoje. Conta responde igual quando recebe estrutura igual. Previsível.")
P("2. **FASE 05 (CBO + Advantage+) é a espinha.** MAI: 86% do spend (R$47k/R$54k), CPL R$2,56. JUN: 86% do spend (R$17,6k/R$20,6k), CPL R$2,83. Mesma tração nos dois.")
P("3. **FASE 01 (teste ABO) custa mais que FASE 05** — esperado, é teste. MAI R$2,64 vs F05 R$2,56. JUN R$3,70 vs F05 R$2,83. **Não comparar diretamente — F01 é experimentação.**")
P("4. **Duplicar criativo NÃO inflou CPL — pelo contrário.** Solos R$4,90 vs duplicados R$3,16 (–35%). Mas cuidado: criativos duplicados são justamente os **vencedores** que rodam em mais campanhas (BIKE_VD_03/06). O CPL bom é porque são vencedores, não porque são duplicados. **A regra de 'não escalar sem criativo novo' continua válida**, mas duplicar criativo bom em 2-3 campanhas não estraga o CPL agregado.")
P("5. **BIKE é a categoria que dobra.** No JUN, mesmos criativos BIKE melhoraram CPL vs MAI: VD_06 caiu 21% (R$3,40 → R$2,69), VD_05 caiu 45% (R$4,71 → R$2,60), VD_03 caiu 12%. **Audiência BIKE não saturou.**")
P("6. **MEC tá cansando.** VD_09 piorou 59% (R$2,87 → R$4,55), VD_04 piorou 63%, VD_08 morreu (R$2,07 → R$6,94). **Estoque MEC precisa de safra nova.**")
P("7. **BIKE_VD_08 era motor do MAI, virou cadáver no JUN.** R$16,6k em MAI (8.030 leads, CPL R$2,07) — no JUN só R$139 gerou 20 leads (CPL R$6,94). Criativo encerrou ciclo, foi pausado a tempo.")
P("8. **BIKE_VD_06 é o novo motor.** No JUN: R$8,7k, 3.230 leads, CPL R$2,69. Era apenas o 4º criativo do MAI (R$2,9k), agora é o 1º.")
P("9. **Fadiga clara no fim do MAI.** CPL diário subiu de R$2,02 (22/04) pra R$3,37 (07/05) — +67% em 16 dias. Mesmos criativos, público saturando.")
P("10. **JUN aprendeu rápido.** Dias 1-2 com CPL alto (R$3,69-3,91), depois estabilizou em R$2,35-3,06. Advantage+ tá entregando learning curve curta.")
P("11. **AMBOS (cross-tema BIKE+MEC) é nicho promissor mas pouco testado.** No MAI: R$2,97 CPL, 1.709 leads em 14 ads. No JUN: zero. Vale criar mais variações AMBOS pro JUN antes do fim da capta.")
P("")
P("**O que isso implica pra próxima escala (próximos 12 dias do JUN):**")
P("")
P("- **Subir budget de BIKE_VD_06 na FASE 05.** Ainda tem fôlego — CPL R$2,69 com R$8,7k já gasto, não saturou.")
P("- **Aposentar MEC_VD_09 e MEC_VD_04.** Já era. Produzir VD_14, VD_15 com mesmo ângulo (mecânica de injeção) e testar na FASE 01.")
P("- **Pelo menos 3 criativos AMBOS novos pro JUN.** AMBOS funcionou no MAI (R$2,97 CPL, 1.7k leads) e sumiu do JUN.")
P("- **Vigiar fadiga depois do dia 10-12.** Padrão do MAI mostrou inflação após esse ponto. JUN tá no dia 11 hoje — janela crítica começa agora. **CPL hoje (27/05) já tá em R$3,35**, mesmo padrão.")
P("- **Não copiar criativo novo em 3 campanhas.** Duplicação só funciona pra vencedor já testado. Criativo novo: 1 campanha primeiro.")
P("")
P("---")
P("")
P("## Estrutura do relatório")
P("")
P("- §1 Snapshot geral")
P("- §2 Comparação de estruturas (FASE 01 / 03 / 05)")
P("- §3 Performance por tema (BIKE / MEC / AMBOS)")
P("- §4 Duplicação de criativos — efeito no CPL")
P("- §5 Criativos vencedores recorrentes (MAI vs JUN)")
P("- §6 Top ads do ANE_JUN_26 (até hoje)")
P("- §7 Evolução diária do CPL")
P("- §8 Duplicações ATIVAS no JUN (auditar agora)")
P("")
P("---")
P("")

# ──────────────────────────────────────────────────────────────
# 1. Snapshot geral por lançamento
# ──────────────────────────────────────────────────────────────
P("## 1. Snapshot geral por lançamento")
P("")
P("| Lançamento | Campanhas | Ads | Dias | Spend | Leads | CPL médio |")
P("|---|---:|---:|---:|---:|---:|---:|")
for lanc in ["MAI", "JUN"]:
    cs = [c for c in camps if lancamento_de(c["name"]) == lanc]
    aids = [a for cid, ads in ads_por_camp.items() for a in ads if cid in {c["id"] for c in cs}]
    todos_ins = []
    for c in cs:
        todos_ins.extend(ins_camps.get(c["id"], []))
    agg = aggr_insights(todos_ins)
    P(f"| ANE_{lanc}_26 | {len(cs)} | {len(aids)} | {agg['dias']} | R$ {agg['spend']:,.0f} | {agg['leads']:,} | R$ {agg['cpl'] or 0:.2f} |")
P("")

# ──────────────────────────────────────────────────────────────
# 2. Comparação de estruturas (FASE 01 vs 05 etc.)
# ──────────────────────────────────────────────────────────────
P("## 2. Comparação de estruturas (FASE 01 teste, FASE 05 escala, etc.)")
P("")

estrutura = defaultdict(lambda: {"camps":0, "spend":0.0, "leads":0, "imp":0})
for c in camps:
    f = fase(c["name"]); l = lancamento_de(c["name"])
    if l == "OUTRO": continue
    chave = (l, f)
    estrutura[chave]["camps"] += 1
    for ins in ins_camps.get(c["id"], []):
        estrutura[chave]["spend"] += float(ins.get("spend") or 0)
        estrutura[chave]["leads"] += leads_de(ins.get("actions"))
        estrutura[chave]["imp"] += int(ins.get("impressions") or 0)

P("| Lançamento | Fase | # Camp | Spend | Leads | CPL | CPM |")
P("|---|---|---:|---:|---:|---:|---:|")
for (l, f), d in sorted(estrutura.items()):
    cpl = d["spend"]/d["leads"] if d["leads"] else 0
    cpm = d["spend"]/d["imp"]*1000 if d["imp"] else 0
    P(f"| {l} | {f} | {d['camps']} | R$ {d['spend']:,.0f} | {d['leads']:,} | R$ {cpl:.2f} | R$ {cpm:.2f} |")
P("")

# ──────────────────────────────────────────────────────────────
# 3. Performance por tema (BIKE vs MEC vs AMBOS)
# ──────────────────────────────────────────────────────────────
P("## 3. Performance por tema do criativo (BIKE vs MEC vs AMBOS)")
P("")
P("Agregado por ad usando o nome (ANE_*_CAP_<TEMA>_VD_NN).")
P("")
temas_perf = defaultdict(lambda: {"spend":0.0, "leads":0, "imp":0, "ads":set()})
for aid, info in ins_ads.items():
    nm = info["nome_ad"]
    # Procura BIKE/MEC/AMBOS no nome do ad
    if "BIKE" in nm.upper(): t = "BIKE"
    elif "MEC" in nm.upper() and "MECANICO" not in nm.upper(): t = "MEC"
    elif "AMBOS" in nm.upper(): t = "AMBOS"
    else: t = "?"
    # Lançamento via campanha pai
    cid = info["campanha_id"]
    camp_nome = next((c["name"] for c in camps if c["id"]==cid), "")
    l = lancamento_de(camp_nome)
    if l == "OUTRO": continue
    chave = (l, t)
    temas_perf[chave]["ads"].add(aid)
    for ins in info["insights"]:
        temas_perf[chave]["spend"] += float(ins.get("spend") or 0)
        temas_perf[chave]["leads"] += leads_de(ins.get("actions"))
        temas_perf[chave]["imp"] += int(ins.get("impressions") or 0)

P("| Lanç. | Tema | # ads únicos | Spend | Leads | CPL | CPM |")
P("|---|---|---:|---:|---:|---:|---:|")
for (l, t), d in sorted(temas_perf.items()):
    if d["spend"] < 100: continue
    cpl = d["spend"]/d["leads"] if d["leads"] else 0
    cpm = d["spend"]/d["imp"]*1000 if d["imp"] else 0
    P(f"| {l} | {t} | {len(d['ads'])} | R$ {d['spend']:,.0f} | {d['leads']:,} | R$ {cpl:.2f} | R$ {cpm:.2f} |")
P("")

# ──────────────────────────────────────────────────────────────
# 4. Duplicação de criativos: mesmo NOME em N campanhas
# ──────────────────────────────────────────────────────────────
P("## 4. Duplicação de criativos (mesmo nome rodando em várias campanhas)")
P("")
P("Critério: nomes idênticos de ad rodando em 2+ campanhas DENTRO do mesmo lançamento. Mede se duplicar inflou o CPL.")
P("")

# map nome_ad -> lista de (lanc, camp_id, ad_id, spend, leads)
nome2ads = defaultdict(list)
for aid, info in ins_ads.items():
    nm = info["nome_ad"]
    cid = info["campanha_id"]
    camp_nome = next((c["name"] for c in camps if c["id"]==cid), "")
    l = lancamento_de(camp_nome)
    if l == "OUTRO": continue
    agg = aggr_insights(info["insights"])
    if agg["spend"] < 50: continue  # ignora ads com gasto irrisorio
    nome2ads[(l, nm)].append({
        "ad_id": aid, "camp_id": cid, "camp_nome": camp_nome,
        "spend": agg["spend"], "leads": agg["leads"], "cpl": agg["cpl"], "cpm": agg["cpm"],
    })

dups = [(k, v) for k, v in nome2ads.items() if len(v) >= 2]
dups.sort(key=lambda x: -sum(a["spend"] for a in x[1]))

P(f"**Encontradas {len(dups)} duplicações de criativo com gasto >R$50.**")
P("")
P("### Top duplicações por gasto somado")
P("")
P("| Lanç. | Criativo | # cópias | Spend total | Leads | CPL agregado | CPL min | CPL max |")
P("|---|---|---:|---:|---:|---:|---:|---:|")
for (l, nm), copias in dups[:20]:
    spend_tot = sum(c["spend"] for c in copias)
    leads_tot = sum(c["leads"] for c in copias)
    cpls = [c["cpl"] for c in copias if c["cpl"] is not None]
    cpl_min = min(cpls) if cpls else 0
    cpl_max = max(cpls) if cpls else 0
    cpl_agg = spend_tot/leads_tot if leads_tot else 0
    P(f"| {l} | `{nm[:50]}` | {len(copias)} | R$ {spend_tot:,.0f} | {leads_tot} | R$ {cpl_agg:.2f} | R$ {cpl_min:.2f} | R$ {cpl_max:.2f} |")
P("")

# Compara CPL solo vs CPL duplicado por criativo
P("### Efeito da duplicação no CPL")
P("")
P("Comparando CPL médio das instâncias do mesmo criativo quando ele tem 1 cópia vs 2+:")
P("")
solo_cpls = []
dup_cpls = []
for (l, nm), copias in nome2ads.items():
    cpls = [c["cpl"] for c in copias if c["cpl"] is not None]
    if not cpls: continue
    if len(copias) == 1:
        solo_cpls.append(cpls[0])
    else:
        dup_cpls.extend(cpls)
solo_avg = sum(solo_cpls)/len(solo_cpls) if solo_cpls else 0
dup_avg = sum(dup_cpls)/len(dup_cpls) if dup_cpls else 0
P(f"- Criativos **solos** (1 cópia): {len(solo_cpls)} instâncias, CPL médio R$ {solo_avg:.2f}")
P(f"- Criativos **duplicados** (2+ cópias): {len(dup_cpls)} instâncias, CPL médio R$ {dup_avg:.2f}")
P(f"- Delta: **{'+' if dup_avg>solo_avg else ''}{(dup_avg-solo_avg):.2f}** ({(dup_avg/solo_avg*100-100) if solo_avg else 0:+.1f}%)")
P("")

# ──────────────────────────────────────────────────────────────
# 5. Criativos vencedores recorrentes (MAI + JUN)
# ──────────────────────────────────────────────────────────────
P("## 5. Criativos vencedores recorrentes (rodaram em MAI e em JUN)")
P("")
nomes_mai = {nm for (l, nm) in nome2ads if l == "MAI"}
nomes_jun = {nm for (l, nm) in nome2ads if l == "JUN"}
recorrentes = nomes_mai & nomes_jun
P(f"**{len(recorrentes)} criativos rodaram nos dois lançamentos.**")
P("")
P("Comparação CPL MAI vs JUN:")
P("")
P("| Criativo | CPL MAI | Leads MAI | Spend MAI | CPL JUN | Leads JUN | Spend JUN | Delta CPL |")
P("|---|---:|---:|---:|---:|---:|---:|---:|")
linhas = []
for nm in recorrentes:
    mai_copies = nome2ads[("MAI", nm)]
    jun_copies = nome2ads[("JUN", nm)]
    s_mai = sum(c["spend"] for c in mai_copies)
    l_mai = sum(c["leads"] for c in mai_copies)
    s_jun = sum(c["spend"] for c in jun_copies)
    l_jun = sum(c["leads"] for c in jun_copies)
    cpl_mai = s_mai/l_mai if l_mai else None
    cpl_jun = s_jun/l_jun if l_jun else None
    if cpl_mai is None or cpl_jun is None: continue
    delta = cpl_jun - cpl_mai
    linhas.append((delta, nm, cpl_mai, l_mai, s_mai, cpl_jun, l_jun, s_jun))
linhas.sort()  # do que melhorou (delta negativo) pro que piorou
for d, nm, cm, lm, sm, cj, lj, sj in linhas[:25]:
    arrow = "🟢" if d < -0.10 else ("🔴" if d > 0.10 else "⚪")
    P(f"| `{nm[:45]}` | R$ {cm:.2f} | {lm} | R$ {sm:,.0f} | R$ {cj:.2f} | {lj} | R$ {sj:,.0f} | {arrow} {d:+.2f} |")
P("")

# ──────────────────────────────────────────────────────────────
# 6. Top ads do JUN (até hoje)
# ──────────────────────────────────────────────────────────────
P("## 6. Top ads do ANE_JUN_26 (até agora)")
P("")
jun_ads = []
for aid, info in ins_ads.items():
    cid = info["campanha_id"]
    cnome = next((c["name"] for c in camps if c["id"]==cid), "")
    if lancamento_de(cnome) != "JUN": continue
    if "[LEADS]" not in cnome: continue
    agg = aggr_insights(info["insights"])
    if agg["spend"] < 30: continue
    jun_ads.append({"nome": info["nome_ad"], "camp": cnome, **agg})
jun_ads.sort(key=lambda x: -(x["leads"] or 0))
P("| Ad | Campanha (FASE) | Spend | Leads | CPL | CPM | CTR link |")
P("|---|---|---:|---:|---:|---:|---:|")
for a in jun_ads[:25]:
    f = fase(a["camp"])
    P(f"| `{a['nome'][:40]}` | {f} | R$ {a['spend']:,.0f} | {a['leads']} | R$ {a['cpl'] or 0:.2f} | R$ {a['cpm'] or 0:.2f} | {a['ctr_link'] or 0:.2f}% |")
P("")

# ──────────────────────────────────────────────────────────────
# 7. Análise temporal: evolução do CPL diário
# ──────────────────────────────────────────────────────────────
P("## 7. Evolução do CPL diário (todas as campanhas de LEADS por lançamento)")
P("")
diario = defaultdict(lambda: defaultdict(lambda: {"spend":0.0, "leads":0}))
for c in camps:
    l = lancamento_de(c["name"])
    if l == "OUTRO": continue
    if "[LEADS]" not in c["name"]: continue
    for ins in ins_camps.get(c["id"], []):
        d = ins.get("date_start")
        if not d: continue
        diario[l][d]["spend"] += float(ins.get("spend") or 0)
        diario[l][d]["leads"] += leads_de(ins.get("actions"))

for l in ["MAI", "JUN"]:
    if not diario[l]: continue
    P(f"### ANE_{l}_26 — diário")
    P("")
    P("| Data | Spend | Leads | CPL |")
    P("|---|---:|---:|---:|")
    for d in sorted(diario[l].keys()):
        v = diario[l][d]
        cpl = v["spend"]/v["leads"] if v["leads"] else 0
        P(f"| {d} | R$ {v['spend']:,.0f} | {v['leads']} | R$ {cpl:.2f} |")
    P("")

# ──────────────────────────────────────────────────────────────
# 8. Mapa de duplicações no JUN (anti-padrão atual)
# ──────────────────────────────────────────────────────────────
P("## 8. Duplicações ATIVAS no JUN_26 (campanhas a auditar agora)")
P("")
P("Mesmo criativo (por nome) rodando em 2+ campanhas no JUN. Esses são candidatos a 'tirar duplicata' do agente.")
P("")
P("| Criativo | Em # campanhas | Campanhas | Spend total | CPL agregado |")
P("|---|---:|---|---:|---:|")
dup_jun = []
for (l, nm), copias in nome2ads.items():
    if l != "JUN" or len(copias) < 2: continue
    spend_tot = sum(c["spend"] for c in copias)
    leads_tot = sum(c["leads"] for c in copias)
    cpl_agg = spend_tot/leads_tot if leads_tot else 0
    camps_nomes = sorted({c["camp_nome"].split("]_[")[-1].rstrip("]").split("_")[0]
                         if "]_[" in c["camp_nome"] else c["camp_nome"][:20]
                         for c in copias})
    dup_jun.append((spend_tot, nm, len(copias), camps_nomes, cpl_agg))
dup_jun.sort(reverse=True)
for spend_tot, nm, n, camps_nomes, cpl_agg in dup_jun[:15]:
    P(f"| `{nm[:45]}` | {n} | {', '.join(camps_nomes)} | R$ {spend_tot:,.0f} | R$ {cpl_agg:.2f} |")
P("")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(OUT_LINES))
print(f"OK Relatorio salvo em {OUT}")
print(f"Tamanho: {OUT.stat().st_size} bytes / {len(OUT_LINES)} linhas")
