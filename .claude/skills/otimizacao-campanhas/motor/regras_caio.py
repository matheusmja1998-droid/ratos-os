"""
Regras automáticas de orçamento + poda de criativo do Checklist do Caio.
Roda todo dia ~23:30 (cron). Avalia o DIA corrente (quase fechado).

REGRAS (Matheus 17/06/2026):
1) ORÇAMENTO — só CBO (ESCALA, ADVANTAGE+), nunca ABO. CPA real do dia:
   < R$20 -> +30% | R$20-30 -> nada | > R$30 -> -30% (0 venda gastando >R$30 reduz).
   Convenção budget: centavos do novo = 2 primeiros dígitos do inteiro antigo.
2) PODA — todas as campanhas. Criativo estourou = CPA real > R$40 (ou 0 venda gastando >R$40).
   Estourou 2 dias SEGUIDOS -> pausa. 1 dia e normalizou -> mantém.
3) TELEGRAM em todo aumento/redução de orçamento e toda pausa.
4) GUARDRAIL: campanha CBO não-teste nunca com < 4 criativos ativos -> não pausa, alerta.
"""
import os, re, sys, json, time
import requests
import checklist_caio as cc

DRY = "--dry" in sys.argv
CPA_SOBE = 20.0
CPA_REDUZ = 30.0
SOBE_PCT = 0.30
REDUZ_PCT = 0.30
CRIATIVO_TETO = 40.0
MIN_CRIATIVOS = 4
ESTADO = "/root/agente/dados/caio/regras_estado.json"

D = cc._datas()
HOJE_ISO = D["hoje"]["iso"]
HOJE_BR = D["hoje"]["br"]
TOKEN = cc._token()
API = cc.API
ACCT = cc.ACCT


def _get(path, params, tries=4):
    """GET com retry/backoff. Levanta RuntimeError se falhar todas as tentativas."""
    last = None
    for i in range(tries):
        try:
            r = requests.get(f"{API}/{path}", params={**params, "access_token": TOKEN}, timeout=40)
            j = r.json()
            if r.status_code == 200 and "error" not in j:
                return j
            last = j.get("error", j)
        except Exception as e:
            last = str(e)
        time.sleep(4 * (i + 1))
    raise RuntimeError(f"GET {path} falhou: {str(last)[:160]}")


def ckey(name):
    n = (name or "").upper()
    m = re.search(r"(VD_\d+)", n)
    if m:
        return m.group(1)
    m = re.search(r"(IMG\d+|VIDEO_\d+)", n)
    return m.group(1) if m else n


def conv_budget(novo_reais, antigo_reais):
    cents = int(str(int(antigo_reais))[:2])
    return int(round(novo_reais)) * 100 + cents


def campaigns_full():
    j = _get(f"{ACCT}/campaigns", {
        "fields": "name,objective,effective_status,daily_budget",
        "filtering": json.dumps([{"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]}]),
        "limit": 200})
    out = []
    for c in j.get("data", []):
        if "CHECKLIST" in c["name"].upper() and c.get("objective") == "OUTCOME_SALES":
            db = c.get("daily_budget")
            out.append({"id": c["id"], "name": c["name"], "tag": cc._tag(c["name"]),
                        "cbo": db is not None, "budget": float(db) / 100 if db else None,
                        "teste": "TESTE_DE_CRIATIVO" in c["name"].upper()})
    return out


def active_ads(camp_id):
    """{ad_id: name} dos ATIVOS, ou None se a API falhar/vier vazia.
    Campanha de Checklist ativa SEMPRE tem ad — então vazio = glitch/rate-limit,
    tratamos como falha de leitura (None) pra NÃO dar alerta falso de '0 criativos'."""
    for tent in range(2):
        try:
            j = _get(f"{camp_id}/ads", {"fields": "id,name,effective_status", "limit": 300})
        except RuntimeError:
            return None
        ativos = {a["id"]: a["name"] for a in j.get("data", []) if a.get("effective_status") == "ACTIVE"}
        if ativos:
            return ativos
        time.sleep(5)
    return None


def ad_spend(camp_id):
    """{ckey: gasto_hoje} ou None se falhar."""
    try:
        j = _get(f"{camp_id}/insights", {
            "level": "ad", "fields": "ad_name,spend",
            "time_range": json.dumps({"since": HOJE_ISO, "until": HOJE_ISO}), "limit": 300})
    except RuntimeError:
        return None
    out = {}
    for x in j.get("data", []):
        out[ckey(x["ad_name"])] = out.get(ckey(x["ad_name"]), 0) + float(x.get("spend", 0))
    return out


def sales_por_criativo(tag):
    s = {}
    for r in cc._load_sales():
        if r["data"] == HOJE_BR and cc._tag(r["utm_term"]) == tag:
            k = ckey(r["utm_content"])
            s[k] = s.get(k, 0) + 1
    return s


def set_budget(cid, cents):
    if DRY:
        return True
    return requests.post(f"{API}/{cid}", data={"daily_budget": cents, "access_token": TOKEN}, timeout=30).json().get("success")


def pause_ad(aid):
    if DRY:
        return True
    return requests.post(f"{API}/{aid}", data={"status": "PAUSED", "access_token": TOKEN}, timeout=30).json().get("success")


def main():
    camps = campaigns_full()
    avisos = []

    # ---- 1) ORÇAMENTO (CBO) ----
    for c in camps:
        if not c["cbo"]:
            continue
        spend = sum(float(x.get("spend", 0)) for x in cc._insights(c["id"], "campaign", HOJE_ISO))
        if spend <= 0:
            continue
        v = cc.sales_count(HOJE_BR, tag=c["tag"])
        cpa = spend / v if v else None
        old = c["budget"]
        novo = acao = None
        if v and cpa < CPA_SOBE:
            novo = round(old * (1 + SOBE_PCT)); acao = f"⬆️ +30% (CPA R${cpa:.2f} < R$20)"
        elif (v and cpa > CPA_REDUZ) or (not v and spend > CPA_REDUZ):
            novo = round(old * (1 - REDUZ_PCT))
            acao = f"⬇️ -30% (CPA {'R$'+format(cpa,'.2f') if v else 'sem venda, R$'+format(spend,'.0f')+' gasto'})"
        if novo and novo != old:
            cents = conv_budget(novo, old)
            ok = set_budget(c["id"], cents)
            avisos.append(f"{acao}\n<b>{c['tag']}</b> (CBO): R${old:.0f} → R${novo:.0f}{' [DRY]' if DRY else ''}{'' if ok else ' [FALHOU]'}")
        time.sleep(1)

    # ---- 2) PODA + GUARDRAIL (por criativo distinto) ----
    estado = {}
    if os.path.exists(ESTADO):
        try:
            estado = json.load(open(ESTADO))
        except Exception:
            estado = {}
    novo_estado = {}
    for c in camps:
        ativos = active_ads(c["id"])
        if ativos is None:
            avisos.append(f"⚠️ Não li os criativos da {c['tag']} (erro/limite da API). Pulei a poda dela nessa rodada.")
            continue
        gasto = ad_spend(c["id"])
        if gasto is None:
            avisos.append(f"⚠️ Não li o gasto dos criativos da {c['tag']} (erro/limite da API). Pulei a poda dela.")
            continue
        vendas = sales_por_criativo(c["tag"])
        # agrupa ads ATIVOS por criativo distinto
        por_ck = {}
        for aid, nome in ativos.items():
            por_ck.setdefault(ckey(nome), []).append(aid)
        n_criativos = len(por_ck)
        for k, ad_ids in por_ck.items():
            sp = gasto.get(k, 0.0); ve = vendas.get(k, 0)
            estourou = (ve and sp / ve > CRIATIVO_TETO) or (not ve and sp > CRIATIVO_TETO)
            sk = f"{c['id']}:{k}"
            novo_estado[sk] = {"estourou": bool(estourou), "tag": c["tag"], "criativo": k}
            if estourou and estado.get(sk, {}).get("estourou"):
                protegido = c["cbo"] and not c["teste"] and n_criativos <= MIN_CRIATIVOS
                cpatxt = f"R${sp/ve:.2f}" if ve else f"sem venda, R${sp:.0f} gasto"
                if protegido:
                    avisos.append(f"⚠️ <b>{k}</b> estourou 2 dias na {c['tag']} (CBO), mas pausar deixaria <4 criativos. NÃO pausei — decide.")
                else:
                    for aid in ad_ids:
                        pause_ad(aid)
                    n_criativos -= 1
                    avisos.append(f"🚫 Pausado <b>{k}</b> ({c['tag']}) — CPA real >R$40 por 2 dias ({cpatxt}){' [DRY]' if DRY else ''}")
        if c["cbo"] and not c["teste"] and n_criativos < MIN_CRIATIVOS:
            avisos.append(f"⚠️ <b>{c['tag']}</b> (CBO) com {n_criativos} criativos ativos (<{MIN_CRIATIVOS}). Repor criativo.")
        time.sleep(1)

    if not DRY:
        os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
        json.dump(novo_estado, open(ESTADO, "w"), ensure_ascii=False)

    if avisos:
        cab = "🤖 <b>Regras automáticas — Checklist Caio</b>" + (" [DRY-RUN]" if DRY else "") + f"\n<i>{HOJE_BR}</i>\n\n"
        msg = cab + "\n\n".join(avisos)
        print(msg)
        if not DRY:
            cc._enviar_telegram(msg)
    else:
        print("Nenhuma ação hoje.")


if __name__ == "__main__":
    main()
