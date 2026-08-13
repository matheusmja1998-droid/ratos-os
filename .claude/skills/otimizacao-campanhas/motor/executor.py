"""
Acoes na Meta Ads. Cada funcao retorna {"ok": bool, "msg": str}.
Funcoes ficam expostas como "ferramentas" pro Claude usar.
"""
import os, json, requests
from pathlib import Path
from dotenv import load_dotenv

API = "https://graph.facebook.com/v21.0"

# Carrega .env no import (nao so no __main__, senao as tools importadas rodam sem token).
# Local: raiz do Ratos OS (5 niveis acima). VPS: /root/agente/.env (2 niveis acima).
# AGENTE_ENV sobrescreve os dois.
if os.environ.get("AGENTE_ENV"):
    load_dotenv(os.environ["AGENTE_ENV"])
else:
    for _candidato in [Path(__file__).resolve().parents[1] / ".env",
                       *([Path(__file__).resolve().parents[4] / ".env"] if len(Path(__file__).resolve().parents) > 4 else [])]:
        if _candidato.exists():
            load_dotenv(_candidato)
            break


def _token(cliente: str = "fernanda") -> str:
    var = f"META_TOKEN_{cliente.upper().replace('-','_')}"
    if "fernanda" in cliente.lower():
        var = "META_TOKEN_FERNANDA"
    return os.getenv(var)


def listar_ads_ativos(cliente: str = "fernanda", tag: str = "AGV_JUN_26") -> dict:
    """Retorna lista de ads ativos da tag, com id e nome (pra matcher poder linkar)."""
    token = _token(cliente)
    acct = os.getenv("META_AD_ACCOUNT_FERNANDA")
    r = requests.get(f"{API}/{acct}/ads", params={
        "fields": "id,name,effective_status,campaign{name}",
        "filtering": json.dumps([
            {"field": "campaign.name", "operator": "CONTAIN", "value": tag},
            {"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]},
        ]),
        "limit": 200,
        "access_token": token,
    }, timeout=30)
    if r.status_code != 200:
        return {"ok": False, "msg": f"Erro Meta: {r.text[:200]}"}
    return {"ok": True, "ads": r.json().get("data", [])}


def pausar_ad(ad_id: str, cliente: str = "fernanda") -> dict:
    token = _token(cliente)
    r = requests.post(f"{API}/{ad_id}", data={"status": "PAUSED", "access_token": token}, timeout=30)
    if r.status_code == 200 and r.json().get("success"):
        return {"ok": True, "msg": f"Ad {ad_id} pausado"}
    return {"ok": False, "msg": f"Falhou pausar {ad_id}: {r.text[:200]}"}


def ativar_ad(ad_id: str, cliente: str = "fernanda") -> dict:
    token = _token(cliente)
    r = requests.post(f"{API}/{ad_id}", data={"status": "ACTIVE", "access_token": token}, timeout=30)
    if r.status_code == 200 and r.json().get("success"):
        return {"ok": True, "msg": f"Ad {ad_id} reativado"}
    return {"ok": False, "msg": f"Falhou reativar {ad_id}: {r.text[:200]}"}


def pausar_campanha(campaign_id: str, cliente: str = "fernanda") -> dict:
    token = _token(cliente)
    r = requests.post(f"{API}/{campaign_id}", data={"status": "PAUSED", "access_token": token}, timeout=30)
    if r.status_code == 200 and r.json().get("success"):
        return {"ok": True, "msg": f"Campanha {campaign_id} pausada"}
    return {"ok": False, "msg": f"Falhou: {r.text[:200]}"}


def mudar_budget_diario(campaign_id: str, novo_valor_brl: float, cliente: str = "fernanda") -> dict:
    """Muda daily_budget. Valor em reais (a Meta espera centavos)."""
    token = _token(cliente)
    centavos = int(round(novo_valor_brl * 100))
    r = requests.post(f"{API}/{campaign_id}", data={
        "daily_budget": centavos, "access_token": token,
    }, timeout=30)
    if r.status_code == 200 and r.json().get("success"):
        return {"ok": True, "msg": f"Budget {campaign_id} = R${novo_valor_brl:.2f}/dia"}
    return {"ok": False, "msg": f"Falhou: {r.text[:200]}"}


def matchar_ad_por_nome(termo: str, cliente: str = "fernanda", tag: str = "AGV_JUN_26") -> dict:
    """Procura ad ATIVO cujo nome contenha o termo. Retorna lista de matches."""
    res = listar_ads_ativos(cliente, tag)
    if not res["ok"]:
        return res
    t = termo.upper()
    matches = [a for a in res["ads"] if t in a["name"].upper()]
    return {"ok": True, "matches": matches}


TOOLS_SPEC = [
    {
        "name": "matchar_ad_por_nome",
        "description": "Procura ads ATIVOS na conta da Fernanda cujo nome contenha o termo. Use SEMPRE antes de pausar um ad pra ter certeza do ID correto.",
        "input_schema": {
            "type": "object",
            "properties": {"termo": {"type": "string", "description": "Trecho do nome do criativo (ex: '4_CPF', 'CHURRASCO', 'AVIAO')"}},
            "required": ["termo"],
        },
    },
    {
        "name": "pausar_ad",
        "description": "Pausa um ad pelo ad_id. Use depois de confirmar o ID via matchar_ad_por_nome.",
        "input_schema": {
            "type": "object",
            "properties": {"ad_id": {"type": "string"}},
            "required": ["ad_id"],
        },
    },
    {
        "name": "aovivo",
        "description": (
            "Status e controle das campanhas de remarketing AO VIVO de CPL da Fernanda (CPL1, CPL2, CPL3). "
            "Sao campanhas que rodam durante a aula ao vivo e exigem acompanhamento de perto. "
            "acao='status' (default): retorna status, budget diario, quanto JA GASTOU hoje, quanto FALTA GASTAR do budget, %% gasto, impressoes e cliques. "
            "acao='pausar': pausa a campanha (ex: pra economizar verba entre o inicio 13:30 e a aula 15h). "
            "acao='ativar': reativa campanha+conjuntos+ads (ex: ~20min antes da aula). "
            "Use quando o usuario disser: 'como ta a CPL1 ao vivo', 'quanto gastou o ao vivo', 'quanto falta gastar', 'pausa o ao vivo da aula 1', 'ativa de novo a CPL1 ao vivo', 'feedback da campanha ao vivo'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "description": "Qual campanha: CPL1, CPL2 ou CPL3 (aula 1/2/3)"},
                "acao": {"type": "string", "enum": ["status", "pausar", "ativar"], "description": "default 'status'"},
            },
            "required": ["label"],
        },
    },
    {
        "name": "ativar_ad",
        "description": "Reativa um ad pelo ad_id.",
        "input_schema": {
            "type": "object",
            "properties": {"ad_id": {"type": "string"}},
            "required": ["ad_id"],
        },
    },
    {
        "name": "pausar_campanha",
        "description": "Pausa uma campanha inteira. Cuidado: use so quando o usuario for explicito.",
        "input_schema": {
            "type": "object",
            "properties": {"campaign_id": {"type": "string"}},
            "required": ["campaign_id"],
        },
    },
    {
        "name": "mudar_budget_diario",
        "description": "Muda o orcamento diario da campanha. Valor em reais.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "string"},
                "novo_valor_brl": {"type": "number"},
            },
            "required": ["campaign_id", "novo_valor_brl"],
        },
    },
    {
        "name": "listar_ads_ativos",
        "description": "Lista todos os ads ativos da Fernanda no lancamento atual.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "proximos_criativos_fila",
        "description": "Mostra os proximos N criativos NAO USADOS da fila do Drive (ordenados por data crescente). Use quando o usuario perguntar 'qual o proximo criativo', 'quais os proximos da fila', 'o que subir agora'.",
        "input_schema": {
            "type": "object",
            "properties": {"top": {"type": "integer", "description": "Quantos criativos retornar (default 5)"}},
        },
    },
    {
        "name": "resumo_catalogo_criativos",
        "description": "Resumo do catalogo: total, usados, nao usados, e a fila top 10.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "marcar_criativo_usado",
        "description": "Marca um criativo como usado (chamar apos subir ele numa campanha, ou manualmente se o usuario pedir).",
        "input_schema": {
            "type": "object",
            "properties": {
                "nome": {"type": "string", "description": "Nome ou trecho do nome do criativo"},
                "ad_id": {"type": "string", "description": "ID do ad criado (opcional)"},
                "campanha": {"type": "string", "description": "Nome da campanha onde subiu (opcional)"},
            },
            "required": ["nome"],
        },
    },
    {
        "name": "analise_campanha",
        "description": "Analise dia-a-dia da campanha (default 3 dias). Retorna CPL agregado + CPL por dia da campanha + CPL por ad por dia. Use quando o usuario disser: 'analisa C12', 'como ta a C13', 'me traz o relatorio da C21', 'CPL da C12 nos ultimos 3 dias', 'compara campanha por dia'. Mesma analise que ele pede no chat.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tag": {"type": "string", "description": "Tag da campanha: 'C12', 'C13', 'C21'..."},
                "dias": {"type": "integer", "description": "Quantos dias (default 3, max 7)"},
            },
            "required": ["tag"],
        },
    },
    {
        "name": "analise_ad",
        "description": "Dia-a-dia de UM ad especifico (gasto, leads, CPL, CPM, CTR por dia). Use quando o usuario perguntar 'como ta o AVIAO', 'CPL do CHURRASCO nos ultimos dias', 'o VD_26 ta melhorando ou piorando'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "termo": {"type": "string", "description": "Trecho do nome do ad (ex: 'AVIAO', 'CHURRASCO', 'VD_26')"},
                "dias": {"type": "integer", "description": "Quantos dias (default 3)"},
            },
            "required": ["termo"],
        },
    },
    {
        "name": "subir_proximos_contingencia",
        "description": "Sobe os proximos N criativos da fila na C5 Contingencia da Fernanda. Default N=2. Use quando o usuario disser 'sobe proximos 2', 'manda mais 2 pra contingencia', 'subir proxima leva', 'sobe mais X criativos'. Demora ~2-3 min porque baixa do Drive e sobe pra Meta.",
        "input_schema": {
            "type": "object",
            "properties": {
                "quantidade": {"type": "integer", "description": "Quantos criativos subir (default 2, maximo 4)"},
            },
        },
    },
]


def proximos_criativos_fila(top: int = 5) -> dict:
    from catalogo import fila
    from pathlib import Path
    dados = Path(os.getenv("AGENTE_DADOS", Path(__file__).resolve().parent.parent.parent.parent.parent / "dados"))
    slug = os.getenv("CLIENTE_SLUG", "fernanda")
    items = fila(slug, dados, top=top)
    return {
        "ok": True,
        "fila": [
            {"nome": n, "data_mod": i["data_mod_drive"], "tamanho_mb": i.get("tamanho_mb")}
            for n, i in items
        ],
    }


def resumo_catalogo_criativos() -> dict:
    from catalogo import resumo
    from pathlib import Path
    dados = Path(os.getenv("AGENTE_DADOS", Path(__file__).resolve().parent.parent.parent.parent.parent / "dados"))
    slug = os.getenv("CLIENTE_SLUG", "fernanda")
    return {"ok": True, **resumo(slug, dados)}


def marcar_criativo_usado(nome: str, ad_id: str = None, campanha: str = None) -> dict:
    from catalogo import marcar_usado
    from pathlib import Path
    dados = Path(os.getenv("AGENTE_DADOS", Path(__file__).resolve().parent.parent.parent.parent.parent / "dados"))
    slug = os.getenv("CLIENTE_SLUG", "fernanda")
    return marcar_usado(slug, dados, nome, ad_id=ad_id, campanha=campanha)


def subir_proximos_contingencia(quantidade: int = 2) -> dict:
    """Dispara o script /root/agente/subir_proximos2.py (ja existente) em background."""
    import subprocess
    qtd = max(1, min(int(quantidade or 2), 4))
    # O script sobe 2 por execucao; pra mais, vamos executar varias vezes
    # Por enquanto, executa o script original (que sempre sobe 2)
    if qtd != 2:
        return {
            "ok": False,
            "msg": f"Versao atual sobe 2 por vez. Pra subir {qtd}, manda o comando varias vezes ou ajustamos o script.",
        }
    # Dispara em background — vai notificar via Telegram quando terminar (~2-3 min)
    subprocess.Popen(
        ["/root/agente/venv/bin/python3", "/root/agente/subir_proximos2.py"],
        env={**os.environ, "AGENTE_ENV": "/root/agente/.env", "AGENTE_DADOS": "/root/agente/dados"},
        stdout=open("/root/agente/logs/subir_proximos.log", "a"),
        stderr=subprocess.STDOUT,
    )
    return {
        "ok": True,
        "msg": "Disparado em background. Vai levar ~2-3 min (baixa do Drive + sobe Meta + cria ads). Te aviso no Telegram quando terminar.",
    }


def _meta_insights_dia(filtro_value, dia_iso, level="ad"):
    """Puxa insights de 1 dia da Meta API. Retorna lista bruta."""
    token = _token("fernanda")
    acct = os.getenv("META_AD_ACCOUNT_FERNANDA")
    fields = "ad_name,adset_name,campaign_name,spend,actions,cpm,frequency,inline_link_click_ctr,impressions"
    r = requests.get(f"{API}/{acct}/insights", params={
        "fields": fields,
        "filtering": json.dumps([{"field": "campaign.name", "operator": "CONTAIN", "value": filtro_value}]),
        "time_range": json.dumps({"since": dia_iso, "until": dia_iso}),
        "level": level,
        "access_token": token,
        "limit": 200,
    }, timeout=60)
    return r.json().get("data", [])


def _leads_de(row):
    for a in row.get("actions", []) or []:
        if a.get("action_type") == "complete_registration":
            return int(float(a["value"]))
    return 0


def analise_campanha(tag: str, dias: int = 3) -> dict:
    """Devolve analise CPL agregada + dia-a-dia da campanha (igual o relatorio que faco no chat).

    tag: 'C12', 'C13', 'C21' etc. Match em campaign.name CONTAIN ']_[{tag}'.
    dias: quantos dias passados analisar (default 3).
    """
    from datetime import date, timedelta
    hoje = date.today()
    janela_dias = [(hoje - timedelta(days=i), (hoje - timedelta(days=i)).strftime("%a %d/%m")) for i in range(dias - 1, -1, -1)]

    filtro = f"]_[{tag.upper()}"

    # Agregado N dias por ad
    agg_data = []
    since = (hoje - timedelta(days=dias - 1)).isoformat()
    until = hoje.isoformat()
    token = _token("fernanda")
    acct = os.getenv("META_AD_ACCOUNT_FERNANDA")
    r = requests.get(f"{API}/{acct}/insights", params={
        "fields": "ad_name,spend,actions,cpm,frequency,inline_link_click_ctr",
        "filtering": json.dumps([{"field": "campaign.name", "operator": "CONTAIN", "value": filtro}]),
        "time_range": json.dumps({"since": since, "until": until}),
        "level": "ad",
        "access_token": token,
        "limit": 200,
    }, timeout=60)
    agg_data = r.json().get("data", [])

    agg = []
    total_s = 0
    total_l = 0
    for a in agg_data:
        s = float(a.get("spend", 0))
        if s < 0.5:
            continue
        l = _leads_de(a)
        agg.append({
            "ad": a["ad_name"][:60],
            "spend": round(s, 2),
            "leads": l,
            "cpl": round(s / l, 2) if l else None,
            "cpm": round(float(a.get("cpm", 0)), 2),
            "ctr": round(float(a.get("inline_link_click_ctr", 0)), 2),
            "freq": round(float(a.get("frequency", 0)), 2),
        })
        total_s += s
        total_l += l
    agg.sort(key=lambda x: -x["spend"])

    # Por dia: campanha geral + cada ad
    por_dia = []
    ads_por_dia = {}  # ad_name -> {dia_label: {...}}
    for d, label in janela_dias:
        diso = d.isoformat()
        # Campanha
        camp_data = _meta_insights_dia(filtro, diso, level="campaign")
        s_camp = sum(float(c.get("spend", 0)) for c in camp_data)
        l_camp = sum(_leads_de(c) for c in camp_data)
        por_dia.append({
            "dia": label,
            "spend": round(s_camp, 2),
            "leads": l_camp,
            "cpl": round(s_camp / l_camp, 2) if l_camp else None,
        })
        # Ads
        ads_data = _meta_insights_dia(filtro, diso, level="ad")
        for a in ads_data:
            s = float(a.get("spend", 0))
            if s < 0.5:
                continue
            l = _leads_de(a)
            ads_por_dia.setdefault(a["ad_name"], {})[label] = {
                "spend": round(s, 2),
                "leads": l,
                "cpl": round(s / l, 2) if l else None,
                "cpm": round(float(a.get("cpm", 0)), 2),
                "ctr": round(float(a.get("inline_link_click_ctr", 0)), 2),
            }

    # Reformata por_ad: lista ordenada por gasto total no agregado
    ads_serie = []
    for ad_entry in agg:
        nm_full = next((a["ad_name"] for a in agg_data if a["ad_name"][:60] == ad_entry["ad"]), ad_entry["ad"])
        serie = ads_por_dia.get(nm_full, {})
        ads_serie.append({
            "ad": ad_entry["ad"],
            "agregado": {
                "spend": ad_entry["spend"], "leads": ad_entry["leads"],
                "cpl": ad_entry["cpl"], "cpm": ad_entry["cpm"],
                "ctr": ad_entry["ctr"], "freq": ad_entry["freq"],
            },
            "dia_a_dia": [
                {"dia": lbl, **(serie.get(lbl) or {"spend": 0, "leads": 0, "cpl": None})}
                for _, lbl in janela_dias
            ],
        })

    return {
        "ok": True,
        "campanha": tag.upper(),
        "janela_dias": dias,
        "agregado": {
            "spend": round(total_s, 2),
            "leads": total_l,
            "cpl": round(total_s / total_l, 2) if total_l else None,
        },
        "por_dia_campanha": por_dia,
        "por_ad": ads_serie[:10],
    }


def analise_ad(termo: str, dias: int = 3) -> dict:
    """Devolve dia-a-dia de 1 ad especifico (match por trecho do nome)."""
    from datetime import date, timedelta
    hoje = date.today()
    token = _token("fernanda")
    acct = os.getenv("META_AD_ACCOUNT_FERNANDA")
    termo_u = termo.upper()

    # Acha o ad
    r = requests.get(f"{API}/{acct}/insights", params={
        "fields": "ad_name,ad_id,spend",
        "filtering": json.dumps([{"field": "campaign.name", "operator": "CONTAIN", "value": "AGV_JUN_26"}]),
        "time_range": json.dumps({"since": (hoje - timedelta(days=dias - 1)).isoformat(), "until": hoje.isoformat()}),
        "level": "ad",
        "access_token": token,
        "limit": 200,
    }, timeout=60)
    todos = r.json().get("data", [])
    matches = [a for a in todos if termo_u in a["ad_name"].upper() and float(a.get("spend", 0)) > 0.5]
    if not matches:
        return {"ok": False, "msg": f"Nenhum ad com gasto >R$0,50 contendo '{termo}' nos ultimos {dias}d"}
    if len(matches) > 1:
        return {
            "ok": False,
            "msg": f"{len(matches)} ads bateram com '{termo}'. Especifica mais.",
            "candidatos": [a["ad_name"][:80] for a in matches[:5]],
        }
    ad = matches[0]
    nome = ad["ad_name"]

    janela = [(hoje - timedelta(days=i), (hoje - timedelta(days=i)).strftime("%a %d/%m")) for i in range(dias - 1, -1, -1)]
    serie = []
    for d, label in janela:
        diso = d.isoformat()
        r = requests.get(f"{API}/{acct}/insights", params={
            "fields": "ad_name,spend,actions,cpm,frequency,inline_link_click_ctr,impressions",
            "filtering": json.dumps([{"field": "ad.id", "operator": "IN", "value": [ad.get("ad_id", "")] or [""]}]),
            "time_range": json.dumps({"since": diso, "until": diso}),
            "level": "ad",
            "access_token": token,
            "limit": 5,
        }, timeout=30)
        rows = [r2 for r2 in r.json().get("data", []) if r2["ad_name"] == nome]
        if not rows:
            serie.append({"dia": label, "spend": 0, "leads": 0, "cpl": None})
            continue
        a = rows[0]
        s = float(a.get("spend", 0))
        l = _leads_de(a)
        serie.append({
            "dia": label,
            "spend": round(s, 2),
            "leads": l,
            "cpl": round(s / l, 2) if l else None,
            "cpm": round(float(a.get("cpm", 0)), 2),
            "ctr": round(float(a.get("inline_link_click_ctr", 0)), 2),
            "freq": round(float(a.get("frequency", 0)), 2),
        })

    return {"ok": True, "ad": nome, "janela_dias": dias, "dia_a_dia": serie}


# === Campanhas AO VIVO de CPL (AGV_JUN_26) — acompanhamento de perto ===
AOVIVO_CAMPS = {
    "CPL1": "52539146877103",
    "CPL2": "52539147070503",
    "CPL3": "52539147180303",
}


def aovivo(label: str, acao: str = "status", cliente: str = "fernanda") -> dict:
    """Status/controle das campanhas AO VIVO de CPL. acao: status|pausar|ativar."""
    token = _token(cliente)
    key = "".join(ch for ch in label.upper() if ch.isalnum())
    cid = AOVIVO_CAMPS.get(key)
    if not cid:  # tolera "aula1", "1", "cpl 1"
        for k, v in AOVIVO_CAMPS.items():
            if k[-1] in key:
                cid, key = v, k
                break
    if not cid:
        return {"ok": False, "msg": f"AO VIVO '{label}' nao encontrada. Use CPL1, CPL2 ou CPL3."}

    if acao == "pausar":
        r = requests.post(f"{API}/{cid}", data={"status": "PAUSED", "access_token": token}, timeout=30)
        ok = r.status_code == 200 and r.json().get("success")
        return {"ok": bool(ok), "msg": f"{key} AO VIVO {'pausada' if ok else 'NAO pausou: ' + r.text[:150]}"}

    if acao == "ativar":
        r = requests.post(f"{API}/{cid}", data={"status": "ACTIVE", "access_token": token}, timeout=30)
        sets = requests.get(f"{API}/{cid}/adsets", params={"fields": "id", "access_token": token}, timeout=30).json().get("data", [])
        ads = requests.get(f"{API}/{cid}/ads", params={"fields": "id", "access_token": token}, timeout=30).json().get("data", [])
        for s in sets:
            requests.post(f"{API}/{s['id']}", data={"status": "ACTIVE", "access_token": token}, timeout=30)
        for a in ads:
            requests.post(f"{API}/{a['id']}", data={"status": "ACTIVE", "access_token": token}, timeout=30)
        ok = r.status_code == 200
        return {"ok": ok, "msg": f"{key} AO VIVO {'reativada (campanha+conjuntos+ads)' if ok else 'NAO ativou: ' + r.text[:150]}"}

    # status (default)
    c = requests.get(f"{API}/{cid}", params={"fields": "effective_status,daily_budget", "access_token": token}, timeout=30).json()
    ins = requests.get(f"{API}/{cid}/insights", params={"fields": "spend,impressions,inline_link_clicks", "date_preset": "today", "access_token": token}, timeout=30).json()
    d = (ins.get("data") or [{}])[0]
    spend = float(d.get("spend", 0) or 0)
    budget = int(c.get("daily_budget", 0) or 0) / 100
    resta = max(0.0, budget - spend)
    return {
        "ok": True, "label": key, "status": c.get("effective_status"),
        "budget_diario": round(budget, 2), "ja_gastou": round(spend, 2),
        "falta_gastar": round(resta, 2),
        "pct_gasto": round(spend / budget * 100, 1) if budget else 0,
        "impressoes": d.get("impressions", "0"), "cliques": d.get("inline_link_clicks", "0"),
    }


TOOL_MAP = {
    "matchar_ad_por_nome": matchar_ad_por_nome,
    "pausar_ad": pausar_ad,
    "ativar_ad": ativar_ad,
    "aovivo": aovivo,
    "pausar_campanha": pausar_campanha,
    "mudar_budget_diario": mudar_budget_diario,
    "listar_ads_ativos": listar_ads_ativos,
    "proximos_criativos_fila": proximos_criativos_fila,
    "resumo_catalogo_criativos": resumo_catalogo_criativos,
    "marcar_criativo_usado": marcar_criativo_usado,
    "subir_proximos_contingencia": subir_proximos_contingencia,
    "analise_campanha": analise_campanha,
    "analise_ad": analise_ad,
}


def executar_tool(nome: str, args: dict) -> dict:
    fn = TOOL_MAP.get(nome)
    if not fn:
        return {"ok": False, "msg": f"Tool desconhecida: {nome}"}
    try:
        return fn(**args)
    except Exception as e:
        return {"ok": False, "msg": f"Erro {nome}: {e}"}


if __name__ == "__main__":
    env_path = Path(os.environ.get("AGENTE_ENV", Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"))
    load_dotenv(env_path)
    import sys
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "matchar":
            print(json.dumps(matchar_ad_por_nome(sys.argv[2]), indent=2, ensure_ascii=False))
        elif cmd == "listar":
            print(json.dumps(listar_ads_ativos(), indent=2, ensure_ascii=False)[:2000])


# === Caio: drill-down de custo por venda do Checklist (add 2026-06-11) ===
# Tool isolada: so registra quando o listener e do Caio (AGENTE_SLUG=caio).
if os.getenv("AGENTE_SLUG") == "caio":
    def custo_checklist(nivel: str = "campanha", filtro: str = None, janela: str = "hoje") -> dict:
        try:
            import checklist_caio
            return {"ok": True, "msg": checklist_caio.custo(nivel=nivel, filtro=filtro, janela=janela)}
        except Exception as e:
            return {"ok": False, "msg": f"Erro custo_checklist: {e}"}

    TOOL_MAP["custo_checklist"] = custo_checklist
    TOOLS_SPEC.append({
        "name": "custo_checklist",
        "description": (
            "Custo por venda REAL (gasto Meta dividido pelas vendas reais da planilha) das campanhas "
            "de VENDA do Checklist Honda. Pixel infla, por isso usa venda real. Use quando o Matheus "
            "perguntar sobre custo/CPV do Checklist por conjunto ou criativo. Exemplos: "
            "'como ta o custo desses conjuntos' -> nivel=conjunto; "
            "'custo do conjunto INT_SCOOTERS' / 'desse conjunto aqui' -> nivel=criativo, filtro=INT_SCOOTERS "
            "(mostra quais criativos do conjunto estao gastando); "
            "'custo das campanhas' -> nivel=campanha. Janela hoje (default) ou ontem."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "nivel": {"type": "string", "enum": ["campanha", "conjunto", "criativo"], "description": "granularidade da analise"},
                "filtro": {"type": "string", "description": "pra nivel=conjunto: tag da campanha (ESCALA/TESTE/ADVANTAGE). pra nivel=criativo: nome do conjunto (ex INT_SCOOTERS)"},
                "janela": {"type": "string", "enum": ["hoje", "ontem"], "description": "dia analisado (default hoje)"},
            },
            "required": ["nivel"],
        },
    })
