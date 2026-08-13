"""
Checker de aprovacao: roda no cron (apos coletar/diagnosticar).
Lista ads marcados como 'em_aprovacao_contingencia' no catalogo,
consulta status atual na Meta, atualiza catalogo, notifica Telegram.
"""
import os, json, sys, time
from pathlib import Path
import requests
from dotenv import load_dotenv


API = "https://graph.facebook.com/v21.0"


# Status review_status da Meta:
# - ACTIVE / RUNNABLE → aprovado, rodando
# - PENDING_REVIEW / IN_PROCESS → ainda revisando
# - DISAPPROVED / REJECTED → reprovado
# - WITH_ISSUES → tem alguma issue mas pode estar rodando
# - PAUSED → pausado manual (nao significa nada da review)

APROVADO_STATES = {"ACTIVE", "WITH_ISSUES"}
REPROVADO_STATES = {"DISAPPROVED"}
EM_REVISAO_STATES = {"PENDING_REVIEW", "IN_PROCESS", "PENDING_BILLING_INFO"}


def consultar_ads(ad_ids: list, token: str) -> dict:
    """Consulta status atual de varios ads. Retorna {ad_id: {...}}"""
    if not ad_ids:
        return {}
    res = {}
    # Meta aceita batch via comma-separated ids
    # Tamanho seguro: 50 por chamada
    for i in range(0, len(ad_ids), 50):
        batch = ad_ids[i:i+50]
        r = requests.get(f"{API}/", params={
            "ids": ",".join(batch),
            "fields": "id,name,effective_status,status,configured_status,issues_info",
            "access_token": token,
        }, timeout=60)
        if r.status_code == 200:
            res.update(r.json())
        else:
            for aid in batch:
                try:
                    rr = requests.get(f"{API}/{aid}", params={
                        "fields": "id,name,effective_status,status,configured_status,issues_info",
                        "access_token": token,
                    }, timeout=30)
                    if rr.status_code == 200:
                        res[aid] = rr.json()
                except Exception:
                    pass
    return res


def carregar_catalogo(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {}


def salvar_catalogo(path: Path, cat: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cat, indent=2, ensure_ascii=False))


def telegram(token, chat_id, texto):
    try:
        requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                      data={"chat_id": chat_id, "text": texto, "parse_mode": "HTML"},
                      timeout=15)
    except Exception:
        pass


def checar(slug: str, dados_root: Path, env_path: Path) -> dict:
    load_dotenv(env_path)
    token_c = os.getenv("META_TOKEN_FERNANDA_CONTINGENCIA")
    tg_token = os.getenv("TELEGRAM_BOT_TOKEN")
    tg_chat = os.getenv("TELEGRAM_CHAT_ID")

    cat_path = dados_root / slug / "criativos.json"
    cat = carregar_catalogo(cat_path)

    # Pega ad_ids unicos em aprovacao
    pendentes = {}  # ad_id -> [criativos_drive]
    for nome, info in cat.items():
        if info.get("status") == "em_aprovacao_contingencia":
            aid = info.get("ad_id_contingencia")
            if aid:
                pendentes.setdefault(aid, []).append(nome)

    if not pendentes:
        return {"verificados": 0, "mudancas": []}

    statuses = consultar_ads(list(pendentes.keys()), token_c)

    mudancas = []
    for ad_id, criativos in pendentes.items():
        ad_data = statuses.get(ad_id)
        if not ad_data or "error" in ad_data:
            continue

        eff = ad_data.get("effective_status", "")
        issues = ad_data.get("issues_info") or []
        review_fb = issues[0] if issues else None
        nome_ad = ad_data.get("name", "")

        if eff in APROVADO_STATES:
            for n in criativos:
                cat[n]["status"] = "aprovado_contingencia"
                cat[n]["aprovado_em"] = time.strftime("%Y-%m-%d %H:%M:%S")
                cat[n]["effective_status_contingencia"] = eff
            mudancas.append({
                "tipo": "aprovado",
                "ad_id": ad_id,
                "nome": nome_ad,
                "criativos": criativos,
            })
        elif eff in REPROVADO_STATES:
            for n in criativos:
                cat[n]["status"] = "reprovado"
                cat[n]["reprovado_em"] = time.strftime("%Y-%m-%d %H:%M:%S")
                cat[n]["motivo_reprovacao"] = str(review_fb)[:500] if review_fb else "sem detalhes"
            mudancas.append({
                "tipo": "reprovado",
                "ad_id": ad_id,
                "nome": nome_ad,
                "criativos": criativos,
                "motivo": review_fb,
            })
        # PENDING/IN_PROCESS: nao mexe, mantem como em_aprovacao

    salvar_catalogo(cat_path, cat)

    # Notifica Telegram se teve mudancas
    if mudancas and tg_token and tg_chat:
        linhas = ["🔔 <b>Atualização da Contingência</b>", ""]
        aprovados = [m for m in mudancas if m["tipo"] == "aprovado"]
        reprovados = [m for m in mudancas if m["tipo"] == "reprovado"]

        if aprovados:
            linhas.append("✅ <b>APROVADOS</b> pela Meta:")
            for m in aprovados:
                linhas.append(f"  • <code>{m['nome']}</code>")
            linhas.append("")
            # Conta total de aprovados aguardando (no catalogo, alem desses novos)
            total_aprov_agora = sum(
                1 for v in cat.values()
                if v.get("status") == "aprovado_contingencia"
            )
            # Agrupa por ad_id pra contar ads aprovados distintos
            ad_ids_aprov = set()
            for k, v in cat.items():
                if v.get("status") == "aprovado_contingencia":
                    ad_ids_aprov.add(v.get("ad_id_contingencia"))
            total_ads_aprov = len(ad_ids_aprov)

            linhas.append(f"📊 <b>{total_ads_aprov}/5</b> ads aprovados aguardando puxar pra Principal")
            if total_ads_aprov >= 5:
                linhas.append("🎯 <b>BATEU A META</b> — pode puxar agora pra Principal!")
                linhas.append('💬 Comando: <i>"puxa os aprovados pra Principal"</i>')
            else:
                faltam = 5 - total_ads_aprov
                linhas.append(f"⏳ Faltam {faltam} aprovado(s) pra atingir o batch de 5")
                linhas.append('💬 <b>Quer subir mais 2 agora na C5?</b> Manda: <i>"sobe próximos 2"</i>')
            linhas.append("")

        if reprovados:
            linhas.append("❌ <b>REPROVADOS</b> na Meta:")
            for m in reprovados:
                linhas.append(f"  • <code>{m['nome']}</code>")
                motivo = m.get("motivo")
                if motivo and isinstance(motivo, dict):
                    razao = motivo.get("reason_description") or motivo.get("policy") or str(motivo)[:150]
                    linhas.append(f"    <i>{razao}</i>")
            linhas.append("")
            linhas.append("⚠️ Esses NÃO vão pra Principal. Edita manual no gerenciador se quiser ajustar.")

        telegram(tg_token, tg_chat, "\n".join(linhas))

    return {
        "verificados": len(pendentes),
        "mudancas": mudancas,
    }


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    slug = sys.argv[1] if len(sys.argv) > 1 else os.getenv("CLIENTE_SLUG", "fernanda")
    dados_root = Path(os.environ.get("AGENTE_DADOS", base.parent.parent.parent / "dados"))
    env_path = Path(os.environ.get("AGENTE_ENV", base.parent.parent.parent / ".env"))

    r = checar(slug, dados_root, env_path)
    print(json.dumps(r, indent=2, ensure_ascii=False, default=str))
