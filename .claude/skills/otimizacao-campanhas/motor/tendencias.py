"""
Tendencias: compara periodos e detecta sinais de fadiga.

1. Tendencia semanal — variacao % das principais metricas entre semana_atual e semana_anterior
2. Curva de fadiga por criativo — usa snapshots historicos pra detectar degradacao
   gradual (ex: CPL subindo 3 dias seguidos, CTR caindo 3 dias seguidos).
"""
import os, json, sys
from pathlib import Path
from datetime import date, datetime, timedelta
from collections import defaultdict


def variacao_pct(atual, anterior):
    if atual is None or anterior is None or anterior == 0:
        return None
    return round((atual - anterior) / anterior * 100, 1)


def emoji_tendencia(delta_pct, maior_pior=True, limite_alerta=15):
    """maior_pior=True: subir e ruim (CPL, CPM). False: subir e bom (CTR, Hook, leads)."""
    if delta_pct is None:
        return "⚪"
    if maior_pior:
        if delta_pct > limite_alerta: return "🔴"
        if delta_pct > 5: return "🟡"
        if delta_pct < -5: return "🟢"
        return "⚪"
    else:
        if delta_pct < -limite_alerta: return "🔴"
        if delta_pct < -5: return "🟡"
        if delta_pct > 5: return "🟢"
        return "⚪"


def comparar_semanas(janelas_campanha):
    """Recebe dict de janelas {ultimos_7d:{}, semana_anterior:{}} e retorna deltas."""
    atual = janelas_campanha.get("ultimos_7d") or {}
    ant = janelas_campanha.get("semana_anterior") or {}

    if not atual or not ant or not ant.get("spend"):
        return None

    return {
        "tem_comparacao": True,
        "spend_atual": atual.get("spend"),
        "spend_anterior": ant.get("spend"),
        "deltas": {
            "cpl": variacao_pct(atual.get("cpl"), ant.get("cpl")),
            "cpm": variacao_pct(atual.get("cpm"), ant.get("cpm")),
            "ctr_link": variacao_pct(atual.get("ctr_link"), ant.get("ctr_link")),
            "hook_rate": variacao_pct(atual.get("hook_rate"), ant.get("hook_rate")),
            "frequency": variacao_pct(atual.get("frequency"), ant.get("frequency")),
            "connect_rate": variacao_pct(atual.get("connect_rate"), ant.get("connect_rate")),
            "tx_conversao_pagina": variacao_pct(atual.get("tx_conversao_pagina"), ant.get("tx_conversao_pagina")),
            "leads": variacao_pct(atual.get("leads"), ant.get("leads")),
        },
    }


def serie_diaria_ad(slug: str, ad_name: str, dados_root: Path, dias: int = 7) -> list:
    """Le snapshots historicos e monta serie diaria das metricas do ad."""
    hist_dir = dados_root / slug / "historico"
    if not hist_dir.exists():
        return []

    snapshots = sorted(hist_dir.glob("*.json"))
    por_dia = defaultdict(list)

    for snap_path in snapshots:
        nome = snap_path.stem
        if "_" in nome:
            dia = nome.split("_")[0]
        else:
            continue
        try:
            d = json.loads(snap_path.read_text())
        except Exception:
            continue
        for c in d.get("campanhas", []):
            for a in c.get("ads", []):
                if a.get("name") == ad_name:
                    h = a.get("janelas", {}).get("hoje", {}) or {}
                    if h.get("spend"):
                        por_dia[dia].append(h)

    serie = []
    for dia in sorted(por_dia.keys())[-dias:]:
        amostras = por_dia[dia]
        ultima = amostras[-1] if amostras else {}
        serie.append({
            "data": dia,
            "spend": ultima.get("spend"),
            "leads": ultima.get("leads"),
            "cpl": ultima.get("cpl"),
            "ctr_link": ultima.get("ctr_link"),
            "hook_rate": ultima.get("hook_rate"),
            "frequency": ultima.get("frequency"),
        })
    return serie


def detectar_fadiga(serie: list) -> dict:
    """Olha tendencia da serie e detecta sinais de fadiga.

    Sinais (precisa de pelo menos 3 dias de serie):
    - CPL subindo 3 dias seguidos → fadiga
    - CTR caindo 3 dias seguidos → fadiga
    - Frequencia > 2 → saturacao publico
    - Hook Rate caindo 3 dias seguidos → criativo cansou
    """
    if len(serie) < 3:
        return {"insuficiente": True, "dias": len(serie)}

    sinais = []

    def subindo(vals):
        vals = [v for v in vals if v is not None]
        if len(vals) < 3: return False
        return vals[-1] > vals[-2] > vals[-3]

    def descendo(vals):
        vals = [v for v in vals if v is not None]
        if len(vals) < 3: return False
        return vals[-1] < vals[-2] < vals[-3]

    cpls = [s["cpl"] for s in serie]
    ctrs = [s["ctr_link"] for s in serie]
    hooks = [s["hook_rate"] for s in serie]
    freqs = [s["frequency"] for s in serie]

    if subindo(cpls):
        sinais.append({
            "tipo": "cpl_subindo",
            "severidade": "media",
            "msg": f"CPL subiu 3 dias seguidos: {cpls[-3]} → {cpls[-2]} → {cpls[-1]}",
        })

    if descendo(ctrs):
        sinais.append({
            "tipo": "ctr_caindo",
            "severidade": "media",
            "msg": f"CTR caiu 3 dias seguidos: {ctrs[-3]}% → {ctrs[-2]}% → {ctrs[-1]}%",
        })

    if descendo(hooks):
        sinais.append({
            "tipo": "hook_caindo",
            "severidade": "media",
            "msg": f"Hook Rate caiu 3 dias seguidos — criativo cansando",
        })

    ultima_freq = freqs[-1] if freqs else None
    if ultima_freq and ultima_freq > 2.0:
        sinais.append({
            "tipo": "freq_alta",
            "severidade": "alta",
            "msg": f"Frequencia {ultima_freq} acima de 2 — publico saturado",
        })

    return {
        "insuficiente": False,
        "dias": len(serie),
        "sinais": sinais,
        "tem_fadiga": len(sinais) > 0,
    }


def analise_completa(snapshot: dict, dados_root: Path) -> dict:
    slug = snapshot["cliente"]
    res = {"campanhas": [], "ads_com_fadiga": []}

    for c in snapshot["campanhas"]:
        comp = comparar_semanas(c.get("janelas", {}))
        bloco = {
            "name": c["name"],
            "comparacao_semanal": comp,
            "ads": [],
        }

        for a in c.get("ads", []):
            if a.get("status") != "ACTIVE":
                continue
            d3 = a.get("janelas", {}).get("ultimos_3d", {}) or {}
            if (d3.get("spend") or 0) < 10:
                continue
            serie = serie_diaria_ad(slug, a["name"], dados_root, dias=7)
            fadiga = detectar_fadiga(serie)
            bloco_ad = {
                "name": a["name"],
                "serie_dias": len(serie),
                "fadiga": fadiga,
            }
            bloco["ads"].append(bloco_ad)
            if fadiga.get("tem_fadiga"):
                res["ads_com_fadiga"].append({
                    "campanha": c["name"],
                    "ad": a["name"],
                    "sinais": fadiga["sinais"],
                })

        res["campanhas"].append(bloco)

    return res


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    slug = sys.argv[1] if len(sys.argv) > 1 else os.getenv("CLIENTE_SLUG", "fernanda")
    dados_root = Path(os.environ.get("AGENTE_DADOS", base.parent.parent.parent / "dados"))

    hist_dir = dados_root / slug / "historico"
    snap_path = sorted(hist_dir.glob("*.json"))[-1]
    snap = json.loads(snap_path.read_text())

    analise = analise_completa(snap, dados_root)

    out = dados_root / slug / "tendencias"
    out.mkdir(parents=True, exist_ok=True)
    out_file = out / snap_path.name
    out_file.write_text(json.dumps(analise, indent=2, ensure_ascii=False))
    (out / "latest.json").write_text(json.dumps(analise, indent=2, ensure_ascii=False))

    print(f"OK tendencias salvas: {out_file}\n")

    for c in analise["campanhas"]:
        tag = c["name"].split("]_[")[-1].rstrip("]").split("_")[0]
        print(f"=== {tag} ===")
        comp = c["comparacao_semanal"]
        if not comp:
            print("  (sem comparacao semanal — campanha nova ou sem dados na semana anterior)")
        else:
            print(f"  Gasto: R${comp['spend_atual']:.0f} vs R${comp['spend_anterior']:.0f} (semana ant.)")
            for k, v in comp["deltas"].items():
                if v is not None:
                    print(f"    {k}: {v:+.1f}%")
        for ad in c["ads"]:
            f = ad["fadiga"]
            if f.get("insuficiente"):
                print(f"  Ad '{ad['name'][:50]}' — historico curto ({f['dias']}d), sem analise de fadiga ainda")
            elif f.get("tem_fadiga"):
                print(f"  🔴 Ad '{ad['name'][:50]}' — FADIGA detectada:")
                for s in f["sinais"]:
                    print(f"      [{s['severidade']}] {s['msg']}")
            else:
                print(f"  🟢 Ad '{ad['name'][:50]}' — sem sinais de fadiga ({f['dias']}d historico)")
        print()
