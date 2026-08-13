"""
Catálogo de criativos: rastreia status usado/nao_usado dos vídeos do Drive,
detecta uso automatico cruzando com ads ativos da Meta.

Arquivo: dados/<slug>/criativos.json
"""
import os, json, sys, subprocess, time
from pathlib import Path
import requests
from dotenv import load_dotenv

# --- Constantes Fernanda (defaults; podem ser parametrizados depois) ---
DRIVE_FOLDER_FERNANDA = "1IChz2FQfm_o9HgH42d1065uMhJDhDrfv"
DIAS_JA_USADOS = {"2026-05-19", "2026-05-20"}


def carregar_catalogo(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {}


def salvar_catalogo(path: Path, cat: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cat, indent=2, ensure_ascii=False))


def normalizar(nome: str) -> str:
    """
    Normaliza pra comparar nomes do Drive com nomes de ads no Meta.
    O Meta gera nomes com pequenas alteracoes (espaco no meio, hifen, etc).
    Estrategia: lowercase, tira extensao, deixa so [a-z0-9_], colapsa repetidos.
    """
    import re
    n = nome.lower().replace(".mp4", "")
    n = re.sub(r"[^a-z0-9]+", "_", n)  # qualquer não-alfanum vira _
    n = re.sub(r"_+", "_", n).strip("_")
    return n


def chave_canonica(nome: str) -> str:
    """Chave reduzida pra match parcial: pega tokens significativos."""
    n = normalizar(nome)
    # remove sufixos genericos
    for s in ["feed", "stories", "mp4"]:
        n = n.replace(f"_{s}", "").replace(f"{s}_", "")
    return n


def listar_videos_drive(drive_folder: str) -> list:
    r = subprocess.run(
        ["rclone", "lsjson", "--drive-root-folder-id", drive_folder, "gdrive-mjta:"],
        capture_output=True, text=True, timeout=120,
    )
    if r.returncode != 0:
        raise RuntimeError(f"rclone lsjson: {r.stderr[:300]}")
    return [v for v in json.loads(r.stdout) if v["Name"].lower().endswith(".mp4")]


def listar_ads_meta(token: str, ad_account: str, tag_filtro: str = None) -> list:
    """Lista TODOS os ads (ACTIVE e PAUSED) que ja existiram nas campanhas do lancamento."""
    params = {
        "fields": "id,name,effective_status,campaign{name}",
        "limit": 100,
        "access_token": token,
    }
    if tag_filtro:
        params["filtering"] = json.dumps([
            {"field": "campaign.name", "operator": "CONTAIN", "value": tag_filtro},
        ])
    ads = []
    url = f"https://graph.facebook.com/v21.0/{ad_account}/ads"
    while url:
        r = requests.get(url, params=params, timeout=60)
        if r.status_code != 200:
            if r.status_code == 500 and "reduce the amount" in r.text:
                # Retry com limit menor
                if params.get("limit", 100) > 25:
                    params["limit"] = 25
                    continue
            raise RuntimeError(f"meta /ads: {r.text[:300]}")
        data = r.json()
        ads.extend(data.get("data", []))
        url = data.get("paging", {}).get("next")
        params = {}
    return ads


def detectar_uso(catalogo: dict, ads: list) -> dict:
    """
    Cruza nomes do catalogo com nomes dos ads. Marca como usado os que matcham.

    Estrategia de match ESTRITA (pra nao confundir versoes 5.1 vs 5.2 vs 5.3):
    1. Match exato normalizado (com FEED/STORIES considerados)
    2. Match canonico (sem FEED/STORIES) — marca AMBAS variantes do drive
    Sem substring fallback.
    """
    cat_norm = {key: (normalizar(key), chave_canonica(key)) for key in catalogo}

    mudancas = 0
    nao_matched = []

    for ad in ads:
        nome_ad_orig = ad.get("name", "")
        if not nome_ad_orig:
            continue
        nome_ad_norm = normalizar(nome_ad_orig)
        nome_ad_canon = chave_canonica(nome_ad_orig)
        cn = (ad.get("campaign") or {}).get("name") or ""
        ad_id = ad.get("id")
        ad_status = ad.get("effective_status")

        matches = []
        # 1. Match EXATO normalizado
        for key, (n_norm, n_canon) in cat_norm.items():
            if n_norm == nome_ad_norm:
                matches.append(("exato", key))
        # 2. Se nao achou exato, match CANONICO (ad sem _feed bate com drive _feed E sem _feed)
        if not matches:
            for key, (n_norm, n_canon) in cat_norm.items():
                if n_canon == nome_ad_canon and len(n_canon) >= 15:
                    matches.append(("canonico", key))

        if not matches:
            nao_matched.append(nome_ad_orig)
            continue

        # Pode dar match em FEED e Stories ao mesmo tempo se ad tem nome unico
        for tipo_match, key in matches:
            info = catalogo[key]
            mudou = info.get("status") != "usado"
            info["status"] = "usado"
            if mudou or not info.get("usado_em") or info.get("usado_em") == "pre-cadastro":
                info["usado_em"] = ad.get("created_time") or info.get("usado_em") or "detectado_via_meta"
            # Sempre preenche ad_id/campanha com o ultimo encontrado
            info["ad_id"] = ad_id
            info["ad_status"] = ad_status
            info["campanha"] = cn
            info["match_type"] = tipo_match
            if mudou:
                mudancas += 1

    return {"mudancas": mudancas, "ads_nao_matched": nao_matched}


def bootstrap(slug: str, dados_root: Path, env_path: Path,
              drive_folder: str = DRIVE_FOLDER_FERNANDA,
              dias_ja_usados: set = DIAS_JA_USADOS) -> dict:
    """Cria o catalogo do zero a partir do Drive.

    Regra:
    - Videos com data_mod nos dias_ja_usados (default: 19+20 maio) = 'usado'
    - Resto = 'nao_usado'
    - SEM cruzamento automatico com Meta (evita falso match entre versoes)
    - Atualizacao posterior: via marcar_usado() quando o agente subir o ad,
      ou via comando manual.
    """
    cat_path = dados_root / slug / "criativos.json"
    cat = carregar_catalogo(cat_path)

    videos = listar_videos_drive(drive_folder)
    novos = 0
    for v in videos:
        nome = v["Name"]
        mod_data = v.get("ModTime", "")[:10]
        if nome not in cat:
            status_inicial = "usado" if mod_data in dias_ja_usados else "nao_usado"
            cat[nome] = {
                "data_mod_drive": mod_data,
                "tamanho_mb": round(v["Size"] / 1024 / 1024, 1),
                "status": status_inicial,
                "usado_em": "pre-cadastro" if status_inicial == "usado" else None,
                "ad_id": None,
                "campanha": None,
            }
            novos += 1

    salvar_catalogo(cat_path, cat)
    return {
        "total_videos": len(cat),
        "novos_videos": novos,
        "path": str(cat_path),
    }


def marcar_usado(slug: str, dados_root: Path, nome: str,
                 ad_id: str = None, campanha: str = None) -> dict:
    """Marca um criativo como usado. Chamado quando o agente sobe o ad."""
    cat_path = dados_root / slug / "criativos.json"
    cat = carregar_catalogo(cat_path)
    if nome not in cat:
        # tenta achar por nome parcial (sem extensao etc)
        candidatos = [k for k in cat if normalizar(nome) == normalizar(k)]
        if not candidatos:
            candidatos = [k for k in cat if normalizar(nome) in normalizar(k) or normalizar(k) in normalizar(nome)]
        if not candidatos:
            return {"ok": False, "msg": f"Criativo nao encontrado: {nome}"}
        if len(candidatos) > 1:
            return {"ok": False, "msg": f"Ambiguo, encontrei {len(candidatos)}: {candidatos[:3]}"}
        nome = candidatos[0]

    info = cat[nome]
    info["status"] = "usado"
    info["usado_em"] = time.strftime("%Y-%m-%d %H:%M:%S")
    if ad_id:
        info["ad_id"] = ad_id
    if campanha:
        info["campanha"] = campanha
    salvar_catalogo(cat_path, cat)
    return {"ok": True, "nome": nome, "msg": f"Marcado como usado: {nome}"}


def fila(slug: str, dados_root: Path, top: int = 10) -> list:
    cat_path = dados_root / slug / "criativos.json"
    cat = carregar_catalogo(cat_path)
    nao_usados = [
        (nome, info) for nome, info in cat.items()
        if info.get("status") == "nao_usado"
    ]
    nao_usados.sort(key=lambda x: (x[1].get("data_mod_drive", ""), x[0]))
    return nao_usados[:top]


def marcar_manual(slug: str, dados_root: Path, nome_parcial: str, status: str) -> dict:
    cat_path = dados_root / slug / "criativos.json"
    cat = carregar_catalogo(cat_path)
    matches = [k for k in cat if nome_parcial.upper() in k.upper()]
    if not matches:
        return {"ok": False, "msg": f"Nenhum criativo encontrado com '{nome_parcial}'"}
    if len(matches) > 1:
        return {"ok": False, "msg": f"Ambiguo, achei {len(matches)}: {matches[:5]}"}
    nome = matches[0]
    cat[nome]["status"] = status
    cat[nome]["usado_em"] = time.strftime("%Y-%m-%d %H:%M:%S") if status == "usado" else None
    salvar_catalogo(cat_path, cat)
    return {"ok": True, "msg": f"{nome} marcado como {status}", "nome": nome}


def resumo(slug: str, dados_root: Path) -> dict:
    cat_path = dados_root / slug / "criativos.json"
    cat = carregar_catalogo(cat_path)
    usados = [k for k, v in cat.items() if v.get("status") == "usado"]
    nao_usados = [k for k, v in cat.items() if v.get("status") == "nao_usado"]
    return {
        "total": len(cat),
        "usados": len(usados),
        "nao_usados": len(nao_usados),
        "proximos": [n for n, _ in fila(slug, dados_root, top=10)],
    }


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    slug = "fernanda"
    dados_root = Path(os.environ.get("AGENTE_DADOS", base.parent.parent.parent / "dados"))
    env_path = Path(os.environ.get("AGENTE_ENV", base.parent.parent.parent / ".env"))

    cmd = sys.argv[1] if len(sys.argv) > 1 else "resumo"

    if cmd == "bootstrap":
        r = bootstrap(slug, dados_root, env_path)
        print(json.dumps(r, indent=2, ensure_ascii=False))
    elif cmd == "fila":
        top = int(sys.argv[2]) if len(sys.argv) > 2 else 20
        for nome, info in fila(slug, dados_root, top=top):
            print(f"  [{info['data_mod_drive']}] {nome}")
    elif cmd == "resumo":
        r = resumo(slug, dados_root)
        print(json.dumps(r, indent=2, ensure_ascii=False))
    elif cmd == "marcar":
        nome = sys.argv[2]
        r = marcar_usado(slug, dados_root, nome)
        print(json.dumps(r, indent=2, ensure_ascii=False))
    elif cmd == "desmarcar":
        nome = sys.argv[2]
        r = marcar_manual(slug, dados_root, nome, "nao_usado")
        print(json.dumps(r, indent=2, ensure_ascii=False))
