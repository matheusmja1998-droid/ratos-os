"""
Regras automaticas de CAPTACAO DE LEAD da FERNANDA (auto-executa, avisa no Telegram).
Dedicado a Fernanda — separado do Caio (conta/token/tag/thresholds/telegram proprios).

ESTRUTURA (max 3-4 campanhas):
  - TESTE: campanha de aprovar/testar criativo (ABO). Identificada por "TESTE" no nome.
  - ESCALA: 1-2 campanhas de escala (CBO) puxando criativos aprovados. "ESCALA" no nome.
Filtra captacao por TAG (AGV_AGO_26) no nome. Exclui fundo de funil (replay/carrinho/rmkt/vip).
Lead = COMPLETE_REGISTRATION / lead do Gerenciador. CPL = gasto/leads.
METAS: ideal R$10 | teto R$14 (override por env CPL_IDEAL / CPL_TETO).

== TESTE DE CRIATIVO (avalia por dia; so julga depois de gastar GATE no DIA) ==
  - veterano (>=2 dias e CPL bom ONTEM) com dia ruim hoje -> alerta; 2 dias seguidos ruim -> pausa
  - sem tracao: gastou >=GATE hoje com 0-1 lead -> pausa
  - caro (>=2 leads, CPL>teto): 1o dia espera +24h; 2o dia (age>=1) e gastou GATE -> pausa
  - toda pausa no teste = anuncio E conjunto

== CBO ESCALA (verifica a cada 6h + ajuste de orcamento meia-noite) ==
  - criativo ruim irrelevante que estourou -> pausa o criativo + reduz 10%
  - campanha acima do teto -> reduz na SEQUENCIA (1a 10%, 2a 30%, dps 10%) + atencao
  - Meia-noite: CPL < ideal -> +30% | ideal-teto -> mantem | > teto -> reduz

Uso: python3 regras_captacao_fernanda.py --job poda|orcamento [--dry]
"""
import os, sys, json, re, time, requests
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

DRY = "--dry" in sys.argv
JOB = sys.argv[sys.argv.index("--job") + 1] if "--job" in sys.argv else "poda"

API = "https://graph.facebook.com/v21.0"
ACCT = os.getenv("FERNANDA_AD_ACCOUNT", "act_362367444")
TOKEN = os.environ["META_TOKEN_FERNANDA"]
TZ = ZoneInfo("America/Sao_Paulo")

IDEAL = float(os.getenv("CPL_IDEAL", "10"))
TETO = float(os.getenv("CPL_TETO", "14"))
GATE = float(os.getenv("CPL_GATE", "40"))        # gasto minimo no DIA pra avaliar/cortar criativo no teste
NEW_AGE = 2
JUNK_SHARE = 0.05
SPIKE_SPEND = float(os.getenv("CPL_SPIKE", "25"))
MIN_SPEND_PCT = 20
MM_TETO = float(os.getenv("CPL_MM_TETO", "16"))  # media movel 3d fechados acima -> pausa
MM_GASTO_MIN = float(os.getenv("CPL_MM_GASTO_MIN", "80"))
META_LEADS = int(os.getenv("META_LEADS", "5600"))
CAP_INICIO = os.getenv("CAP_INICIO", "2026-06-25")
TAG = os.getenv("CAPTACAO_TAG", "AGV_AGO_26").upper()
EXCLUI = [x.strip().upper() for x in os.getenv("CAPTACAO_EXCLUI",
          "REPLAY,CARRINHO,CONVER,RMKT,REMARKET,VIP,TSUNAMI,PRESENCIAL").split(",") if x.strip()]
ESTADO = os.getenv("REGRAS_CAPTACAO_ESTADO", "/root/agente/dados/fernanda/regras_captacao_estado.json")

LEAD_KEYS = ("offsite_complete_registration_add_meta_leads", "complete_registration",
             "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "lead", "leadgen_grouped")


def _datas():
    now = datetime.now(TZ)
    o = now - timedelta(days=1)
    return {"hoje": {"iso": now.strftime("%Y-%m-%d"), "br": now.strftime("%d/%m")},
            "ontem": {"iso": o.strftime("%Y-%m-%d"), "br": o.strftime("%d/%m")}}


D = _datas()
HOJE = D["hoje"]["iso"]
ONTEM = D["ontem"]["iso"]
ANTEONTEM = (datetime.now(TZ) - timedelta(days=2)).strftime("%Y-%m-%d")
TRES_D = (datetime.now(TZ) - timedelta(days=2)).strftime("%Y-%m-%d")
TRES_FECH_INI = (datetime.now(TZ) - timedelta(days=3)).strftime("%Y-%m-%d")
HOJE_BR = D["hoje"]["br"]


def _enviar_telegram(msg):
    tok = os.getenv("TELEGRAM_BOT_TOKEN_ROTA_WV") or os.getenv("TELEGRAM_BOT_TOKEN")
    chat = os.getenv("TELEGRAM_CHAT_ID_MATHEUS") or os.getenv("TELEGRAM_CHAT_ID")
    for i in range(0, len(msg), 3800):
        try:
            requests.post(f"https://api.telegram.org/bot{tok}/sendMessage",
                          data={"chat_id": chat, "text": msg[i:i+3800], "parse_mode": "HTML"}, timeout=30)
        except Exception:
            pass


def _leads(actions):
    d = {a["action_type"]: float(a["value"]) for a in (actions or [])}
    for k in LEAD_KEYS:
        if k in d:
            return int(d[k])
    return 0


def _gj(url, params, tries=8):
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
    tipo = ("TESTE" if "TESTE" in nu else "ESCALA" if "ESCALA" in nu else "?")
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
        if TAG not in nu or any(x in nu for x in EXCLUI):
            continue
        tipo = "teste" if "TESTE" in nu else "cbo" if "ESCALA" in nu else "outro"
        if tipo == "outro":
            continue
        db = c.get("daily_budget")
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
    if st.get("dia") != HOJE:
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
    sp_c, ld_c, cpl_c = camp_today(c["id"])
    if sp_c <= 0:
        return n_ativos
    pct_spent = (sp_c / c["budget"] * 100) if c["budget"] else 0
    life_spend = sum(v["spend"] for v in L.values()) or 1
    prev = st["atencao_cbo"].get(c["id"])

    if momento == "meianoite" and ld_c and cpl_c is not None and cpl_c < IDEAL:
        old = c["budget"]; novo = round(old * 1.30)
        ok = set_budget(c["id"], conv_budget(novo, old))
        avisos.append(f"⬆️ +30% <b>{c['tag']}</b>: R${old:.0f}→R${novo:.0f} (CPL R${cpl_c:.2f} < R${IDEAL:.0f}){' [DRY]' if DRY else ''}{'' if ok else ' [FALHOU]'}")
        return n_ativos

    if cpl_c is None or cpl_c <= TETO:
        if prev is not None:
            st["atencao_cbo"].pop(c["id"], None)
            avisos.append(f"✅ <b>{c['tag']}</b> normalizou (CPL R${cpl_c:.2f}), saiu da atenção.")
        return n_ativos

    if momento != "meianoite" and pct_spent < MIN_SPEND_PCT:
        avisos.append(f"⏳ <b>{c['tag']}</b> CPL R${cpl_c:.2f}>teto, mas só {pct_spent:.0f}% do orçamento gasto — aguardo {MIN_SPEND_PCT}%.")
        return n_ativos

    culprit = None
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
                culprit = ("bom", aid)
        elif comecou_hoje or irrelevante:
            if n_ativos > 1:
                pause(aid); n_ativos -= 1
                avisos.append(f"🚫 CBO: pausei criativo <b>{a['name']}</b> ({c['tag']}) — {'começou hoje' if comecou_hoje else 'irrelevante'} e estourou (R${t['spend']:.0f}/{t['leads']}lead){' [DRY]' if DRY else ''}")
        elif culprit is None or culprit[0] == "bom":
            culprit = ("ruim", aid)

    trend_down = prev is not None and cpl_c < prev
    culprit_bom = culprit is not None and culprit[0] == "bom"
    pct = 10 if (trend_down or culprit_bom or cpl_c <= TETO * 1.35) else 30
    motivo = f"CPL R${cpl_c:.2f}>teto, {pct_spent:.0f}% gasto"
    motivo += ", caindo" if trend_down else (", criativo bom dia ruim" if culprit_bom else ", criativo ruim puxando")
    nota = " + 🔔 atenção" if prev is None else ""
    st["atencao_cbo"][c["id"]] = cpl_c
    avisos.append(reduzir(c, st, motivo, pct=pct) + nota)
    return n_ativos


def job_poda(st):
    avisos = []; feedback = []
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
            MM = ad_range(c["id"], TRES_FECH_INI, ONTEM)
            for aid, a in ads.items():
                t = T.get(aid, {"spend": 0, "leads": 0, "cpl": None})
                y = Y.get(aid, {"spend": 0, "leads": 0, "cpl": None})
                a2 = A.get(aid, {"spend": 0, "leads": 0, "cpl": None})
                nome = a["name"]
                if y["cpl"] and y["cpl"] > TETO and a2["cpl"] and a2["cpl"] > TETO:
                    if n_ativos <= 1:
                        avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) 2 dias fechados caro mas é o último. NÃO pausei.")
                    else:
                        pause(aid); pause(a["adset"]); n_ativos -= 1
                        avisos.append(f"🚫 TESTE: pausei <b>{nome}</b> — 2 dias fechados acima do teto (ontem R${y['cpl']:.2f} / anteontem R${a2['cpl']:.2f}){' [DRY]' if DRY else ''}")
                    st["alerta_teste"].pop(aid, None); continue
                mm = MM.get(aid, {"spend": 0, "leads": 0, "cpl": None})
                if mm["cpl"] is not None and mm["cpl"] > MM_TETO and mm["spend"] >= MM_GASTO_MIN:
                    if n_ativos <= 1:
                        avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) média 3d cara (R${mm['cpl']:.2f}) mas é o último. NÃO pausei.")
                    else:
                        pause(aid); pause(a["adset"]); n_ativos -= 1
                        avisos.append(f"🚫 TESTE: pausei <b>{nome}</b> — média 3d fechados R${mm['cpl']:.2f} > R${MM_TETO:.2f} (R${mm['spend']:.0f} gasto){' [DRY]' if DRY else ''}")
                    st["alerta_teste"].pop(aid, None); continue
                veterano = a["age"] >= NEW_AGE and y["cpl"] is not None and y["cpl"] <= TETO
                gasto_ok = t["spend"] >= GATE
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
                if not gasto_ok:
                    continue
                if t["leads"] <= 1:
                    if n_ativos <= 1:
                        avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) R${t['spend']:.0f}/{t['leads']}lead hoje mas é o último. NÃO pausei."); continue
                    pause(aid); pause(a["adset"]); n_ativos -= 1
                    avisos.append(f"🚫 TESTE: pausei <b>{nome}</b> — R${t['spend']:.0f} hoje com {t['leads']} lead{' [DRY]' if DRY else ''}"); continue
                if t["cpl"] is not None and t["cpl"] > TETO:
                    if a["age"] >= 1:
                        if n_ativos <= 1:
                            avisos.append(f"⚠️ <b>{nome}</b> ({c['tag']}) caro 2º dia mas é o último. NÃO pausei.")
                        else:
                            pause(aid); pause(a["adset"]); n_ativos -= 1
                            avisos.append(f"🚫 TESTE: pausei <b>{nome}</b> — 2º dia caro (CPL R${t['cpl']:.2f}, R${t['spend']:.0f} hoje){' [DRY]' if DRY else ''}")
                    else:
                        avisos.append(f"⏳ <b>{nome}</b> ({c['tag']}) caro no 1º dia (CPL R${t['cpl']:.2f}) — espero +24h.")

        elif c["tipo"] == "cbo":
            Y = ad_insights(c["id"], ONTEM)
            L = ad_insights(c["id"], "maximum")
            n_ativos = avaliar_cbo(c, ads, T, Y, L, st, n_ativos, "intraday", avisos)

    save_state(st)
    enviar("poda/CBO 6h", avisos, feedback, tot)


def job_orcamento(st):
    avisos = []; feedback = []
    tot = {"hoje": [0.0, 0], "3d": [0.0, 0], "cum": [0.0, 0]}; cbo = []
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
        T = ad_insights(c["id"], HOJE); Y = ad_insights(c["id"], ONTEM); L = ad_insights(c["id"], "maximum")
        avaliar_cbo(c, ads, T, Y, L, st, len(ads), "meianoite", avisos)
    save_state(st)
    enviar("orçamento meia-noite", avisos, feedback, tot)


def fb_line(c, sp, ld, cpl):
    cpltxt = f"R${cpl:.2f}" if cpl else "—"
    flag = " ⚠️" if (cpl and cpl > TETO) else (" ✅" if cpl else "")
    return f"• <b>{c['tag']}</b>: R${sp:.0f} · {ld} leads · CPL {cpltxt}{flag}"


def enviar(rotulo, avisos, feedback=None, tot=None):
    cab = "🤖 <b>Captação Fernanda</b> · " + rotulo + (" [DRY-RUN]" if DRY else "") + f"\n<i>{HOJE_BR}</i>"
    if tot:
        h = tot["hoje"]; t3 = tot["3d"]; cum = tot["cum"]
        cpl_h = h[0] / h[1] if h[1] else 0
        cpl_3 = t3[0] / t3[1] if t3[1] else 0
        saude = "🟢 conta saudável" if (cpl_3 and cpl_3 <= TETO) else "⚠️ atenção no CPL"
        meta_pct = cum[1] / META_LEADS * 100 if META_LEADS else 0
        cab += f"  ·  {saude}\n📊 Hoje: R${h[0]:.0f} · {h[1]}L · CPL R${cpl_h:.2f}  |  3d: CPL R${cpl_3:.2f}  |  Meta {cum[1]}/{META_LEADS} ({meta_pct:.0f}%)"
    blocks = [cab]
    if feedback:
        blocks.append("<b>Campanhas (hoje):</b>\n" + "\n".join(feedback))
    blocks.append("🔧 <b>Régua fez:</b>\n" + ("\n".join(avisos) if avisos else "Nenhuma ação nessa janela."))
    msg = "\n\n".join(blocks)
    print(msg)
    if not DRY:
        _enviar_telegram(msg)


if __name__ == "__main__":
    st = load_state()
    if JOB == "orcamento":
        job_orcamento(st)
    else:
        job_poda(st)
