"""
Gerencia mapeamento criativo (nome) -> video_id na biblioteca de midia das BMs.
Cacheia em dados/<slug>/biblioteca_videos.json pra evitar paginar a cada chamada.
"""
import os, json, time
from pathlib import Path
import requests

API = "https://graph.facebook.com/v21.0"


def normalizar(nome: str) -> str:
    import re
    n = nome.lower().replace(".mp4", "")
    n = re.sub(r"[^a-z0-9]+", "_", n)
    n = re.sub(r"_+", "_", n).strip("_")
    return n


def listar_biblioteca(ad_account: str, token: str) -> list:
    videos = []
    url = f"{API}/{ad_account}/advideos"
    params = {
        "fields": "id,title,description,created_time",
        "limit": 100,
        "access_token": token,
    }
    while url:
        r = requests.get(url, params=params, timeout=60)
        if r.status_code != 200:
            if r.status_code == 500 and "reduce the amount" in r.text:
                params["limit"] = 25
                continue
            raise RuntimeError(f"meta /advideos: {r.text[:300]}")
        data = r.json()
        videos.extend(data.get("data", []))
        nxt = data.get("paging", {}).get("next")
        url = nxt if nxt else None
        params = {}
    return videos


def construir_mapa(videos: list) -> dict:
    """Index normalizado_titulo -> video_id."""
    mapa = {}
    for v in videos:
        if "title" not in v:
            continue
        chave = normalizar(v["title"])
        # Se ja existe um com mesma chave, mantem o mais novo (primeiro listado)
        if chave not in mapa:
            mapa[chave] = {
                "video_id": v["id"],
                "title_original": v["title"],
                "created_time": v.get("created_time"),
            }
    return mapa


def construir_e_salvar(slug: str, dados_root: Path, env_path: Path) -> dict:
    from dotenv import load_dotenv
    load_dotenv(env_path)

    out_dir = dados_root / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    bibs = {}
    for label, token_var, acct_var in [
        ("principal", "META_TOKEN_FERNANDA", "META_AD_ACCOUNT_FERNANDA"),
        ("contingencia", "META_TOKEN_FERNANDA_CONTINGENCIA", "META_AD_ACCOUNT_FERNANDA_CONTINGENCIA"),
    ]:
        token = os.getenv(token_var)
        acct = os.getenv(acct_var)
        if not token or not acct:
            bibs[label] = {"erro": f"faltam env vars {token_var}/{acct_var}"}
            continue
        videos = listar_biblioteca(acct, token)
        mapa = construir_mapa(videos)
        bibs[label] = {
            "ad_account": acct,
            "total_videos": len(videos),
            "videos_com_titulo": len(mapa),
            "mapa": mapa,
            "atualizado_em": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

    cache_path = out_dir / "biblioteca_videos.json"
    cache_path.write_text(json.dumps(bibs, indent=2, ensure_ascii=False))

    return {
        "principal_videos": bibs.get("principal", {}).get("videos_com_titulo", 0),
        "contingencia_videos": bibs.get("contingencia", {}).get("videos_com_titulo", 0),
        "path": str(cache_path),
    }


def carregar_mapa(slug: str, dados_root: Path) -> dict:
    cache_path = dados_root / slug / "biblioteca_videos.json"
    if not cache_path.exists():
        return {}
    return json.loads(cache_path.read_text())


def buscar_video_id(slug: str, dados_root: Path, nome_criativo: str, bm: str = "contingencia") -> dict:
    """Procura video_id da biblioteca pelo nome do criativo (normalizado)."""
    bib = carregar_mapa(slug, dados_root)
    if bm not in bib or "mapa" not in bib[bm]:
        return {"ok": False, "msg": f"biblioteca {bm} nao indexada — roda construir_mapa primeiro"}

    chave = normalizar(nome_criativo)
    mapa = bib[bm]["mapa"]
    if chave in mapa:
        return {"ok": True, **mapa[chave]}

    # Tenta sem _FEED no fim (variante)
    chave_sem_feed = chave.replace("_feed", "").rstrip("_")
    for k, v in mapa.items():
        k_sem_feed = k.replace("_feed", "").rstrip("_")
        if k_sem_feed == chave_sem_feed:
            return {"ok": True, **v, "match_type": "sem_feed"}

    return {"ok": False, "msg": f"video '{nome_criativo}' nao encontrado na biblioteca {bm}"}


if __name__ == "__main__":
    import sys
    base = Path(__file__).resolve().parent.parent
    slug = "fernanda"
    dados_root = Path(os.environ.get("AGENTE_DADOS", base.parent.parent.parent / "dados"))
    env_path = Path(os.environ.get("AGENTE_ENV", base.parent.parent.parent / ".env"))

    cmd = sys.argv[1] if len(sys.argv) > 1 else "construir"
    if cmd == "construir":
        r = construir_e_salvar(slug, dados_root, env_path)
        print(json.dumps(r, indent=2, ensure_ascii=False))
    elif cmd == "buscar":
        nome = sys.argv[2]
        bm = sys.argv[3] if len(sys.argv) > 3 else "contingencia"
        r = buscar_video_id(slug, dados_root, nome, bm)
        print(json.dumps(r, indent=2, ensure_ascii=False))
