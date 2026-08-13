"""
Checklist Honda (campanhas de VENDA do Caio) — custo por venda REAL.

Cruza GASTO do Meta (token Caio) com VENDAS REAIS da planilha "Vendas gerais"
(pixel infla ~30%, por isso a verdade vem da planilha via UTM).

Mapa de UTM da planilha:
  utm_term    = campanha   (col M / index 11)
  utm_medium  = conjunto   (col J / index 9)
  utm_content = criativo   (col K / index 10)

Usos:
  python3 checklist_caio.py --daily    # report do dia (hoje+ontem) -> Telegram Caio
  python3 checklist_caio.py --print    # mesmo report, so imprime
  python3 checklist_caio.py custo conjunto ESCALA hoje   # drill-down manual

Funcao custo() e importada pela tool 'custo_checklist' do bot_listener (drill-down via Telegram).
"""
import os, json, re, sys, requests
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

load_dotenv(os.environ.get("AGENTE_ENV", "/root/agente/.env"))

API = "https://graph.facebook.com/v21.0"
ACCT = "act_191737889662177"
SHEET_ID = "1yYf7mz3P1YxxOPddSD-EO2r634FjAHQmMcnUFfydcfA"
SHEET_RANGE = "Vendas gerais!A2:M10000"
TZ = ZoneInfo("America/Sao_Paulo")


def _token():
    return os.getenv("META_TOKEN_CAIO")


def _skey():
    return os.getenv("GOOGLE_SHEETS_API_KEY")


def _datas():
    now = datetime.now(TZ)
    ontem = now - timedelta(days=1)
    return {
        "hoje": {"iso": now.strftime("%Y-%m-%d"), "br": now.strftime("%d/%m/%Y"), "label": "hoje " + now.strftime("%d/%m")},
        "ontem": {"iso": ontem.strftime("%Y-%m-%d"), "br": ontem.strftime("%d/%m/%Y"), "label": "ontem " + ontem.strftime("%d/%m")},
    }


def _tag(name):
    """3o grupo entre colchetes = identificador da campanha (ESCALA, TESTE_DE_PUBLICO, ADVANTAGE+)."""
    g = re.findall(r"\[([^\]]+)\]", name or "")
    return g[2] if len(g) > 2 else (name or "")


def _vd(s):
    m = re.search(r"(VD[_ ]?\d+)", (s or "").upper())
    return m.group(1).replace(" ", "_") if m else None


def active_campaigns():
    """Campanhas ATIVAS de VENDA do Checklist (OUTCOME_SALES + nome contem CHECKLIST)."""
    r = requests.get(f"{API}/{ACCT}/campaigns", params={
        "fields": "name,objective,effective_status",
        "filtering": json.dumps([{"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]}]),
        "limit": 200, "access_token": _token(),
    }, timeout=30)
    out = []
    for c in r.json().get("data", []):
        if "CHECKLIST" in c["name"].upper() and c.get("objective") == "OUTCOME_SALES":
            out.append({"id": c["id"], "name": c["name"], "tag": _tag(c["name"])})
    return out


def _insights(obj_id, level, iso):
    r = requests.get(f"{API}/{obj_id}/insights", params={
        "level": level,
        "fields": "campaign_name,adset_name,ad_name,spend",
        "time_range": json.dumps({"since": iso, "until": iso}),
        "limit": 500, "access_token": _token(),
    }, timeout=60)
    return r.json().get("data", [])


_sales_cache = None


def _money(s):
    s = (s or "0").replace(".", "").replace(",", ".")
    try:
        return float(s)
    except Exception:
        return 0.0


def _hhmm(s):
    m = re.search(r"(\d{2}):(\d{2})", s or "")
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


_all_cache = None


def _load_all():
    """Todas as linhas da planilha (pra detectar order bump por email/data)."""
    global _all_cache
    if _all_cache is not None:
        return _all_cache
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{SHEET_RANGE}"
    r = requests.get(url, params={"key": _skey()}, timeout=30)
    out = []
    for x in r.json().get("values", []):
        prod = x[6] if len(x) > 6 else ""
        out.append({
            "data": x[0] if len(x) > 0 else "",
            "hora": x[1] if len(x) > 1 else "",
            "email": (x[4] if len(x) > 4 else "").strip().lower(),
            "produto": prod,
            "valor": _money(x[7] if len(x) > 7 else "0"),
            "utm_medium": x[9] if len(x) > 9 else "",
            "utm_content": x[10] if len(x) > 10 else "",
            "utm_term": x[11] if len(x) > 11 else "",
            "is_chk": prod.startswith("Check-list"),
        })
    _all_cache = out
    return out


def _load_sales():
    global _sales_cache
    if _sales_cache is not None:
        return _sales_cache
    _sales_cache = [r for r in _load_all() if r["is_chk"]]
    return _sales_cache


def order_bumps(br_date):
    """Order bump = venda com MESMO email + MESMO dia + produto != Checklist,
    no mesmo checkout (<30min). Retorna {n, rev, prods}."""
    from collections import defaultdict
    allr = _load_all()
    idx = defaultdict(list)
    for r in allr:
        if r["email"]:
            idx[(r["email"], r["data"])].append(r)
    n = 0
    rev = 0.0
    prods = {}
    for r in allr:
        if not (r["is_chk"] and r["data"] == br_date):
            continue
        th = _hhmm(r["hora"])
        for o in idx[(r["email"], r["data"])]:
            if o is r or o["is_chk"]:
                continue
            oh = _hhmm(o["hora"])
            if th is not None and oh is not None and abs(th - oh) > 30:
                continue
            n += 1
            rev += o["valor"]
            prods[o["produto"]] = prods.get(o["produto"], 0) + 1
    return {"n": n, "rev": rev, "prods": prods}


def _chk_rev(br_date):
    return sum(r["valor"] for r in _load_sales() if r["data"] == br_date)


def sales_count(br_date, tag=None, conjunto=None, vd=None):
    n = 0
    for s in _load_sales():
        if s["data"] != br_date:
            continue
        if tag and _tag(s["utm_term"]) != tag:
            continue
        if conjunto and s["utm_medium"].upper() != conjunto.upper():
            continue
        if vd and _vd(s["utm_content"]) != vd:
            continue
        n += 1
    return n


def _fmt_cpv(spend, vendas):
    if vendas > 0:
        return f"R$ {spend / vendas:.2f}/venda ({vendas}v)"
    return f"sem venda (R$ {spend:.0f} gasto)"


def _cpv_txt(s, v):
    return f"R$ {s / v:.2f}" if v else "—"


def relatorio_diario():
    """Total ACUMULADO de ontem (dia cheio) e hoje (parcial) em destaque,
    depois a quebra por campanha. CPV = gasto Meta / venda real da planilha."""
    d = _datas()
    camps = active_campaigns()

    per = []
    so_t = sh_t = 0.0
    vo_t = vh_t = 0
    for c in camps:
        sh = sum(float(x.get("spend", 0)) for x in _insights(c["id"], "campaign", d["hoje"]["iso"]))
        so = sum(float(x.get("spend", 0)) for x in _insights(c["id"], "campaign", d["ontem"]["iso"]))
        vh = sales_count(d["hoje"]["br"], tag=c["tag"])
        vo = sales_count(d["ontem"]["br"], tag=c["tag"])
        per.append((c["tag"], sh, vh, so, vo))
        sh_t += sh; so_t += so; vh_t += vh; vo_t += vo

    od = d["ontem"]["br"][:5]
    hd = d["hoje"]["br"][:5]
    obo = order_bumps(d["ontem"]["br"])
    obh = order_bumps(d["hoje"]["br"])
    # ticket médio = (faturamento checklist + order bumps) / nº vendas checklist
    aov_o = (_chk_rev(d["ontem"]["br"]) + obo["rev"]) / vo_t if vo_t else 0
    aov_h = (_chk_rev(d["hoje"]["br"]) + obh["rev"]) / vh_t if vh_t else 0
    L = ["📊 <b>Checklist Honda — custo por venda real</b>", ""]
    # acumulado
    L.append(f"📅 <b>ONTEM ({od})</b> — dia fechado")
    L.append(f"Investido R$ {so_t:.0f} · {vo_t} vendas · <b>CPV {_cpv_txt(so_t, vo_t)}</b>")
    L.append(f"🎁 Order bumps: {obo['n']} (+R$ {obo['rev']:.0f}) · ticket médio R$ {aov_o:.2f}")
    L.append("")
    L.append(f"📅 <b>HOJE ({hd})</b> — parcial")
    L.append(f"Investido R$ {sh_t:.0f} · {vh_t} vendas · <b>CPV {_cpv_txt(sh_t, vh_t)}</b>")
    L.append(f"🎁 Order bumps: {obh['n']} (+R$ {obh['rev']:.0f}) · ticket médio R$ {aov_h:.2f}")
    L.append("")
    # por campanha (ordena por gasto total dos 2 dias)
    L.append("<i>— por campanha · CPV (vendas) —</i>")
    for tag, sh, vh, so, vo in sorted(per, key=lambda x: -(x[1] + x[3])):
        hoje = f"{_cpv_txt(sh, vh)} ({vh}v)" if vh else f"0v (R$ {sh:.0f})"
        ontem = f"{_cpv_txt(so, vo)} ({vo}v)" if vo else f"0v (R$ {so:.0f})"
        L.append(f"<b>{tag}</b>: ontem {ontem} · hoje {hoje}")
    if not camps:
        L.append("(nenhuma campanha de venda do Checklist ativa)")
    return "\n".join(L)


def custo(nivel="campanha", filtro=None, janela="hoje"):
    """Drill-down on-demand (usado pela tool do Telegram).
    nivel: campanha | conjunto | criativo
    filtro: pra conjunto = tag da campanha (ESCALA/TESTE/ADVANTAGE); pra criativo = nome do conjunto
    janela: hoje | ontem
    """
    d = _datas()
    win = d.get(janela if janela in ("hoje", "ontem") else "hoje")
    iso, br = win["iso"], win["br"]
    camps = active_campaigns()
    nivel = (nivel or "campanha").lower()

    if nivel.startswith("campanh"):
        out = [f"📊 <b>Custo por venda — campanhas Checklist</b> ({win['label']})"]
        for c in camps:
            sp = sum(float(x.get("spend", 0)) for x in _insights(c["id"], "campaign", iso))
            v = sales_count(br, tag=c["tag"])
            out.append(f"<b>{c['tag']}</b>: {_fmt_cpv(sp, v)}")
        return "\n".join(out)

    if nivel.startswith("conjunto") or nivel == "adset":
        alvo = [c for c in camps if (not filtro or filtro.upper() in c["tag"].upper())]
        rows = {}
        for c in alvo:
            for r in _insights(c["id"], "adset", iso):
                a = r.get("adset_name", "?")
                rows[a] = rows.get(a, 0) + float(r.get("spend", 0))
        head = f"💰 <b>Custo por conjunto</b> ({win['label']})" + (f" — {filtro}" if filtro else "")
        out = [head]
        for a, sp in sorted(rows.items(), key=lambda x: -x[1]):
            v = sales_count(br, conjunto=a)
            out.append(f"<b>{a}</b>: {_fmt_cpv(sp, v)}")
        if len(out) == 1:
            out.append("(sem gasto nesse dia)")
        return "\n".join(out)

    if nivel.startswith("criativo") or nivel in ("ad", "ads"):
        rows = {}
        for c in camps:
            for r in _insights(c["id"], "ad", iso):
                a = r.get("adset_name", "")
                if filtro and filtro.upper() not in a.upper():
                    continue
                vd = _vd(r.get("ad_name", "")) or r.get("ad_name", "?")
                key = (a, vd)
                rows[key] = rows.get(key, 0) + float(r.get("spend", 0))
        head = f"🎯 <b>Custo por criativo</b> ({win['label']})" + (f" — {filtro}" if filtro else "")
        out = [head]
        for (a, vd), sp in sorted(rows.items(), key=lambda x: -x[1]):
            v = sales_count(br, conjunto=a, vd=vd)
            out.append(f"<b>{vd}</b> <i>[{a}]</i>: {_fmt_cpv(sp, v)}")
        if len(out) == 1:
            out.append("(sem gasto nesse dia)")
        return "\n".join(out)

    return "Nivel invalido. Use: campanha, conjunto ou criativo."


def _enviar_telegram(msg):
    tok = os.getenv("TELEGRAM_BOT_TOKEN_ROTA_CAIO")
    chat = os.getenv("TELEGRAM_CHAT_ID_MATHEUS")
    requests.post(f"https://api.telegram.org/bot{tok}/sendMessage",
                  data={"chat_id": chat, "text": msg, "parse_mode": "HTML"}, timeout=30)


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "--daily"
    if arg == "--daily":
        m = relatorio_diario()
        _enviar_telegram(m)
        print(m)
    elif arg == "--print":
        print(relatorio_diario())
    elif arg == "custo":
        print(custo(*sys.argv[2:]))
    else:
        print("uso: --daily | --print | custo <nivel> [filtro] [janela]")
