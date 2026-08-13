"""
Diagnostico: aplica hierarquia de decisao do cliente em cima do snapshot coletado.
Hierarquia: CPL -> CPM -> Connect Rate -> contexto.
Gera sugestoes acionaveis quando aplicavel.
"""
import json, sys
from pathlib import Path
import yaml


def cor(valor, alvo, aceitavel, teto, maior_pior=True):
    if valor is None:
        return "⚪"
    if maior_pior:
        if valor <= alvo: return "🟢"
        if valor <= aceitavel: return "🟡"
        return "🔴"
    else:
        if valor >= alvo: return "🟢"
        if valor >= aceitavel: return "🟡"
        return "🔴"


def _serie_diaria(ad, metrica, n=3):
    """Pega a metrica nos ultimos N dias por dia (janelas dia_1, dia_2, dia_3 se existirem,
    senao usa ontem/hoje + ultimos_3d como aproximacao)."""
    dias = []
    j = ad.get("janelas", {})
    for nome in ["d3", "d2", "d1"]:    # d3 = mais antigo, d1 = ontem
        v = (j.get(nome) or {}).get(metrica)
        if v is not None:
            dias.append(v)
    if not dias:
        # Fallback: ontem + hoje (so 2 pontos)
        for nome in ["ontem", "hoje"]:
            v = (j.get(nome) or {}).get(metrica)
            if v is not None:
                dias.append(v)
    return dias


def _tendencia(serie, maior_pior=True):
    """Retorna 'piorando', 'melhorando' ou 'estavel' analisando lista de valores ordenada do mais antigo pro mais recente."""
    if len(serie) < 2:
        return "indef"
    vals = [v for v in serie if v is not None and v > 0]
    if len(vals) < 2:
        return "indef"
    crescente = all(vals[i] < vals[i+1] for i in range(len(vals)-1))
    decrescente = all(vals[i] > vals[i+1] for i in range(len(vals)-1))
    if crescente:
        return "piorando" if maior_pior else "melhorando"
    if decrescente:
        return "melhorando" if maior_pior else "piorando"
    return "estavel"


def diagnosticar_ad(ad, cfg):
    """Diagnostica um anuncio. Retorna lista de sugestoes."""
    sugestoes = []
    h = ad["janelas"].get("hoje", {}) or {}
    d3 = ad["janelas"].get("ultimos_3d", {}) or {}
    spend_3d = d3.get("spend") or 0
    leads_3d = d3.get("leads") or 0
    cpl_3d = d3.get("cpl")
    cpl_alvo = cfg["cpl"]["alvo"]
    cpl_teto = cfg["cpl"]["teto"]

    if ad.get("status") != "ACTIVE":
        return sugestoes

    # R1: pausar ad sem lead (gastou e nao trouxe nada)
    regras = cfg.get("regras_otimizacao", {})
    r_sem_lead = regras.get("pausar_ad_sem_lead", {})
    spend_min_sem_lead = r_sem_lead.get("spend_min", 3 * cpl_alvo)
    if spend_3d >= spend_min_sem_lead and leads_3d == 0:
        sugestoes.append({
            "acao": "pausar_ad",
            "alvo": ad["name"],
            "ad_id": ad["id"],
            "motivo": f"R${spend_3d:.0f} gastos em 3d, 0 conversoes (limiar R${spend_min_sem_lead})",
            "severidade": "alta",
        })
        return sugestoes

    # R2: pausar ad acima do teto 3d
    if cpl_3d is not None and cpl_3d > cpl_teto:
        sugestoes.append({
            "acao": "pausar_ad",
            "alvo": ad["name"],
            "ad_id": ad["id"],
            "motivo": f"CPL 3d R${cpl_3d:.2f} acima do teto R${cpl_teto}",
            "severidade": "alta",
        })
        return sugestoes

    # R3: tendencia ruim — 3 dias consecutivos piorando OU ultimo dia ja muito ruim
    # Invalidacao: se HOJE ja virou (CPL hoje <= alvo OU < CPL dia anterior), NAO sugerir pausar.
    r_tend = regras.get("pausar_ad_tendencia_ruim", {})
    serie_cpl = _serie_diaria(ad, "cpl", n=3)
    cpl_d1 = serie_cpl[-1] if serie_cpl else None
    cpl_hoje = h.get("cpl")
    cpl_min_d1 = r_tend.get("cpl_min_ultimo_dia", 18)
    ja_virou_hoje = cpl_hoje is not None and (cpl_hoje <= cpl_alvo or (cpl_d1 is not None and cpl_hoje < cpl_d1 * 0.8))
    if cpl_d1 is not None and cpl_d1 >= cpl_min_d1 and _tendencia(serie_cpl) == "piorando" and not ja_virou_hoje:
        sugestoes.append({
            "acao": "pausar_ad",
            "alvo": ad["name"],
            "ad_id": ad["id"],
            "motivo": f"CPL piorando 3d seguidos: " + " → ".join(f"R${v:.2f}" for v in serie_cpl),
            "severidade": "alta",
        })
        return sugestoes

    # R4: sinal de virada — nao pausar, deixar rodar
    r_virada = regras.get("sinal_virada_criativo", {})
    if r_virada and cpl_3d is not None and cpl_3d > cpl_alvo:
        serie_cpm = _serie_diaria(ad, "cpm", n=3)
        serie_ctr = _serie_diaria(ad, "ctr_link", n=3) or _serie_diaria(ad, "ctr", n=3)
        if (len(serie_cpm) >= 2 and _tendencia(serie_cpm) == "melhorando" and
            len(serie_ctr) >= 2 and _tendencia(serie_ctr, maior_pior=False) == "melhorando" and
            cpl_d1 is not None and cpl_d1 < cpl_3d):
            sugestoes.append({
                "acao": "manter_e_vigiar",
                "alvo": ad["name"],
                "ad_id": ad["id"],
                "motivo": f"Sinal de virada: CPM↓ + CTR↑ + CPL hoje R${cpl_d1:.2f} < 3d R${cpl_3d:.2f}. Deixar rodar.",
                "severidade": "baixa",
            })
            return sugestoes

    # R5: vigiar quando perto do teto
    if cpl_3d is not None and cpl_3d > cfg["cpl"]["aceitavel"] * 0.9 and cpl_3d <= cpl_teto:
        sugestoes.append({
            "acao": "vigiar_ad",
            "alvo": ad["name"],
            "ad_id": ad["id"],
            "motivo": f"CPL 3d R${cpl_3d:.2f} no limite (teto R${cpl_teto})",
            "severidade": "media",
        })

    return sugestoes


def diagnosticar_budget_campanha(camp, cfg):
    """Sugere subir ou reduzir budget da campanha."""
    sugestoes = []
    regras = cfg.get("regras_otimizacao", {})
    h = camp["janelas"].get("hoje", {}) or {}
    d3 = camp["janelas"].get("ultimos_3d", {}) or {}
    cpl_h = h.get("cpl")
    spend_h = h.get("spend") or 0
    budget = camp.get("daily_budget")
    if not budget:
        return sugestoes
    budget_brl = budget / 100 if budget > 1000 else budget  # centavos -> reais
    cpl_alvo = cfg["cpl"]["alvo"]

    # Reduzir: CPL hoje >= 2x alvo + ja gastou >50% do budget
    r_red = regras.get("reduzir_budget_campanha", {})
    if r_red and cpl_h is not None and cpl_h >= 2 * cpl_alvo and spend_h > 0.5 * budget_brl:
        novo = round(budget_brl * (1 - r_red.get("reducao_pct", 20) / 100), 2)
        sugestoes.append({
            "acao": "reduzir_budget_campanha",
            "alvo": camp["name"],
            "campaign_id": camp["id"],
            "valor_novo_brl": novo,
            "motivo": f"CPL hoje R${cpl_h:.2f} (2x alvo R${cpl_alvo}), ja gastou {spend_h/budget_brl*100:.0f}% do budget. Reduzir {r_red.get('reducao_pct',20)}%.",
            "severidade": "media",
        })

    # Subir: CPL hoje <= alvo + freq baixa + CTR subindo
    r_sub = regras.get("subir_budget_campanha", {})
    freq_3d = d3.get("frequency")
    if r_sub and cpl_h is not None and cpl_h <= cpl_alvo and (freq_3d is None or freq_3d < 1.10):
        # checa CTR subindo entre os ads ativos
        serie_ctr_camp = []
        for nome in ["d3", "d2", "d1"]:
            v = (camp["janelas"].get(nome) or {}).get("ctr_link") or (camp["janelas"].get(nome) or {}).get("ctr")
            if v is not None: serie_ctr_camp.append(v)
        ctr_subindo = len(serie_ctr_camp) >= 2 and _tendencia(serie_ctr_camp, maior_pior=False) == "melhorando"
        if ctr_subindo or freq_3d is None or freq_3d < 1.05:
            novo = round(budget_brl * (1 + r_sub.get("aumento_pct", 20) / 100), 2)
            sugestoes.append({
                "acao": "subir_budget_campanha",
                "alvo": camp["name"],
                "campaign_id": camp["id"],
                "valor_novo_brl": novo,
                "motivo": f"CPL hoje R${cpl_h:.2f} 🟢, freq {freq_3d if freq_3d else 'baixa'}. Aproveitar momento.",
                "severidade": "media",
            })

    return sugestoes


def diagnosticar_mono_criativo(camp, cfg):
    """Avisa quando 1 ad responde por >X% do gasto 3d (campanha dependente de 1 criativo)."""
    sugestoes = []
    regras = cfg.get("regras_otimizacao", {})
    r_mono = regras.get("alerta_mono_criativo", {})
    if not r_mono:
        return sugestoes
    pct_max = r_mono.get("pct_gasto_max", 0.80)
    ads = [a for a in camp["ads"] if a.get("status") == "ACTIVE"]
    if len(ads) < 2:
        return sugestoes  # so 1 ad = obvio que e mono
    gastos = [(a["name"], (a["janelas"].get("ultimos_3d") or {}).get("spend") or 0) for a in ads]
    total = sum(g for _, g in gastos) or 1
    top_nome, top_gasto = max(gastos, key=lambda x: x[1])
    if top_gasto / total >= pct_max:
        sugestoes.append({
            "acao": "subir_2_proximos_fila",
            "alvo": camp["name"],
            "campaign_id": camp["id"],
            "motivo": f"'{top_nome[:50]}' responde por {top_gasto/total*100:.0f}% do gasto 3d. Campanha dependente de 1 criativo.",
            "severidade": "media",
        })
    return sugestoes


def diagnosticar_campanha(camp, cfg, todos_ad_names):
    sugestoes = []
    h = camp["janelas"].get("hoje", {}) or {}
    d3 = camp["janelas"].get("ultimos_3d", {}) or {}

    cpl_h = h.get("cpl")
    cpl_3d = d3.get("cpl")
    cpm = h.get("cpm")

    # Sobreposicao de criativo entre campanhas.
    # - Fernanda: nao_repetir_criativo_entre_campanhas=true -> alerta a partir de 2 camps.
    # - Caio: max_campanhas_por_criativo=N -> alerta so quando ULTRAPASSA N (ex: 2 e normal
    #   = teste + escala; so vira anti-padrao em 3+).
    gr = cfg["guardrails"]
    max_camps = gr.get("max_campanhas_por_criativo")
    repetir_proibido = gr.get("nao_repetir_criativo_entre_campanhas")
    limite = 1 if repetir_proibido else (max_camps if max_camps else None)
    if limite is not None:
        anti = []
        for ad in camp["ads"]:
            nm = ad["name"]
            if todos_ad_names.get(nm, 0) > limite and ad.get("status") == "ACTIVE":
                anti.append(nm)
        for nm in set(anti):
            n = todos_ad_names[nm]
            motivo = (f"Criativo em {n} campanhas (max {limite}) - infla CPM por auto-canibalismo"
                      if max_camps else
                      f"Criativo rodando em {n} campanhas (anti-padrao Fernanda)")
            sugestoes.append({
                "acao": "remover_criativo_duplicado",
                "alvo": nm,
                "motivo": motivo,
                "severidade": "media",
            })

    for ad in camp["ads"]:
        sugestoes.extend(diagnosticar_ad(ad, cfg))

    sugestoes.extend(diagnosticar_budget_campanha(camp, cfg))
    sugestoes.extend(diagnosticar_mono_criativo(camp, cfg))

    return sugestoes


def diagnosticar(snapshot, cfg):
    todos_ad_names = {}
    for c in snapshot["campanhas"]:
        for ad in c["ads"]:
            if ad.get("status") == "ACTIVE":
                todos_ad_names[ad["name"]] = todos_ad_names.get(ad["name"], 0) + 1

    diag = {
        "timestamp": snapshot["timestamp"],
        "lancamento": snapshot["lancamento"],
        "cliente_slug": snapshot.get("cliente"),
        "totais": {
            "spend_hoje": 0,
            "leads_hoje": 0,
            "spend_3d": 0,
            "leads_3d": 0,
        },
        "campanhas": [],
        "sugestoes": [],
        "alertas_tracking": [],
    }

    for c in snapshot["campanhas"]:
        h = c["janelas"].get("hoje", {}) or {}
        d3 = c["janelas"].get("ultimos_3d", {}) or {}
        diag["totais"]["spend_hoje"] += h.get("spend") or 0
        diag["totais"]["leads_hoje"] += h.get("leads") or 0
        diag["totais"]["spend_3d"] += d3.get("spend") or 0
        diag["totais"]["leads_3d"] += d3.get("leads") or 0

        if (h.get("spend") or 0) > 100 and (h.get("leads") or 0) == 0 and (h.get("lp_views") or 0) > 0:
            diag["alertas_tracking"].append({
                "campanha": c["name"],
                "motivo": f"Spend R${h['spend']:.0f}, LP views {h['lp_views']}, leads 0 — verificar pixel"
            })

        sug = diagnosticar_campanha(c, cfg, todos_ad_names)
        diag["sugestoes"].extend(sug)

        diag["campanhas"].append({
            "name": c["name"],
            "status": c["status"],
            "daily_budget": c.get("daily_budget"),
            "hoje": h, "ontem": c["janelas"].get("ontem", {}), "d3": d3, "d7": c["janelas"].get("ultimos_7d", {}),
            "ads": [{
                "name": a["name"], "status": a["status"],
                "hoje": a["janelas"].get("hoje", {}),
                "d3": a["janelas"].get("ultimos_3d", {}),
            } for a in c["ads"]],
        })

    cpl_total_hoje = (diag["totais"]["spend_hoje"] / diag["totais"]["leads_hoje"]) if diag["totais"]["leads_hoje"] else None
    cpl_total_3d = (diag["totais"]["spend_3d"] / diag["totais"]["leads_3d"]) if diag["totais"]["leads_3d"] else None
    diag["totais"]["cpl_hoje"] = round(cpl_total_hoje, 2) if cpl_total_hoje else None
    diag["totais"]["cpl_3d"] = round(cpl_total_3d, 2) if cpl_total_3d else None

    return diag


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    slug = sys.argv[1] if len(sys.argv) > 1 else "fernanda"
    snap_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None

    cfg = yaml.safe_load((base / "clientes" / f"{slug}.yaml").read_text())

    import os
    dados_root = Path(os.environ.get("AGENTE_DADOS", base.parent.parent.parent / "dados"))
    if not snap_path:
        hist = sorted((dados_root / slug / "historico").glob("*.json"))
        snap_path = hist[-1]

    snap = json.loads(snap_path.read_text())
    diag = diagnosticar(snap, cfg)

    out = dados_root / slug / "diagnosticos"
    out.mkdir(parents=True, exist_ok=True)
    fname = out / snap_path.name
    fname.write_text(json.dumps(diag, indent=2, ensure_ascii=False))
    print(f"OK diagnostico salvo: {fname}")
    print(f"  CPL geral hoje: R${diag['totais']['cpl_hoje']} | 3d: R${diag['totais']['cpl_3d']}")
    print(f"  Sugestoes: {len(diag['sugestoes'])}")
    for s in diag["sugestoes"]:
        print(f"    [{s['severidade']}] {s['acao']}: {s['alvo'][:60]} — {s['motivo']}")
    if diag["alertas_tracking"]:
        print(f"  Alertas tracking: {len(diag['alertas_tracking'])}")
