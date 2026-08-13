"""
Coleta de metricas Meta Ads por cliente.
Puxa campanhas + adsets + ads ativos do lancamento, com insights por janela.
"""
import os, json, sys, time
from datetime import date, timedelta
from pathlib import Path
import requests
import yaml
from dotenv import load_dotenv

API = "https://graph.facebook.com/v21.0"


def carregar_cliente(slug: str, base_dir: Path):
    cfg_path = base_dir / "clientes" / f"{slug}.yaml"
    with open(cfg_path) as f:
        return yaml.safe_load(f)


def janelas(hoje: date):
    # d1 = ontem (mais recente fechado), d2 = anteontem, d3 = 3 dias atras (mais antigo)
    # Serve pra analise de tendencia dia a dia (CPL/CPM/CTR melhorando ou piorando).
    return {
        "hoje":             (hoje.isoformat(), hoje.isoformat()),
        "ontem":            ((hoje - timedelta(days=1)).isoformat(), (hoje - timedelta(days=1)).isoformat()),
        "d1":               ((hoje - timedelta(days=1)).isoformat(), (hoje - timedelta(days=1)).isoformat()),
        "d2":               ((hoje - timedelta(days=2)).isoformat(), (hoje - timedelta(days=2)).isoformat()),
        "d3":               ((hoje - timedelta(days=3)).isoformat(), (hoje - timedelta(days=3)).isoformat()),
        "ultimos_3d":       ((hoje - timedelta(days=2)).isoformat(), hoje.isoformat()),
        "ultimos_7d":       ((hoje - timedelta(days=6)).isoformat(), hoje.isoformat()),
        "semana_anterior":  ((hoje - timedelta(days=13)).isoformat(), (hoje - timedelta(days=7)).isoformat()),
    }


def get(url, params, tries=3):
    for i in range(tries):
        r = requests.get(url, params=params, timeout=60)
        if r.status_code == 200:
            return r.json()
        if r.status_code in (500, 502, 503, 504, 429):
            time.sleep(2 ** i)
            continue
        return {"error": r.json()}
    return {"error": "max retries"}


def eh_captacao(c, filtro):
    """True se a campanha passa no filtro de captacao do cliente.
    filtro = dict opcional com:
      nome_contem:     lista de substrings que o nome deve conter (qualquer uma)
      nome_nao_contem: lista de substrings que, se presentes, descartam a campanha
      objetivo:        lista de objetivos permitidos (ex: OUTCOME_SALES / OUTCOME_LEADS)
      modo:            "e" (default, precisa dos dois criterios) ou "ou" (qualquer um)
    Criterio nao definido = nao restringe. Sem filtro = passa tudo.
    nome_nao_contem e sempre AND (exclusao dura), independente do modo.
    Ex Fernanda {nome_contem:[LEAD], objetivo:[OUTCOME_SALES], modo:e} -> so captacao,
    exclui [LEMBRETE]-Lead (tem 'lead' no nome mas objetivo TRAFFIC).
    Ex Caio {objetivo:[OUTCOME_LEADS], nome_nao_contem:[PRESENCIAL]} -> captacao online,
    tira imersao presencial (que tambem e OUTCOME_LEADS) e remarketing (TRAFFIC)."""
    if not filtro:
        return True
    nome = (c.get("name") or "").upper()
    obj = (c.get("objective") or "").upper()
    nomes = [x.upper() for x in filtro.get("nome_contem", [])]
    nao = [x.upper() for x in filtro.get("nome_nao_contem", [])]
    objs = [x.upper() for x in filtro.get("objetivo", [])]
    if nao and any(x in nome for x in nao):
        return False
    cond_nome = (not nomes) or any(x in nome for x in nomes)
    cond_obj = (not objs) or (obj in objs)
    if filtro.get("modo", "e").lower() == "ou" and nomes and objs:
        return cond_nome or cond_obj
    return cond_nome and cond_obj


def listar_campanhas(acct, tag, token, filtro=None):
    """Lista campanhas ACTIVE com nome contendo a tag, aplicando o filtro de
    captacao do cliente (ver eh_captacao)."""
    data = get(f"{API}/{acct}/campaigns", {
        "fields": "name,effective_status,daily_budget,lifetime_budget,objective",
        "filtering": json.dumps([
            {"field": "name", "operator": "CONTAIN", "value": tag},
            {"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]},
        ]),
        "limit": 100,
        "access_token": token,
    })
    camps = data.get("data", [])
    return [c for c in camps if eh_captacao(c, filtro)]


def insights(node_id, token, since, until, level=None):
    params = {
        "time_range": json.dumps({"since": since, "until": until}),
        "fields": ",".join([
            "impressions", "reach", "frequency", "spend",
            "cpm", "cpc", "ctr", "inline_link_click_ctr",
            "clicks", "inline_link_clicks",
            "actions", "action_values",
            "video_play_actions",
            "video_p25_watched_actions", "video_p50_watched_actions",
            "video_p75_watched_actions", "video_p100_watched_actions",
        ]),
        "access_token": token,
    }
    if level:
        params["level"] = level
    return get(f"{API}/{node_id}/insights", params).get("data", [])


def listar_ads(campaign_id, token):
    data = get(f"{API}/{campaign_id}/ads", {
        "fields": "name,effective_status,creative,adset_id",
        "limit": 200,
        "access_token": token,
    })
    return data.get("data", [])


def extrair_acao(insight_row, action_type):
    for a in insight_row.get("actions", []) or []:
        if a.get("action_type") == action_type:
            try:
                return int(float(a["value"]))
            except Exception:
                return 0
    return 0


def metrica_chave(ins):
    """Calcula CPL, connect_rate, hook_rate, hold_rate de uma linha de insights."""
    if not ins:
        return {}
    spend = float(ins.get("spend", 0))
    impressions = int(ins.get("impressions", 0))
    clicks_link = int(ins.get("inline_link_clicks", 0))

    leads = (
        extrair_acao(ins, "complete_registration")
        or extrair_acao(ins, "offsite_conversion.fb_pixel_complete_registration")
        or extrair_acao(ins, "onsite_conversion.complete_registration")
        or extrair_acao(ins, "lead")
        or extrair_acao(ins, "onsite_conversion.lead_grouped")
    )
    lp_views = extrair_acao(ins, "landing_page_view")

    vid_3s = extrair_acao(ins, "video_view")

    vid_100 = 0
    for a in ins.get("video_p100_watched_actions", []) or []:
        vid_100 = int(float(a.get("value", 0)))

    ctr_link = float(ins.get("inline_link_click_ctr", 0))
    ctr_total = float(ins.get("ctr", 0))

    return {
        "spend": round(spend, 2),
        "impressions": impressions,
        "reach": int(ins.get("reach", 0)),
        "frequency": round(float(ins.get("frequency", 0)), 2),
        "cpm": round(float(ins.get("cpm", 0)), 2),
        "cpc": round(float(ins.get("cpc", 0)), 2),
        "ctr": round(ctr_total, 2),
        "ctr_link": round(ctr_link, 2),
        "link_clicks": clicks_link,
        "lp_views": lp_views,
        "leads": leads,
        "cpl": round(spend / leads, 2) if leads else None,
        "connect_rate": round(lp_views / clicks_link, 3) if clicks_link else None,
        "tx_conversao_pagina": round(leads / lp_views, 3) if lp_views else None,
        "hook_rate": round(vid_3s / impressions, 3) if impressions else None,
        "hold_rate": round(vid_100 / vid_3s, 3) if vid_3s else None,
    }


def coletar_tudo(slug: str, base_dir: Path, env_path: Path):
    load_dotenv(env_path)
    cfg = carregar_cliente(slug, base_dir)

    token = os.getenv(cfg["meta_ads"]["token_env"])
    acct = cfg["meta_ads"]["ad_account"]
    tag = cfg["meta_ads"]["tag"]

    if not token:
        raise RuntimeError(f"Token nao encontrado: {cfg['meta_ads']['token_env']}")

    hoje = date.today()
    js = janelas(hoje)

    filtro = cfg["meta_ads"].get("captacao_filtro")
    campanhas = listar_campanhas(acct, tag, token, filtro)

    snapshot = {
        "cliente": slug,
        "lancamento": cfg["lancamento_ativo"],
        "tag": tag,
        "ad_account": acct,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "campanhas": [],
    }

    for c in campanhas:
        cid = c["id"]
        bloco = {
            "id": cid,
            "name": c["name"],
            "status": c.get("effective_status"),
            "daily_budget": int(c.get("daily_budget", 0)) / 100 if c.get("daily_budget") else None,
            "lifetime_budget": int(c.get("lifetime_budget", 0)) / 100 if c.get("lifetime_budget") else None,
            "janelas": {},
            "ads": [],
        }

        for jn, (since, until) in js.items():
            ins_list = insights(cid, token, since, until)
            bloco["janelas"][jn] = metrica_chave(ins_list[0] if ins_list else {})

        ads = listar_ads(cid, token)
        for ad in ads:
            ad_id = ad["id"]
            ad_block = {
                "id": ad_id,
                "name": ad["name"],
                "status": ad.get("effective_status"),
                "janelas": {},
            }
            for jn, (since, until) in js.items():
                ins_list = insights(ad_id, token, since, until)
                ad_block["janelas"][jn] = metrica_chave(ins_list[0] if ins_list else {})
            bloco["ads"].append(ad_block)

        snapshot["campanhas"].append(bloco)

    return snapshot


if __name__ == "__main__":
    slug = sys.argv[1] if len(sys.argv) > 1 else "fernanda"
    base = Path(__file__).resolve().parent.parent
    env = Path(os.environ.get("AGENTE_ENV", base.parent.parent.parent / ".env"))

    snap = coletar_tudo(slug, base, env)
    out_dir = Path(os.environ.get("AGENTE_DADOS", base.parent.parent.parent / "dados")) / slug / "historico"
    out_dir.mkdir(parents=True, exist_ok=True)
    fname = out_dir / f"{time.strftime('%Y-%m-%d_%Hh')}.json"
    fname.write_text(json.dumps(snap, indent=2, ensure_ascii=False))
    print(f"OK snapshot salvo: {fname}")
    print(f"  Campanhas ativas: {len(snap['campanhas'])}")
    for c in snap["campanhas"]:
        hoje = c["janelas"].get("hoje", {})
        print(f"  - {c['name'][:80]}: gasto hoje R${hoje.get('spend',0)}, leads {hoje.get('leads',0)}, CPL R${hoje.get('cpl','-')}")
