"""
Monta snapshot Opcao B (formato HTML, mais arejado) e envia no Telegram.
HTML escapa underscores corretamente (sem quebra de italico).
"""
import os, json, sys, html
from pathlib import Path
import requests
import yaml
from dotenv import load_dotenv


def emoji_cpl(v, alvo, aceitavel, teto):
    if v is None: return "⚪"
    if v <= alvo: return "🟢"
    if v <= aceitavel: return "🟡"
    return "🔴"


def emoji_connect(v, minimo):
    if v is None: return "⚪"
    return "🟢" if v >= minimo else "🟡"


def fmt_brl(v):
    if v is None: return "—"
    try: return f"R${float(v):.2f}".replace(".", ",")
    except: return "—"


def fmt_pct(v):
    if v is None: return "—"
    return f"{float(v)*100:.1f}%"


def esc(s):
    """Escape pra HTML mode do Telegram."""
    if s is None: return ""
    return html.escape(str(s), quote=False)


def nome_curto_campanha(name: str) -> str:
    """Pega so o tag final, ex: C13."""
    partes = name.split("]_[")
    if len(partes) > 1:
        return partes[-1].rstrip("]").split("_")[0]
    return name[:30]


def montar_mensagem_resumida(diag, cfg):
    """Versao enxuta: GERAL + top campanhas (1 linha) + sugestoes. Pensada pro
    cron de 4 em 4h nao virar um tijolo. Destaca CPM porque na conta do Caio
    e o sinal antecedente do CPL."""
    tot = diag["totais"]
    cpl_alvo = cfg["cpl"]["alvo"]; cpl_acc = cfg["cpl"]["aceitavel"]; cpl_teto = cfg["cpl"]["teto"]
    meta_leads = cfg.get("lancamento", {}).get("meta_leads", 0)
    cpm_alerta = (cfg.get("cpm_diario") or {}).get("alerta")

    e_cpl_hoje = emoji_cpl(tot.get("cpl_hoje"), cpl_alvo, cpl_acc, cpl_teto)
    e_cpl_3d = emoji_cpl(tot.get("cpl_3d"), cpl_alvo, cpl_acc, cpl_teto)

    L = []
    L.append(f"📊 <b>{esc(diag['lancamento'])}</b> · <i>{esc(diag['timestamp'])}</i>")
    L.append("")
    L.append(f"Hoje: <b>{fmt_brl(tot['spend_hoje'])}</b> • {tot['leads_hoje']}L • CPL {e_cpl_hoje}<b>{fmt_brl(tot.get('cpl_hoje'))}</b>")
    L.append(f"3d: {fmt_brl(tot['spend_3d'])} • {tot['leads_3d']}L • CPL {e_cpl_3d}<b>{fmt_brl(tot.get('cpl_3d'))}</b>")
    if meta_leads:
        pct = (tot['leads_3d'] / meta_leads * 100) if meta_leads else 0
        L.append(f"Meta: {tot['leads_3d']}/{meta_leads} ({pct:.0f}%)")
    L.append("")

    # Top campanhas por gasto hoje, 1 linha cada, com CPM em destaque
    camps = sorted(diag["campanhas"], key=lambda c: (c.get("hoje",{}).get("spend") or 0), reverse=True)
    ativas = [c for c in camps if (c.get("hoje",{}).get("spend") or 0) > 0]
    if ativas:
        L.append("<b>Campanhas (hoje):</b>")
        for c in ativas:
            h = c["hoje"]
            nome = nome_curto_campanha(c["name"])
            e = emoji_cpl(h.get("cpl"), cpl_alvo, cpl_acc, cpl_teto)
            cpm = h.get("cpm")
            # alerta de CPM (sinal antecedente do Caio)
            cpm_flag = ""
            if cpm_alerta and cpm is not None:
                try:
                    if float(cpm) >= float(cpm_alerta): cpm_flag = "⚠️"
                except: pass
            L.append(f"{e} <code>{esc(nome)}</code> {fmt_brl(h.get('spend'))} · {h.get('leads',0)}L · CPL <b>{fmt_brl(h.get('cpl'))}</b> · CPM {cpm_flag}{fmt_brl(cpm)}")
        L.append("")

    if diag["sugestoes"]:
        L.append("🎯 <b>SUGESTÕES</b>")
        ordem = {"alta": 0, "media": 1, "baixa": 2}
        sugs = sorted(diag["sugestoes"], key=lambda x: ordem.get(x["severidade"], 9))
        for i, s in enumerate(sugs[:6], 1):  # no maximo 6 no resumo
            sev = {"alta": "🔴", "media": "🟡", "baixa": "🟢"}.get(s["severidade"], "⚪")
            acao = {"pausar_ad": "Pausar", "vigiar_ad": "Vigiar", "remover_criativo_duplicado": "Tirar duplicata"}.get(s["acao"], s["acao"])
            L.append(f"{sev} <b>#{i} {acao}</b> <code>{esc(s['alvo'][:35])}</code> — <i>{esc(s['motivo'])}</i>")
        if len(sugs) > 6:
            L.append(f"<i>+{len(sugs)-6} sugestões. Manda \"relatório completo\" pra ver tudo.</i>")
        L.append("")
        L.append("💬 <i>\"executa 1\" · \"pausa o X\" · \"relatório completo\"</i>")
    else:
        L.append("✅ <i>Sem sugestões. CPL controlado.</i>")

    return "\n".join(L)


def montar_mensagem(diag, cfg):
    tot = diag["totais"]
    cpl_alvo = cfg["cpl"]["alvo"]
    cpl_acc = cfg["cpl"]["aceitavel"]
    cpl_teto = cfg["cpl"]["teto"]
    conn_min = cfg["connect_rate"]["minimo"]
    meta_leads = cfg.get("lancamento", {}).get("meta_leads", 0)

    e_cpl_hoje = emoji_cpl(tot.get("cpl_hoje"), cpl_alvo, cpl_acc, cpl_teto)
    e_cpl_3d = emoji_cpl(tot.get("cpl_3d"), cpl_alvo, cpl_acc, cpl_teto)

    L = []
    L.append(f"📊 <b>{esc(diag['lancamento'])}</b>")
    L.append(f"<i>{esc(diag['timestamp'])}</i>")
    L.append("")

    L.append("━━━━━━━━━━━━━━━")
    L.append("💰 <b>GERAL</b>")
    L.append("━━━━━━━━━━━━━━━")
    L.append(f"Hoje: <b>{fmt_brl(tot['spend_hoje'])}</b> • {tot['leads_hoje']} leads • CPL {e_cpl_hoje} <b>{fmt_brl(tot.get('cpl_hoje'))}</b>")
    L.append(f"3 dias: {fmt_brl(tot['spend_3d'])} • {tot['leads_3d']} leads • CPL {e_cpl_3d} <b>{fmt_brl(tot.get('cpl_3d'))}</b>")
    if meta_leads:
        pct = (tot['leads_3d'] / meta_leads * 100) if meta_leads else 0
        L.append(f"Meta: <b>{tot['leads_3d']}/{meta_leads}</b> ({pct:.1f}%)")
    L.append("")

    for c in diag["campanhas"]:
        h = c["hoje"]; d3 = c["d3"]
        cpl_h_e = emoji_cpl(h.get("cpl"), cpl_alvo, cpl_acc, cpl_teto)
        cpl_3_e = emoji_cpl(d3.get("cpl"), cpl_alvo, cpl_acc, cpl_teto)
        cr_e = emoji_connect(h.get("connect_rate"), conn_min)
        nome = nome_curto_campanha(c["name"])

        L.append("━━━━━━━━━━━━━━━")
        L.append(f"🎯 <b>{esc(nome)}</b>")
        L.append("━━━━━━━━━━━━━━━")
        L.append(f"Budget: <b>{fmt_brl(c.get('daily_budget'))}/dia</b>")
        L.append("")
        L.append(f"<b>Hoje</b>: {fmt_brl(h.get('spend'))} • {h.get('leads',0)} leads")
        L.append(f"    CPL {cpl_h_e} <b>{fmt_brl(h.get('cpl'))}</b>")
        L.append(f"<b>3 dias</b>: {fmt_brl(d3.get('spend'))} • {d3.get('leads',0)} leads")
        L.append(f"    CPL {cpl_3_e} <b>{fmt_brl(d3.get('cpl'))}</b>")
        L.append("")
        L.append(f"CPM: {fmt_brl(h.get('cpm'))} • CTR link: <b>{h.get('ctr_link','—')}%</b>")
        L.append(f"Hook Rate: <b>{fmt_pct(h.get('hook_rate'))}</b> • Freq: {h.get('frequency','—')}")
        L.append(f"Connect: {cr_e} {fmt_pct(h.get('connect_rate'))} • Tx conv. página: <b>{fmt_pct(h.get('tx_conversao_pagina'))}</b>")

        # Snapshot ads ativos: HOJE como padrao. Quem estourou teto ganha linha 3d extra.
        ads_ativos = sorted(
            [a for a in c["ads"] if a.get("status") == "ACTIVE"],
            key=lambda a: (a.get("hoje", {}).get("spend") or 0),
            reverse=True,
        )
        ads_com_gasto_hoje = [a for a in ads_ativos if (a.get("hoje", {}).get("spend") or 0) > 0]
        if ads_com_gasto_hoje:
            L.append("")
            L.append("<b>Ads ativos (hoje):</b>")
            for a in ads_com_gasto_hoje[:8]:
                hoje_a = a.get("hoje", {})
                d3a = a.get("d3", {})
                cpl_h = hoje_a.get("cpl")
                cpl_3d = d3a.get("cpl")
                e = emoji_cpl(cpl_h, cpl_alvo, cpl_acc, cpl_teto)
                nm = a["name"][:50]
                L.append(f"{e} <code>{esc(nm)}</code>")
                L.append(f"    {fmt_brl(hoje_a.get('spend'))} • {hoje_a.get('leads',0)}L • CPL <b>{fmt_brl(cpl_h)}</b>")
                # Fallback 3d so quando CPL hoje estourou teto
                if cpl_h is not None and cpl_h > cpl_teto and (d3a.get("spend") or 0) > 0:
                    e3 = emoji_cpl(cpl_3d, cpl_alvo, cpl_acc, cpl_teto)
                    L.append(f"    <i>3d:</i> {fmt_brl(d3a.get('spend'))} • {d3a.get('leads',0)}L • CPL {e3} <b>{fmt_brl(cpl_3d)}</b>")
        L.append("")

    tend_path = Path(os.environ.get("AGENTE_DADOS", "dados")) / diag.get("cliente_slug","fernanda") / "tendencias" / "latest.json"
    tend = None
    try:
        if tend_path.exists():
            tend = json.loads(tend_path.read_text())
    except Exception:
        pass

    if tend and tend.get("ads_com_fadiga"):
        L.append("━━━━━━━━━━━━━━━")
        L.append("🔥 <b>SINAIS DE FADIGA</b>")
        L.append("━━━━━━━━━━━━━━━")
        for f in tend["ads_com_fadiga"]:
            L.append(f"<code>{esc(f['ad'][:50])}</code>")
            for s in f["sinais"]:
                L.append(f"  • <i>{esc(s['msg'])}</i>")
            L.append("")

    if diag["alertas_tracking"]:
        L.append("━━━━━━━━━━━━━━━")
        L.append("⚠️ <b>ALERTAS TRACKING</b>")
        L.append("━━━━━━━━━━━━━━━")
        for a in diag["alertas_tracking"]:
            L.append(f"• <b>{esc(nome_curto_campanha(a['campanha']))}</b>")
            L.append(f"  <i>{esc(a['motivo'])}</i>")
        L.append("")

    L.append("━━━━━━━━━━━━━━━")
    if diag["sugestoes"]:
        L.append("🎯 <b>SUGESTÕES</b>")
        L.append("━━━━━━━━━━━━━━━")
        ordem = {"alta": 0, "media": 1, "baixa": 2}
        for i, s in enumerate(sorted(diag["sugestoes"], key=lambda x: ordem.get(x["severidade"], 9)), 1):
            sev = {"alta": "🔴", "media": "🟡", "baixa": "🟢"}.get(s["severidade"], "⚪")
            acao = {"pausar_ad": "Pausar", "vigiar_ad": "Vigiar", "remover_criativo_duplicado": "Tirar duplicata"}.get(s["acao"], s["acao"])
            L.append(f"{sev} <b>#{i} {acao}</b>")
            L.append(f"<code>{esc(s['alvo'])}</code>")
            L.append(f"<i>{esc(s['motivo'])}</i>")
            L.append("")
        L.append("💬 Responde aqui:")
        L.append("   <i>\"executa sugestão 1\"</i>")
        L.append("   <i>\"pausa o COF\"</i>")
        L.append("   <i>\"ignora a #2\"</i>")
    else:
        L.append("✅ <b>SEM SUGESTÕES</b>")
        L.append("━━━━━━━━━━━━━━━")
        L.append("<i>CPL controlado em todas as campanhas.</i>")

    return "\n".join(L)


def aplicar_filtro_relatorio(diag, cfg):
    """Filtra campanhas/sugestoes/alertas/totais pra so mostrar o que bate
    com cfg['relatorio_filtros']['incluir_se_nome_contem_qualquer'] (case-insensitive).
    Se nao houver filtro, retorna diag intacto.
    Recalcula os totais com base nas campanhas filtradas."""
    filtros = (cfg.get("relatorio_filtros") or {}).get("incluir_se_nome_contem_qualquer") or []
    if not filtros:
        return diag

    padroes = [p.lower() for p in filtros]
    def bate(nome):
        n = (nome or "").lower()
        return any(p in n for p in padroes)

    campanhas = [c for c in diag.get("campanhas", []) if bate(c.get("name", ""))]
    nomes_ok = {c["name"] for c in campanhas}

    sugestoes = []
    for s in diag.get("sugestoes", []):
        camp = s.get("campanha") or s.get("campanha_nome") or ""
        # Se a sugestao referencia uma campanha, so passa se ela esta no conjunto.
        # Se nao referencia (ex: sugestao de criativo orfa), mantem.
        if camp and not bate(camp):
            continue
        sugestoes.append(s)

    alertas = [a for a in diag.get("alertas_tracking", []) if bate(a.get("campanha", ""))]

    # Recalcula totais somando so campanhas filtradas
    def soma(campo_janela, campo):
        total = 0.0
        for c in campanhas:
            v = (c.get(campo_janela) or {}).get(campo)
            if v is not None:
                try: total += float(v)
                except: pass
        return total

    def cpl(spend, leads):
        if leads and leads > 0:
            return round(spend / leads, 2)
        return None

    spend_hoje = soma("hoje", "spend")
    leads_hoje = int(soma("hoje", "leads"))
    spend_3d = soma("d3", "spend")
    leads_3d = int(soma("d3", "leads"))

    novos_totais = dict(diag.get("totais", {}))
    novos_totais.update({
        "spend_hoje": spend_hoje,
        "leads_hoje": leads_hoje,
        "cpl_hoje": cpl(spend_hoje, leads_hoje),
        "spend_3d": spend_3d,
        "leads_3d": leads_3d,
        "cpl_3d": cpl(spend_3d, leads_3d),
    })

    return {**diag, "campanhas": campanhas, "sugestoes": sugestoes,
            "alertas_tracking": alertas, "totais": novos_totais}


def enviar(token, chat_id, texto):
    # Telegram limita em 4096 chars. Splita por linha mantendo cada chunk <= 3800.
    LIMITE = 3800
    if len(texto) <= LIMITE:
        chunks = [texto]
    else:
        chunks = []
        atual = ""
        for linha in texto.split("\n"):
            if len(atual) + len(linha) + 1 > LIMITE and atual:
                chunks.append(atual)
                atual = linha
            else:
                atual = (atual + "\n" + linha) if atual else linha
        if atual:
            chunks.append(atual)

    ultimo = {}
    for i, c in enumerate(chunks):
        prefix = f"<i>parte {i+1}/{len(chunks)}</i>\n" if len(chunks) > 1 else ""
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data={"chat_id": chat_id, "text": prefix + c, "parse_mode": "HTML"},
            timeout=30,
        )
        ultimo = r.json()
        if not ultimo.get("ok"):
            return ultimo
    return ultimo


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    slug = sys.argv[1] if len(sys.argv) > 1 else "fernanda"

    env_path = Path(os.environ.get("AGENTE_ENV", base.parent.parent.parent / ".env"))
    load_dotenv(env_path)

    cfg = yaml.safe_load((base / "clientes" / f"{slug}.yaml").read_text())
    dados_root = Path(os.environ.get("AGENTE_DADOS", base.parent.parent.parent / "dados"))
    # Filtra fora latest.json — pega o snapshot dated mais recente
    candidatos = [p for p in (dados_root / slug / "diagnosticos").glob("*.json") if p.name != "latest.json"]
    diag_path = sorted(candidatos)[-1]
    diag = json.loads(diag_path.read_text())

    # Linka snapshot como "latest" pro bot ler depois
    latest = dados_root / slug / "diagnosticos" / "latest.json"
    latest.write_text(diag_path.read_text())

    diag_filtrado = aplicar_filtro_relatorio(diag, cfg)

    # Formato: yaml define padrao (resumido/completo); flags fazem override.
    formato = (cfg.get("acoes_fase_1") or {}).get("formato_relatorio", "completo")
    if "--completo" in sys.argv: formato = "completo"
    if "--resumido" in sys.argv: formato = "resumido"

    if formato == "resumido":
        msg = montar_mensagem_resumida(diag_filtrado, cfg)
    else:
        msg = montar_mensagem(diag_filtrado, cfg)
    print(msg)
    print("\n---")

    bot_env = cfg["telegram"]["bot_token_env"]
    chat_env = cfg["telegram"]["chat_id_env"]
    token = os.getenv(bot_env) or os.getenv("TELEGRAM_BOT_TOKEN_ROTA_WV")
    chat_id = os.getenv(chat_env) or os.getenv("TELEGRAM_CHAT_ID_MATHEUS")

    if "--dry" in sys.argv:
        print("(dry-run, nao enviou)")
    else:
        r = enviar(token, chat_id, msg)
        print("Telegram:", "OK" if r.get("ok") else r)
