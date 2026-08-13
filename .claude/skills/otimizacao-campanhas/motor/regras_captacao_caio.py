"""
Regras automaticas de CAPTACAO DE LEAD do Caio (auto-executa, avisa no Telegram).
Identifica campanha de captacao por "[LEADS]" no nome (IE30 usa OUTCOME_SALES
otimizando COMPLETE_REGISTRATION). Exclui CHECKLIST (venda) e PRESENCIAL.
Lead = COMPLETE_REGISTRATION do Gerenciador (lead nao infla). CPL = gasto/leads.

Tipos (pelo nome): TESTE_DE_CRIATIVO (ABO) | ESCALA / PUBLICO_QUENTE (CBO).
METAS: ideal R$3,00 | teto R$3,80 (foi 4,00 entre 02-04/07, voltou: prioridade é CPL barato).

== TESTE DE CRIATIVO (avalia por dia; SO julga depois de gastar R$15,20 no DIA) ==
  - veterano (>=2 dias e CPL bom ONTEM) com dia ruim hoje -> alerta; reavalia amanha; 2 dias seguidos ruim -> pausa
  - sem tracao: gastou >=R$15,20 hoje com 0-1 lead -> pausa
  - caro (>=2 leads, CPL>teto): 1o dia -> espera +24h; 2o dia (age>=1) e ja gastou R$15,20 -> pausa
  - se nao gastou R$15,20 no dia ainda -> NAO julga, espera acumular
  - toda pausa no teste = anuncio E conjunto

== CBO (escala + publico quente; verifica a cada 6h) ==
  - criativo RUIM irrelevante que estourou hoje -> pausa o criativo + reduz 10%
  - campanha acima do teto -> reduz orcamento na SEQUENCIA (1a vez 10%, 2a vez 30%, dps 10%)
    + atencao; se continuar acima nas proximas janelas, reduz de novo (segue a sequencia);
    se normalizar -> sai da atencao
  - Meia-noite (job orcamento): CPL <3,00 -> +30% | 3,00-3,80 -> mantem | >3,80 -> reduz (mesma sequencia)

SEQUENCIA DE REDUCAO (Matheus 19/06): 1a reducao do dia = 10% (inicio/gasto baixo),
2a = 30% (ja gastou mais e segue caro), 3a em diante = 10%. (Caso B = sempre 10% e conta.)
Convencao de centavos: novo valor + 2 primeiros digitos do antigo nos centavos.

Uso: python3 regras_captacao_caio.py --job poda|orcamento [--dry]
"""
import os, sys, json, re, time, requests
from datetime import datetime, timedelta
import checklist_caio as cc

DRY = "--dry" in sys.argv
JOB = sys.argv[sys.argv.index("--job") + 1] if "--job" in sys.argv else "poda"

IDEAL = 3.00
TETO = 3.80           # voltou pra 3,80 em 04/07 (diretriz: CPL barato > volume; tinha ido a 4,00 em 02/07)
GATE = 15.20          # gasto minimo no DIA pra avaliar/cortar criativo no teste
NEW_AGE = 2           # < 2 dias de vida = "novo"
JUNK_SHARE = 0.05     # < 5% do gasto vitalicio da campanha = irrelevante no volume
SPIKE_SPEND = 10.0    # gasto hoje pra considerar que "estourou"
MIN_SPEND_PCT = 20    # CBO só poda depois de gastar >=20% do orçamento do dia (senão é ruído)
MM_TETO = 4.20        # média móvel de 3 dias FECHADOS acima disso (com gasto relevante) -> pausa (Matheus 02/07: manter 4,20 mesmo com teto 4,00)
MM_GASTO_MIN = 30.0   # gasto mínimo nos 3 dias fechados pra a média móvel valer (~2 dias de gate)
CUM_GATE = 25.0       # gasto ACUMULADO em dias fechados com 0-1 lead -> pausa (zumbi que sangra devagar, escapa do gate diário)

API = cc.API
ACCT = cc.ACCT
TOKEN = cc._token()
TZ = cc.TZ
D = cc._datas()
HOJE = D["hoje"]["iso"]
ONTEM = D["ontem"]["iso"]
ANTEONTEM = (datetime.now(TZ) - timedelta(days=2)).strftime("%Y-%m-%d")
TRES_D = (datetime.now(TZ) - timedelta(days=2)).strftime("%Y-%m-%d")  # janela de 3 dias (hoje incluso)
TRES_FECH_INI = (datetime.now(TZ) - timedelta(days=3)).strftime("%Y-%m-%d")  # início da janela de 3 dias FECHADOS (até ontem)
HOJE_BR = D["hoje"]["br"]
CAP_INICIO = "2026-06-16"
META_LEADS = 12500
ESTADO = os.getenv("REGRAS_CAPTACAO_ESTADO", "/root/agente/dados/caio/regras_captacao_estado.json")


def _leads(actions):
    d = {a["action_type"]: float(a["value"]) for a in (actions or [])}
    return int(d.get("offsite_complete_registration_add_meta_leads")
               or d.get("complete_registration") or d.get("lead") or 0)


def _gj(url, params, tries=8):
    """GET com retry no rate limit (code 17). Retorna json parseado (ou {})."""
    for i in range(tries):
        try:
            j = requests.get(url, params=params, timeout=60).json()
        except Exception:
            time.sleep(5); continue
        err = j.get("error") if isinstance(j, dict) else None
        if err and (err.get("code") == 17 or err.get("is_transient")):
            time.sleep(60); continue
        return j
    return {}


def conv_budget(novo_reais, antigo_reais):
    cents = int(str(int(antigo_reais))[:2])
    return int(round(novo_reais)) * 100 + cents


def clabel(name):
    nu = (name or "").upper()
    tipo = ("TESTE_PUB" if "TESTE_DE_PUBLICO" in nu else "TESTE" if "TESTE_DE_CRIATIVO" in nu
            else "ESCALA" if "ESCALA" in nu else "PUB.QUENTE" if "PUBLICO_QUENTE" in nu else "?")
    m = re.search(r"\[(C\d+)\]", name or "")
    return f"{tipo} {m.group(1)}" if m else tipo


def lead_campaigns():
    data = _gj(f"{API}/{ACCT}/campaigns", {
        "fields": "name,effective_status,daily_budget",
        "filtering": json.dumps([{"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]}]),
        "limit": 200, "access_token": TOKEN}).get("data", [])
    out = []
    for c in data:
        nu = (c.get("name") or "").upper()
        if "IE30" not in nu or "[LEADS]" not in nu or "CHECKLIST" in nu or "PRESENCIAL" in nu:
            continue
        db = c.get("daily_budget")
        tipo = ("teste" if "TESTE_DE_CRIATIVO" in nu
                else "teste_publico" if "TESTE_DE_PUBLICO" in nu
                else "cbo" if ("ESCALA" in nu or "PUBLICO_QUENTE" in nu) else "outro")
        out.append({"id": c["id"], "name": c["name"], "tag": clabel(c["name"]),
                    "cbo": db is not None, "budget": float(db) / 100 if db else None, "tipo": tipo})
    return out


def ads_full(cid):
    data = _gj(f"{API}/{cid}/ads", {
        "fields": "id,name,effective_status,adset_id,created_time", "limit": 200, "access_token": TOKEN}).get("data", [])
    out = {}
    for a in data:
        if a.get("effective_status") not in ("ACTIVE", "PENDING_REVIEW", "IN_PROCESS"):
            continue
        try:
            age = (datetime.now(TZ).date() - datetime.fromisoformat(a["created_time"]).date()).days
        except Exception:
            age = 99
        out[a["id"]] = {"name": a["name"], "adset": a.get("adset_id"), "age": age}
    return out


def ad_insights(cid, when):
    params = {"level": "ad", "fields": "ad_id,spend,actions", "limit": 300, "access_token": TOKEN}
    if when == "maximum":
        params["date_preset"] = "maximum"
    else:
        params["time_range"] = json.dumps({"since": when, "until": when})
    out = {}
    for x in _gj(f"{API}/{cid}/insights", params).get("data", []):
        sp = float(x.get("spend", 0)); ld = _leads(x.get("actions"))
        out[x["ad_id"]] = {"spend": sp, "leads": ld, "cpl": sp / ld if ld else None}
    return out


def ad_range(cid, since, until):
    out = {}
    for x in _gj(f"{API}/{cid}/insights", {
            "level": "ad", "fields": "ad_id,spend,actions", "limit": 300, "access_token": TOKEN,
            "time_range": json.dumps({"since": since, "until": until})}).get("data", []):
        sp = float(x.get("spend", 0)); ld = _leads(x.get("actions"))
        out[x["ad_id"]] = {"spend": sp, "leads": ld, "cpl": sp / ld if ld else None}
    return out


def adsets_full(cid):
    data = _gj(f"{API}/{cid}/adsets", {
        "fields": "id,name,effective_status,created_time", "limit": 200, "access_token": TOKEN}).get("data", [])
    out = {}
    for a in data:
        if a.get("effective_status") not in ("ACTIVE", "PENDING_REVIEW", "IN_PROCESS"):
            continue
        try:
            age = (datetime.now(TZ).date() - datetime.fromisoformat(a["created_time"]).date()).days
        except Exception:
            age = 99
        out[a["id"]] = {"name": a["name"], "age": age}
    return out


def adset_insights(cid, when):
    params = {"level": "adset", "fields": "adset_id,spend,actions", "limit": 300, "access_token": TOKEN}
    if when == "maximum":
        params["date_preset"] = "maximum"
    else:
        params["time_range"] = json.dumps({"since": when, "until": when})
    out = {}
    for x in _gj(f"{API}/{cid}/insights", params).get("data", []):
        sp = float(x.get("spend", 0)); ld = _leads(x.get("actions"))
        out[x["adset_id"]] = {"spend": sp, "leads": ld, "cpl": sp / ld if ld else None}
    return out


def camp_today(cid):
    d = _gj(f"{API}/{cid}/insights", {
        "level": "campaign", "fields": "spend,actions",
        "time_range": json.dumps({"since": HOJE, "until": HOJE}), "access_token": TOKEN}).get("data", [])
    if not d:
        return 0.0, 0, None
    sp = float(d[0].get("spend", 0)); ld = _leads(d[0].get("actions"))
    return sp, ld, (sp / ld if ld else None)


def camp_range(cid, since, until):
    d = _gj(f"{API}/{cid}/insights", {
        "level": "campaign", "fields": "spend,actions",
        "time_range": json.dumps({"since": since, "until": until}), "access_token": TOKEN}).get("data", [])
    if not d:
        return 0.0, 0
    return float(d[0].get("spend", 0)), _leads(d[0].get("actions"))


def set_budget(cid, cents):
    if DRY:
        return True
    return requests.post(f"{API}/{cid}", data={"daily_budget": cents, "access_token": TOKEN}, timeout=30).json().get("success")


def pause(oid):
    if DRY:
        return True
    return requests.post(f"{API}/{oid}", data={"status": "PAUSED", "access_token": TOKEN}, timeout=30).json().get("success")


def load_state():
    st = {}
    if os.path.exists(ESTADO):
        try:
            st = json.load(open(ESTADO))
        except Exception:
            st = {}
    if st.get("dia") != HOJE:        # vira o dia -> zera contador de reducoes
        st["dia"] = HOJE
        st["reducoes"] = {}
    st.setdefault("reducoes", {})
    st.setdefault("alerta_teste", {})
    st.setdefault("atencao_cbo", {})
    return st


def save_state(st):
    if DRY:
        return
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    json.dump(st, open(ESTADO, "w"), ensure_ascii=False)


def pct_reducao(cid, st):
    # sequencia: 1a reducao 10% -> 2a 30% -> 3a em diante 10%
    n = st["reducoes"].get(cid, 0)
    return 10 if n == 0 else 30 if n == 1 else 10


def reduzir(c, st, motivo, pct=None):
    old = c["budget"]
    p = pct if pct is not None else pct_reducao(c["id"], st)
    novo = round(old * (1 - p / 100))
    cents = conv_budget(novo, old)
    ok = set_budget(c["id"], cents)
    st["reducoes"][c["id"]] = st["reducoes"].get(c["id"], 0) + 1
    return f"⬇️ -{p}% <b>{c['tag']}</b>: R${old:.0f}→R${novo:.0f} ({motivo}){' [DRY]' if DRY else ''}{'' if ok else ' [FALHOU]'}"


def avaliar_cbo(c, ads, T, Y, L, st, n_ativos, momento, avisos):
    """CBO escala/quente. momento='intraday' (6h) ou 'meianoite'.
    +30% so na meia-noite. Reducao por DIAGNOSTICO de quem puxa o CPL:
      - criativo BOM de dia ruim puxando -> nao pausa, reduz 10%
      - CPL caindo ou faixa 3,80-5,00     -> reduz 10%
      - criativo RUIM (com volume) puxando -> reduz 30%
      - criativo que comecou HOJE ou irrelevante e estourou -> pausa o criativo
    """
    sp_c, ld_c, cpl_c = camp_today(c["id"])
    if sp_c <= 0:
        return n_ativos
    pct_spent = (sp_c / c["budget"] * 100) if c["budget"] else 0
    life_spend = sum(v["spend"] for v in L.values()) or 1
    prev = st["atencao_cbo"].get(c["id"])

    # +30% SO na meia-noite e so se CPL bom
    if momento == "meianoite" and ld_c and cpl_c is not None and cpl_c < IDEAL:
        old = c["budget"]; novo = round(old * 1.30)
        ok = set_budget(c["id"], conv_budget(novo, old))
        avisos.append(f"⬆️ +30% <b>{c['tag']}</b>: R${old:.0f}→R${novo:.0f} (CPL R${cpl_c:.2f} < R$3){' [DRY]' if DRY else ''}{'' if ok else ' [FALHOU]'}")
        return n_ativos

    # dentro do teto -> nada (limpa atencao)
    if cpl_c is None or cpl_c <= TETO:
        if prev is not None:
            st["atencao_cbo"].pop(c["id"], None)
            avisos.append(f"✅ <b>{c['tag']}</b> normalizou (CPL R${cpl_c:.2f}), saiu da atenção.")
        return n_ativos

    # CPL > teto, mas SÓ poda depois de gastar o mínimo do dia (>=20% do orçamento) — senão é ruído de manhã
    if momento != "meianoite" and pct_spent < MIN_SPEND_PCT:
        avisos.append(f"⏳ <b>{c['tag']}</b> CPL R${cpl_c:.2f}>teto, mas só {pct_spent:.0f}% do orçamento gasto — aguardo {MIN_SPEND_PCT}% pra avaliar.")
        return n_ativos

    # CPL > teto -> diagnostico do culpado (maior gastador caro hoje)
    culprit = None  # ("bom"|"ruim", aid)
    for aid, a in sorted(ads.items(), key=lambda kv: -(T.get(kv[0], {}).get("spend", 0))):
        t = T.get(aid, {"spend": 0, "leads": 0, "cpl": None})
        y = Y.get(aid, {"spend": 0, "leads": 0, "cpl": None})
        l = L.get(aid, {"spend": 0, "leads": 0, "cpl": None})
        caro_hoje = t["spend"] >= SPIKE_SPEND and (t["leads"] == 0 or (t["cpl"] and t["cpl"] > TETO))
        if not caro_hoje:
            continue
        bom_ontem = y["cpl"] is not None and y["cpl"] <= TETO
        comecou_hoje = (y["spend"] == 0) or (a["age"] <= 0)
        irrelevante = (l["leads"] <= 1) or (l["spend"] / life_spend < JUNK_SHARE)
        if bom_ontem:
            if culprit is None:
                culprit = ("bom", aid)              # bom de dia ruim -> nao pausa
        elif comecou_hoje or irrelevante:
            if n_ativos > 1:
                pause(aid); n_ativos -= 1
                avisos.append(f"🚫 CBO: pausei criativo <b>{a['name']}</b> ({c['tag']}) — {'começou hoje' if comecou_hoje else 'irrelevante'} e estourou (R${t['spend']:.0f}/{t['leads']}lead){' [DRY]' if DRY else ''}")
        elif culprit is None or culprit[0] == "bom":
            culprit = ("ruim", aid)                 # ruim com volume puxando

    # decidir % da reducao da campanha
    trend_down = prev is not None and cpl_c < prev
    culprit_bom = culprit is not None and culprit[0] == "bom"
    pct = 10 if (trend_down or culprit_bom or cpl_c <= 5.00) else 30
    motivo = f"CPL R${cpl_c:.2f}>teto, {pct_spent:.0f}% gasto"
    motivo += ", caindo" if trend_down else (", criativo bom dia ruim" if culprit_bom else ", criativo ruim puxando")
    nota = " + 🔔 atenção" if prev is None else ""
    st["atencao_cbo"][c["id"]] = cpl_c
    avisos.append(reduzir(c, st, motivo, pct=pct) + nota)
    return n_ativos


# ---------------- JOB PODA (teste diario + CBO 6h) ----------------
def job_poda(st):
    avisos = []
    feedback = []
    tot = {"hoje": [0.0, 0], "3d": [0.0, 0], "cum": [0.0, 0]}
    for c in lead_campaigns():
        ads = ads_full(c["id"])
        if not ads:
            continue
        sp_c, ld_c, cpl_c = camp_today(c["id"])
        feedback.append(fb_line(c, sp_c, ld_c, cpl_c))
        tot["hoje"][0] += sp_c; tot["hoje"][1] += ld_c
        s3, l3 = camp_range(c["id"], TRES_D, HOJE); tot["3d"][0] += s3; tot["3d"][1] += l3
        sc, lc = camp_range(c["id"], CAP_INICIO, HOJE); tot["cum"][0] += sc; tot["cum"][1] += lc
        T = ad_insights(c["id"], HOJE)
        n_ativos = len(ads)

        if c["tipo"] == "teste":
            Y = ad_insights(c["id"], ONTEM)
            A = ad_insights(c["id"], ANTEONTEM)
            MM = ad_range(c["id"], TRES_FECH_INI, ONTEM)  # 3 dias FECHADOS (D-3 -> ontem)
            for aid, a in ads.items():
                t = T.get(aid, {"spend": 0, "leads": 0, "cpl": None})
                y = Y.get(aid, {"spend": 0, "leads": 0, "cpl": None})
                a2 = A.get(aid, {"spend": 0, "leads": 0, "cpl": None})
                nome = a["name"]
                # 2 DIAS FECHADOS acima do teto (ontem + anteontem) -> pausa, mesmo com 3d barato
                if y["cpl"] and y["cpl"] > TETO and a2["cpl"] and a2["cpl"] > TETO:
                    if n_ativos <= 1:
                        avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) 2 dias fechados caro mas é o último. NÃO pausei.")
                    else:
                        pause(aid); pause(a["adset"]); n_ativos -= 1
                        avisos.append(f"🚫 TESTE: pausei <b>{nome}</b> — 2 dias fechados acima do teto (ontem R${y['cpl']:.2f} / anteontem R${a2['cpl']:.2f}){' [DRY]' if DRY else ''}")
                    st["alerta_teste"].pop(aid, None)
                    continue
                # GUARDRAIL média móvel: 3 dias FECHADOS com CPL médio caro e gasto relevante -> pausa
                # (pega o caro-no-acumulado / ziguezague que escapa do "2 dias seguidos")
                mm = MM.get(aid, {"spend": 0, "leads": 0, "cpl": None})
                if mm["cpl"] is not None and mm["cpl"] > MM_TETO and mm["spend"] >= MM_GASTO_MIN:
                    if n_ativos <= 1:
                        avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) média 3d cara (R${mm['cpl']:.2f}) mas é o último. NÃO pausei.")
                    else:
                        pause(aid); pause(a["adset"]); n_ativos -= 1
                        avisos.append(f"🚫 TESTE: pausei <b>{nome}</b> — média 3d fechados R${mm['cpl']:.2f} > R${MM_TETO:.2f} (R${mm['spend']:.0f} gasto){' [DRY]' if DRY else ''}")
                    st["alerta_teste"].pop(aid, None)
                    continue
                # GATE CUMULATIVO: acumulou gasto em dias FECHADOS com 0-1 lead -> pausa
                # (zumbi que sangra devagar: gasta abaixo do gate diário R$15,20 e nunca tem CPL definido, escapa das outras regras)
                if mm["spend"] >= CUM_GATE and mm["leads"] <= 1:
                    if n_ativos <= 1:
                        avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) R${mm['spend']:.0f} em dias fechados com {mm['leads']} lead mas é o último. NÃO pausei.")
                    else:
                        pause(aid); pause(a["adset"]); n_ativos -= 1
                        avisos.append(f"🚫 TESTE: pausei <b>{nome}</b> — gate cumulativo: R${mm['spend']:.0f} em dias fechados com {mm['leads']} lead{' [DRY]' if DRY else ''}")
                    st["alerta_teste"].pop(aid, None)
                    continue
                veterano = a["age"] >= NEW_AGE and y["cpl"] is not None and y["cpl"] <= TETO
                gasto_ok = t["spend"] >= GATE
                # C) veterano bom (foi bem ONTEM) com dia ruim hoje
                if veterano:
                    if gasto_ok and t["cpl"] is not None and t["cpl"] > TETO:
                        if st["alerta_teste"].get(aid) and st["alerta_teste"][aid] != HOJE:
                            if n_ativos <= 1:
                                avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) 2º dia ruim mas é o último. NÃO pausei.")
                            else:
                                pause(aid); pause(a["adset"]); n_ativos -= 1
                                avisos.append(f"🚫 TESTE: pausei veterano <b>{nome}</b> — 2 dias ruins seguidos (CPL hoje R${t['cpl']:.2f}){' [DRY]' if DRY else ''}")
                            st["alerta_teste"].pop(aid, None)
                        elif not st["alerta_teste"].get(aid):
                            st["alerta_teste"][aid] = HOJE
                            avisos.append(f"🔔 ALERTA <b>{nome}</b> ({c['tag']}) — veterano com dia ruim (CPL R${t['cpl']:.2f}, R${t['spend']:.0f} hoje). Reavalio amanhã.")
                    elif st["alerta_teste"].get(aid) and t["cpl"] is not None and t["cpl"] <= TETO:
                        st["alerta_teste"].pop(aid, None)
                        avisos.append(f"✅ <b>{nome}</b> normalizou (CPL R${t['cpl']:.2f}), tirei o alerta.")
                    continue
                # nao-veterano: SO julga depois de gastar R$15,20 no dia
                if not gasto_ok:
                    continue
                # A) sem tracao
                if t["leads"] <= 1:
                    if n_ativos <= 1:
                        avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) R${t['spend']:.0f}/{t['leads']}lead hoje mas é o último. NÃO pausei.")
                        continue
                    pause(aid); pause(a["adset"]); n_ativos -= 1
                    avisos.append(f"🚫 TESTE: pausei <b>{nome}</b> — R${t['spend']:.0f} hoje com {t['leads']} lead{' [DRY]' if DRY else ''}")
                    continue
                # B) caro (>=2 leads, CPL>teto): 2o dia corta, 1o dia espera
                if t["cpl"] is not None and t["cpl"] > TETO:
                    if a["age"] >= 1:
                        if n_ativos <= 1:
                            avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) caro 2º dia mas é o último. NÃO pausei.")
                        else:
                            pause(aid); pause(a["adset"]); n_ativos -= 1
                            avisos.append(f"🚫 TESTE: pausei <b>{nome}</b> — 2º dia caro (CPL R${t['cpl']:.2f}, R${t['spend']:.0f} hoje){' [DRY]' if DRY else ''}")
                    else:
                        avisos.append(f"⏳ <b>{nome}</b> ({c['tag']}) caro no 1º dia (CPL R${t['cpl']:.2f}) — espero +24h.")

        elif c["tipo"] == "teste_publico":
            # testa AUDIENCIA (criativo é o mesmo provado em todos). Corta o CONJUNTO, nunca o criativo.
            asets = adsets_full(c["id"])
            TA = adset_insights(c["id"], HOJE)
            YA = adset_insights(c["id"], ONTEM)
            n_pub = len(asets)
            for asid, a in asets.items():
                t = TA.get(asid, {"spend": 0, "leads": 0, "cpl": None})
                y = YA.get(asid, {"spend": 0, "leads": 0, "cpl": None})
                nome = a["name"]
                veterano = a["age"] >= NEW_AGE and y["cpl"] is not None and y["cpl"] <= TETO
                gasto_ok = t["spend"] >= GATE
                if veterano:
                    if gasto_ok and t["cpl"] is not None and t["cpl"] > TETO:
                        if st["alerta_teste"].get(asid) and st["alerta_teste"][asid] != HOJE:
                            if n_pub <= 1:
                                avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) público 2 dias ruim mas é o último. NÃO pausei.")
                            else:
                                pause(asid); n_pub -= 1
                                avisos.append(f"🚫 PÚBLICO: pausei conjunto <b>{nome}</b> ({c['tag']}) — 2 dias ruins (CPL hoje R${t['cpl']:.2f}){' [DRY]' if DRY else ''}")
                            st["alerta_teste"].pop(asid, None)
                        elif not st["alerta_teste"].get(asid):
                            st["alerta_teste"][asid] = HOJE
                            avisos.append(f"🔔 ALERTA público <b>{nome}</b> ({c['tag']}) — bom mas dia ruim (CPL R${t['cpl']:.2f}). Reavalio amanhã.")
                    elif st["alerta_teste"].get(asid) and t["cpl"] is not None and t["cpl"] <= TETO:
                        st["alerta_teste"].pop(asid, None)
                        avisos.append(f"✅ público <b>{nome}</b> normalizou (CPL R${t['cpl']:.2f}), tirei o alerta.")
                    continue
                if not gasto_ok:
                    continue
                if t["leads"] <= 1:
                    if n_pub <= 1:
                        avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) R${t['spend']:.0f}/{t['leads']}lead mas é o último público. NÃO pausei.")
                        continue
                    pause(asid); n_pub -= 1
                    avisos.append(f"🚫 PÚBLICO: pausei conjunto <b>{nome}</b> ({c['tag']}) — R${t['spend']:.0f} com {t['leads']} lead{' [DRY]' if DRY else ''}")
                    continue
                if t["cpl"] is not None and t["cpl"] > TETO:
                    if a["age"] >= 1:
                        if n_pub <= 1:
                            avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) caro 2º dia mas é o último público. NÃO pausei.")
                        else:
                            pause(asid); n_pub -= 1
                            avisos.append(f"🚫 PÚBLICO: pausei conjunto <b>{nome}</b> ({c['tag']}) — 2º dia caro (CPL R${t['cpl']:.2f}){' [DRY]' if DRY else ''}")
                    else:
                        avisos.append(f"⏳ público <b>{nome}</b> ({c['tag']}) caro no 1º dia (CPL R${t['cpl']:.2f}) — espero +24h.")

        elif c["tipo"] == "cbo":
            Y = ad_insights(c["id"], ONTEM)
            L = ad_insights(c["id"], "maximum")
            n_ativos = avaliar_cbo(c, ads, T, Y, L, st, n_ativos, "intraday", avisos)

    save_state(st)
    enviar("poda/CBO 6h", avisos, feedback, tot)


# ---------------- JOB ORCAMENTO (meia-noite) ----------------
def job_orcamento(st):
    avisos = []
    feedback = []
    tot = {"hoje": [0.0, 0], "3d": [0.0, 0], "cum": [0.0, 0]}
    cbo = []
    for c in lead_campaigns():
        sp, ld, cpl = camp_today(c["id"])
        feedback.append(fb_line(c, sp, ld, cpl))
        tot["hoje"][0] += sp; tot["hoje"][1] += ld
        s3, l3 = camp_range(c["id"], TRES_D, HOJE); tot["3d"][0] += s3; tot["3d"][1] += l3
        sc, lc = camp_range(c["id"], CAP_INICIO, HOJE); tot["cum"][0] += sc; tot["cum"][1] += lc
        if c["tipo"] == "cbo" and c["cbo"]:
            cbo.append(c)
    for c in cbo:
        ads = ads_full(c["id"])
        if not ads:
            continue
        T = ad_insights(c["id"], HOJE)
        Y = ad_insights(c["id"], ONTEM)
        L = ad_insights(c["id"], "maximum")
        avaliar_cbo(c, ads, T, Y, L, st, len(ads), "meianoite", avisos)
    save_state(st)
    enviar("orçamento meia-noite", avisos, feedback, tot)


def fb_line(c, sp, ld, cpl):
    cpltxt = f"R${cpl:.2f}" if cpl else "—"
    flag = " ⚠️" if (cpl and cpl > TETO) else (" ✅" if cpl else "")
    return f"• <b>{c['tag']}</b>: R${sp:.0f} · {ld} leads · CPL {cpltxt}{flag}"


def enviar(rotulo, avisos, feedback=None, tot=None):
    cab = "🤖 <b>Captação Caio</b> · " + rotulo + (" [DRY-RUN]" if DRY else "") + f"\n<i>{HOJE_BR}</i>"
    if tot:
        h = tot["hoje"]; t3 = tot["3d"]; cum = tot["cum"]
        cpl_h = h[0] / h[1] if h[1] else 0
        cpl_3 = t3[0] / t3[1] if t3[1] else 0
        saude = "🟢 conta saudável" if (cpl_3 and cpl_3 <= TETO) else "⚠️ atenção no CPL"
        meta_pct = cum[1] / META_LEADS * 100
        cab += f"  ·  {saude}\n📊 Hoje: R${h[0]:.0f} · {h[1]}L · CPL R${cpl_h:.2f}  |  3d: CPL R${cpl_3:.2f}  |  Meta {cum[1]}/{META_LEADS} ({meta_pct:.0f}%)"
    blocks = [cab]
    if feedback:
        blocks.append("<b>Campanhas (hoje):</b>\n" + "\n".join(feedback))
    blocks.append("🔧 <b>Régua fez:</b>\n" + ("\n".join(avisos) if avisos else "Nenhuma ação nessa janela."))
    msg = "\n\n".join(blocks)
    if DRY:
        print(msg)
    else:
        cc._enviar_telegram(msg)
        print(msg)


if __name__ == "__main__":
    st = load_state()
    if JOB == "orcamento":
        job_orcamento(st)
    else:
        job_poda(st)
