"""
PACE médio por país — Fernanda AGV_JUN_26.

Roda 1x/dia (09h Brasília via cron). Puxa planilha geral de leads,
extrai DDI do telefone, mapeia pra país, compara com lançamento de
referência (AGV_MAR_26) e manda snapshot no Telegram.

NÃO depende da pesquisa (~20% de resposta) — usa 100% dos leads
captados pelo DDI do telefone.
"""
import os, sys, json, time
from pathlib import Path
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
import requests
from dotenv import load_dotenv

base = Path(__file__).resolve().parent
load_dotenv(Path(os.environ.get("AGENTE_ENV", base.parent.parent.parent.parent.parent / ".env")))

# AGV_AGO_26: leads na MÃE (privada, lê via SA) — abas Leads_TRF + Leads_ORG (mesmo schema A:H)
MAE_SHEET = os.environ.get("MAE_SHEET", "1MeBTkAowscsvwjrMYHFyYEi1CUz1OeuWF_Sx8O5HaQg")
MAE_ABAS = ["Leads_TRF", "Leads_ORG"]
TAG_ATUAL = os.environ.get("PACE_TAG", "agv_ago_26")   # filtro do utm_term
SA_PATH = os.environ.get("SA_JSON", "/root/agente/sa_caio_spend.json")

# 14 países-alvo das campanhas
PAISES_ALVO = {"US", "GB", "CA", "IE", "IT", "ES", "CH", "PT", "AU", "NZ", "NL", "BE", "DE", "FR"}

# ISO -> Nome em português (cobre o que aparece em volume)
ISO_PARA_NOME = {
    "US": "Estados Unidos",
    "GB": "Reino Unido",
    "CA": "Canadá",
    "IE": "Irlanda",
    "IT": "Itália",
    "ES": "Espanha",
    "CH": "Suíça",
    "PT": "Portugal",
    "AU": "Austrália",
    "NZ": "Nova Zelândia",
    "NL": "Holanda",
    "BE": "Bélgica",
    "DE": "Alemanha",
    "FR": "França",
    "BR": "Brasil",
    "AR": "Argentina",
    "MX": "México",
    "CL": "Chile",
    "CO": "Colômbia",
    "PE": "Peru",
    "VE": "Venezuela",
    "PR": "Porto Rico",
    "JP": "Japão",
    "KR": "Coreia do Sul",
    "CN": "China",
    "HK": "Hong Kong",
    "TW": "Taiwan",
    "VN": "Vietnã",
    "TR": "Turquia",
    "IN": "Índia",
    "PK": "Paquistão",
    "AE": "Emirados Árabes",
    "QA": "Catar",
    "SA": "Arábia Saudita",
    "JO": "Jordânia",
    "LB": "Líbano",
    "AT": "Áustria",
    "DK": "Dinamarca",
    "SE": "Suécia",
    "NO": "Noruega",
    "PL": "Polônia",
    "CZ": "Tchéquia",
    "SK": "Eslováquia",
    "HR": "Croácia",
    "SI": "Eslovênia",
    "LV": "Letônia",
    "LT": "Lituânia",
    "EE": "Estônia",
    "BY": "Bielorrússia",
    "UA": "Ucrânia",
    "LU": "Luxemburgo",
    "?": "Sem identificar",
}


def nome_pais(iso: str) -> str:
    return ISO_PARA_NOME.get(iso, iso)

# Mapeamento DDI -> país ISO (ordenado por especificidade — mais longo primeiro)
DDI_MAP = [
    ("1684","AS"),("1670","MP"),("1671","GU"),("1787","PR"),("1939","PR"),
    ("1340","VI"),
    ("351","PT"),("353","IE"),("352","LU"),("371","LV"),("370","LT"),
    ("372","EE"),("375","BY"),("380","UA"),
    ("420","CZ"),("421","SK"),("385","HR"),("386","SI"),
    ("971","AE"),("974","QA"),("966","SA"),("962","JO"),("961","LB"),
    ("852","HK"),("886","TW"),("886","TW"),
    ("44","GB"),("49","DE"),("33","FR"),("39","IT"),("34","ES"),
    ("31","NL"),("32","BE"),("41","CH"),("43","AT"),("45","DK"),
    ("46","SE"),("47","NO"),("48","PL"),
    ("61","AU"),("64","NZ"),
    ("81","JP"),("82","KR"),("86","CN"),("84","VN"),
    ("90","TR"),("91","IN"),("92","PK"),
    ("55","BR"),
    ("54","AR"),("56","CL"),("57","CO"),("58","VE"),("51","PE"),("52","MX"),
    ("1","US"),
]

# API
KEY = os.getenv("GOOGLE_SHEETS_API_KEY", "AIzaSyDFhiUa3LAd8yCaQusFRqf45aWRgOGnAuQ")
TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN_ROTA_WV")
TG_CHAT = os.getenv("TELEGRAM_CHAT_ID") or os.getenv("TELEGRAM_CHAT_ID_MATHEUS")


def extrair_pais(telefone: str) -> str:
    """Extrai país ISO a partir do DDI do telefone."""
    if not telefone:
        return "?"
    t = "".join(c for c in str(telefone) if c.isdigit())
    if not t:
        return "?"
    # tenta DDIs por ordem de especificidade
    for ddi, iso in DDI_MAP:
        if t.startswith(ddi):
            # Validação extra: US/CA têm DDI 1 mas precisam ter 11 dígitos
            if ddi == "1" and len(t) < 11:
                continue
            return iso
    return "?"


def baixar_planilha(sheet_id: str, range_: str = "Página1!A:H") -> list:
    """Baixa planilha via Google Sheets API."""
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{range_}"
    r = requests.get(url, params={"key": KEY}, timeout=60)
    r.raise_for_status()
    return r.json().get("values", [])


def ler_mae_rows() -> list:
    """Lê Leads_TRF + Leads_ORG da mãe (privada) via SA -> rows estilo A:H (1 header + dados)."""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds = service_account.Credentials.from_service_account_file(
        SA_PATH, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    svc = build("sheets", "v4", credentials=creds, cache_discovery=False)
    out, header = [], None
    for aba in MAE_ABAS:
        vals = svc.spreadsheets().values().get(
            spreadsheetId=MAE_SHEET, range=f"{aba}!A:H").execute().get("values", [])
        if not vals:
            continue
        if header is None:
            header = vals[0]; out.append(header)
        out.extend(vals[1:])
    return out


def analisar_lancamento(rows: list, tag: str) -> dict:
    """Filtra leads pelo utm_term contendo tag, conta por país e por data."""
    if not rows:
        return {"erro": "planilha vazia"}
    header = rows[0]
    # Colunas: 0=email/sw, 1=Telefone, 2=date, 3=source, 4=campaign, 5=medium, 6=content, 7=term
    leads_validos = []
    por_pais = Counter()
    por_data = Counter()
    para_hoje = Counter()
    para_ontem = Counter()
    hoje_str = date.today().isoformat()
    ontem_str = (date.today() - timedelta(days=1)).isoformat()

    # date lead vem como "17/05/2026" — vou normalizar pra ISO
    def norm_data(d):
        if not d: return ""
        try:
            if "/" in d:
                dd, mm, yyyy = d.split("/")
                return f"{yyyy}-{mm.zfill(2)}-{dd.zfill(2)}"
            return d[:10]
        except Exception:
            return d[:10]

    for row in rows[1:]:
        if len(row) < 8:
            continue
        utm_term = (row[7] or "").lower()
        if tag.lower() not in utm_term:
            continue
        tel = row[1] or ""
        data_lead = norm_data(row[2] or "")
        pais = extrair_pais(tel)
        leads_validos.append({"tel": tel, "data": data_lead, "pais": pais})
        por_pais[pais] += 1
        por_data[data_lead] += 1
        if data_lead == hoje_str:
            para_hoje[pais] += 1
        elif data_lead == ontem_str:
            para_ontem[pais] += 1

    return {
        "total": len(leads_validos),
        "por_pais": dict(por_pais),
        "por_data": dict(por_data),
        "hoje": dict(para_hoje),
        "ontem": dict(para_ontem),
    }


def fmt_pct(n, total):
    if not total: return "0%"
    return f"{n/total*100:.1f}%"


def categorizar_pais(iso):
    if iso == "BR":
        return "BR"
    if iso in PAISES_ALVO:
        return "ALVO"
    if iso == "?":
        return "?"
    return "OUTRO"


def emoji_pt(pct):
    if pct <= 40: return "🟢"
    if pct <= 50: return "🟡"
    return "🔴"


def montar_mensagem(jun: dict, mar: dict = None) -> str:
    """Mostra SO ontem do JUN. Argumento mar mantido por compatibilidade mas nao usado."""
    ontem = jun.get("ontem", {}) or {}
    total_ontem = sum(ontem.values())

    ontem_dt = (date.today() - timedelta(days=1)).strftime("%d/%m/%Y")

    L = []
    L.append(f"🌎 <b>PACE PAÍS — {TAG_ATUAL.upper()}</b>")
    L.append(f"<i>Captação de ontem ({ontem_dt})</i>")
    L.append("")

    if not total_ontem:
        L.append("⚠️ Nenhum lead captado ontem.")
        return "\n".join(L)

    L.append(f"📊 <b>Total ontem:</b> {total_ontem} leads")
    L.append("")

    # PT — destaque
    pt = ontem.get("PT", 0)
    pct_pt = pt / total_ontem * 100
    L.append("━━━━━━━━━━━━━━━")
    L.append(f"🇵🇹 <b>PORTUGAL</b> {emoji_pt(pct_pt)}")
    L.append("━━━━━━━━━━━━━━━")
    L.append(f"  <b>{pct_pt:.1f}%</b> ({pt} leads)")
    L.append(f"  Regras: 🟢 ≤40% · 🟡 40-50% · 🔴 >50%")
    L.append("")

    # Top países de ontem
    L.append("━━━━━━━━━━━━━━━")
    L.append("🌍 <b>TOP PAÍSES (ontem)</b>")
    L.append("━━━━━━━━━━━━━━━")
    paises_ord = sorted(ontem.items(), key=lambda x: -x[1])
    for iso, n in paises_ord[:12]:
        if iso == "?":
            continue
        pct = n / total_ontem * 100
        cat = categorizar_pais(iso)
        flag = {"BR": "🔴", "ALVO": "🟢", "OUTRO": "🟡", "?": "⚪"}.get(cat, "⚪")
        L.append(f"  {flag} <b>{nome_pais(iso)}</b>: {pct:.1f}% ({n})")
    L.append("")

    # Categorias agregadas
    L.append("━━━━━━━━━━━━━━━")
    L.append("📈 <b>RESUMO</b>")
    L.append("━━━━━━━━━━━━━━━")
    cat = defaultdict(int)
    for iso, n in ontem.items():
        cat[categorizar_pais(iso)] += n
    for cat_key, label, flag in [
        ("ALVO", "14 países-alvo", "🟢"),
        ("BR", "Brasil (lixo)", "🔴"),
        ("OUTRO", "Outros países", "🟡"),
        ("?", "Sem identificar", "⚪"),
    ]:
        pct = cat[cat_key] / total_ontem * 100 if total_ontem else 0
        L.append(f"  {flag} {label}: <b>{pct:.1f}%</b> ({cat[cat_key]})")

    # Países-alvo sem PT (poder monetário)
    alvo_sem_pt = sum(n for iso, n in ontem.items() if iso in PAISES_ALVO and iso != "PT")
    pct_sem_pt = alvo_sem_pt / total_ontem * 100 if total_ontem else 0
    L.append("")
    L.append(f"  💎 Alvo <b>sem PT</b>: <b>{pct_sem_pt:.1f}%</b> ({alvo_sem_pt})")
    L.append("     (maior poder monetário)")

    # Alerta
    L.append("")
    if pct_pt > 50:
        L.append("🚨 <b>ALERTA</b>: Portugal ultrapassou 50% ontem. Atenção pra não inflar.")
    elif pct_pt > 45:
        L.append("⚠️ Portugal subindo (>45% ontem). Olho aberto.")
    else:
        L.append("✅ Portugal em níveis saudáveis.")

    return "\n".join(L)


def enviar_telegram(texto):
    if not TG_TOKEN or not TG_CHAT:
        print("Telegram não configurado")
        return False
    r = requests.post(
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
        data={"chat_id": TG_CHAT, "text": texto, "parse_mode": "HTML"},
        timeout=30,
    )
    return r.json().get("ok", False)


def main():
    print(f"📥 Lendo leads do {TAG_ATUAL.upper()} (mãe via SA)...")
    atual = analisar_lancamento(ler_mae_rows(), TAG_ATUAL)
    if atual.get("erro"):
        print("erro:", atual["erro"])
    print(f"   {atual.get('total',0)} leads totais · ontem: {sum(atual.get('ontem',{}).values())}")

    msg = montar_mensagem(atual)
    print("\n" + msg.replace("<b>","").replace("</b>","").replace("<i>","").replace("</i>",""))

    if "--dry" in sys.argv:
        print("\n(dry-run, não enviou)")
        return

    print("\n📤 Enviando Telegram...")
    ok = enviar_telegram(msg)
    print("OK" if ok else "FALHOU")

    # Salva snapshot
    dados = Path(os.environ.get("AGENTE_DADOS", base.parent.parent.parent.parent.parent / "dados"))
    out_dir = dados / "fernanda" / "pace_paises"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{date.today().isoformat()}.json"
    out.write_text(json.dumps({"atual": atual}, indent=2, ensure_ascii=False))
    print(f"Snapshot salvo: {out}")


if __name__ == "__main__":
    main()
