"""
Bot listener: escuta mensagens no Telegram, manda pro Claude (Haiku) com tools,
executa acoes na Meta e responde.

Roda como daemon (systemd). Long-polling no Telegram.
"""
import os, json, time, traceback, sys
from pathlib import Path
import requests
import yaml
from dotenv import load_dotenv

base = Path(__file__).resolve().parent
sys.path.insert(0, str(base))
import executor

env_path = Path(os.environ.get("AGENTE_ENV", base.parent.parent.parent.parent.parent / ".env"))
load_dotenv(env_path)

SLUG = os.environ.get("AGENTE_SLUG", "fernanda")
CFG = yaml.safe_load((base.parent / "clientes" / f"{SLUG}.yaml").read_text())

BOT_TOKEN = os.getenv(CFG["telegram"]["bot_token_env"]) or os.getenv("TELEGRAM_BOT_TOKEN_ROTA_WV")
CHAT_ID_ALLOWED = str(os.getenv(CFG["telegram"]["chat_id_env"]) or os.getenv("TELEGRAM_CHAT_ID_MATHEUS"))
CLAUDE_KEY = os.getenv("ANTHROPIC_API_KEY")
DADOS = Path(os.environ.get("AGENTE_DADOS", base.parent.parent.parent.parent.parent / "dados"))

assert BOT_TOKEN, f"Bot token ausente (env {CFG['telegram']['bot_token_env']})"
assert CLAUDE_KEY, "ANTHROPIC_API_KEY ausente"

TG = f"https://api.telegram.org/bot{BOT_TOKEN}"
CLAUDE_URL = "https://api.anthropic.com/v1/messages"

_prompt_path = base.parent / "clientes" / f"{SLUG}_prompt.md"
if _prompt_path.exists():
    SYSTEM_BASE = _prompt_path.read_text()
else:
    SYSTEM_BASE = """Voce e o agente de otimizacao de campanhas Meta Ads da Fernanda Serraglia (Vem Doleta).

Lancamento ativo: AGV_JUN_26 (captacao ate 22/06).

==== ESTRUTURA DE 2 BMs (importante entender) ====

A Fernanda opera com 2 BMs:
- BM PRINCIPAL (act_362367444): onde rodam ads em producao (C12, C13)
- BM CONTINGENCIA (act_762202656676221): passarela pra Meta aprovar criativos antes de subir na Principal

Fluxo:
1. Sobe criativo na Contingencia (de 2 em 2, max 8 ads por campanha)
2. Meta revisa la
3. Quando aprovar: usuario diz "puxa pra Principal" e replica
4. Quando reprovar: criativo NAO vai pra Principal (status = reprovado)

==== HIERARQUIA DE DECISAO (Fernanda) ====
1. CPL manda em tudo (alvo R$14, aceitavel R$20, teto R$20)
2. CPM (subiu?)
3. Connect Rate >= 85%
4. Outras metricas viram contexto

==== INTERPRETACAO DE COMANDOS COM CONTEXTO ====

O usuario fala como se voce lembrasse do historico. Voce NAO tem memoria entre msgs,
mas o sistema te passa o ESTADO ATUAL (catalogo + diagnostico) no system prompt.

Quando o usuario referenciar algo SEM dizer o nome exato:
- "os dois aprovados", "os 2 do feedback", "os ultimos aprovados" → consulta secao
  "APROVADOS aguardando puxar" no contexto. Se tiver 2 la, é desses que ele fala.
- "a sugestao 1", "o #2", "o que voce sugeriu" → secao "SUGESTOES ATUAIS" do diagnostico
- "o proximo da fila" → secao "FILA pra subir" do contexto
- "pausa o COF" → matchar_ad_por_nome (matching tolerante a typos)

NUNCA pergunte "qual exatamente?" se o contexto tem 1 ou 2 candidatos obvios.
Pergunte SO se houver ambiguidade real (3+ candidatos plausíveis).

Quando o usuario pergunta status ("os dois foram aprovados?"):
- Consulta o catalogo no contexto e responde direto.

==== OUTRAS REGRAS ====

Responda CURTO em portugues, tom direto, sem formalidade. Use HTML pro Telegram: <b>negrito</b>, <i>italico</i>, <code>monospace</code>.
NAO use markdown (asteriscos, underscores soltos). Quando citar nome de criativo, use <code>nome_aqui</code>.
Confirme acoes com nome do ad."""


def carregar_contexto_diag():
    """Le ultimo diagnostico (latest.json) e injeta resumo no system prompt."""
    try:
        latest = DADOS / SLUG / "diagnosticos" / "latest.json"
        if not latest.exists():
            hist = sorted((DADOS / SLUG / "diagnosticos").glob("*.json"))
            if not hist: return ""
            latest = hist[-1]
        d = json.loads(latest.read_text())
        lines = [f"\n\n=== ULTIMO DIAGNOSTICO ({d['timestamp']}) ==="]
        t = d["totais"]
        lines.append(f"Geral hoje: gasto R${t['spend_hoje']:.0f}, {t['leads_hoje']} leads, CPL R${t.get('cpl_hoje','-')}")
        lines.append(f"Geral 3d: gasto R${t['spend_3d']:.0f}, {t['leads_3d']} leads, CPL R${t.get('cpl_3d','-')}")

        for c in d["campanhas"]:
            ch = c["hoje"]; cd3 = c["d3"]
            tag = c["name"].split("]_[")[-1].rstrip("]").split("_")[0]
            lines.append(f"\nCampanha {tag}: budget R${c.get('daily_budget')}/dia, hoje R${ch.get('spend',0):.0f}/{ch.get('leads',0)}L/CPL R${ch.get('cpl','-')}, 3d R${cd3.get('spend',0):.0f}/{cd3.get('leads',0)}L/CPL R${cd3.get('cpl','-')}")
            for a in c.get("ads", []):
                if a.get("status") == "ACTIVE":
                    ad3 = a.get("d3", {})
                    lines.append(f"  Ad ATIVO: '{a['name']}' (3d: R${ad3.get('spend',0):.0f}, {ad3.get('leads',0)}L, CPL R${ad3.get('cpl','-')})")

        if d.get("sugestoes"):
            lines.append("\n=== SUGESTOES ATUAIS (numeradas pelo usuario) ===")
            ordem = {"alta": 0, "media": 1, "baixa": 2}
            for i, s in enumerate(sorted(d["sugestoes"], key=lambda x: ordem.get(x["severidade"], 9)), 1):
                lines.append(f"#{i} [{s['severidade']}] {s['acao']}: {s['alvo']} (ad_id={s.get('ad_id','?')}) — motivo: {s['motivo']}")

        return "\n".join(lines)
    except Exception as e:
        return f"\n[erro lendo diagnostico: {e}]"


def carregar_contexto_catalogo():
    """Le criativos.json e injeta status dos criativos no system prompt."""
    try:
        cat_path = DADOS / SLUG / "criativos.json"
        if not cat_path.exists(): return ""
        cat = json.loads(cat_path.read_text())

        em_aprov = [(k, v) for k, v in cat.items() if v.get("status") == "em_aprovacao_contingencia"]
        aprovados = [(k, v) for k, v in cat.items() if v.get("status") == "aprovado_contingencia"]
        reprovados = [(k, v) for k, v in cat.items() if v.get("status") == "reprovado"]

        if not (em_aprov or aprovados or reprovados):
            return ""

        lines = ["\n\n=== CATALOGO DE CRIATIVOS — FLUXO DE APROVACAO ==="]

        if aprovados:
            lines.append(f"\n✅ APROVADOS na Contingencia, AGUARDANDO PUXAR pra Principal ({len(aprovados)}):")
            # Agrupa por ad_id (Feed + Stories sao 2 entradas pro mesmo ad)
            por_ad = {}
            for k, v in aprovados:
                aid = v.get("ad_id_contingencia", "?")
                if aid not in por_ad:
                    por_ad[aid] = {"ad_id": aid, "campanha": v.get("campanha_contingencia", "?"), "nomes": []}
                por_ad[aid]["nomes"].append(k)
            for info in por_ad.values():
                lines.append(f"  - ad_id {info['ad_id']}: {info['nomes'][0]}")

        if em_aprov:
            lines.append(f"\n⏳ EM APROVACAO Contingencia ({len(em_aprov)} criativos):")
            por_ad = {}
            for k, v in em_aprov:
                aid = v.get("ad_id_contingencia", "?")
                if aid not in por_ad:
                    por_ad[aid] = []
                por_ad[aid].append(k)
            for aid, nomes in por_ad.items():
                lines.append(f"  - ad_id {aid}: {nomes[0]}")

        if reprovados:
            lines.append(f"\n❌ REPROVADOS ({len(reprovados)} criativos):")
            for k, v in reprovados[:5]:
                motivo = str(v.get("motivo_reprovacao", "-"))[:100]
                lines.append(f"  - {k}: {motivo}")

        # Fila próxima
        nao_usados = [(k, v) for k, v in cat.items() if v.get("status") == "nao_usado"]
        nao_usados.sort(key=lambda x: (x[1].get("data_mod_drive", ""), x[0]))
        if nao_usados:
            lines.append(f"\n📋 FILA pra subir ({len(nao_usados)} restantes). Top 5:")
            ja_listados = set()
            count = 0
            for k, v in nao_usados:
                # agrupa Feed+Stories
                import re
                base = re.sub(r'_FEED_?', '_', k.replace('.mp4','')).rstrip('_').replace('__','_')
                if base in ja_listados: continue
                ja_listados.add(base)
                lines.append(f"  - [{v['data_mod_drive']}] {base}")
                count += 1
                if count >= 5: break

        return "\n".join(lines)
    except Exception as e:
        return f"\n[erro lendo catalogo: {e}]"


def call_claude(historico, tools=executor.TOOLS_SPEC):
    system = SYSTEM_BASE + carregar_contexto_diag() + carregar_contexto_catalogo()
    payload = {
        "model": "claude-haiku-4-5",
        "max_tokens": 1024,
        "system": system,
        "tools": tools,
        "messages": historico,
    }
    r = requests.post(CLAUDE_URL, headers={
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }, json=payload, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"Claude API {r.status_code}: {r.text[:300]}")
    return r.json()


def processar_mensagem(texto_usuario: str) -> str:
    historico = [{"role": "user", "content": texto_usuario}]

    for _ in range(8):  # max 8 rodadas de tool use
        resp = call_claude(historico)
        content = resp["content"]
        historico.append({"role": "assistant", "content": content})

        stop = resp.get("stop_reason")

        if stop == "tool_use":
            tool_results = []
            for block in content:
                if block.get("type") == "tool_use":
                    nome = block["name"]
                    args = block.get("input", {})
                    print(f"  → tool: {nome}({args})")
                    res = executor.executar_tool(nome, args)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block["id"],
                        "content": json.dumps(res, ensure_ascii=False),
                    })
            historico.append({"role": "user", "content": tool_results})
            continue

        textos = [b["text"] for b in content if b.get("type") == "text"]
        return "\n".join(textos) or "(sem resposta)"

    return "Loop maximo atingido."


def enviar_telegram(chat_id, texto):
    requests.post(f"{TG}/sendMessage", data={
        "chat_id": chat_id, "text": texto, "parse_mode": "HTML",
    }, timeout=30)


def main():
    print(f"[listener] Iniciando. Bot={BOT_TOKEN[:10]}... Chat permitido={CHAT_ID_ALLOWED}")
    offset = None
    log_dir = DADOS / SLUG / "logs_bot"
    log_dir.mkdir(parents=True, exist_ok=True)

    while True:
        try:
            r = requests.get(f"{TG}/getUpdates", params={
                "timeout": 30,
                "offset": offset,
                "allowed_updates": json.dumps(["message"]),
            }, timeout=40)
            data = r.json()
            if not data.get("ok"):
                print(f"[erro getUpdates] {data}")
                time.sleep(5)
                continue

            for upd in data.get("result", []):
                offset = upd["update_id"] + 1
                msg = upd.get("message", {})
                chat_id = str(msg.get("chat", {}).get("id", ""))
                texto = msg.get("text", "")

                if chat_id != CHAT_ID_ALLOWED:
                    print(f"[ignorado] chat {chat_id}: {texto[:50]}")
                    continue
                if not texto:
                    continue
                if texto.startswith("/start"):
                    enviar_telegram(chat_id, f"👋 Agente do {SLUG.upper()} no ar ({CFG.get('lancamento_ativo','-')}). Manda comando ex: 'como ta o CPL?', 'pausa o ad X', 'sobe budget pra 2000'.")
                    continue

                print(f"[msg] {texto}")
                try:
                    requests.post(f"{TG}/sendChatAction", data={"chat_id": chat_id, "action": "typing"}, timeout=10)
                    resposta = processar_mensagem(texto)
                except Exception as e:
                    resposta = f"❌ Erro: {e}"
                    traceback.print_exc()

                enviar_telegram(chat_id, resposta)

                (log_dir / f"{time.strftime('%Y-%m-%d')}.log").open("a").write(
                    f"\n[{time.strftime('%H:%M:%S')}]\n> {texto}\n< {resposta}\n"
                )

        except requests.Timeout:
            continue
        except Exception as e:
            print(f"[loop err] {e}")
            traceback.print_exc()
            time.sleep(5)


if __name__ == "__main__":
    main()
