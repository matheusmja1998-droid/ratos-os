#!/usr/bin/env python3
"""
Market Share Solar — ANEEL GD
Baixa os dados de geração distribuída da ANEEL e mostra instalações por cidade/estado.

Uso:
  python3 market_share_solar.py --estado SC
  python3 market_share_solar.py --estado SC --cidade "Jaraguá do Sul"
  python3 market_share_solar.py --estado SC --limpar-cache
"""

import argparse
import os
from datetime import datetime, timedelta

import pandas as pd

CSV_URL = (
    "https://dadosabertos.aneel.gov.br/dataset/"
    "5e0fafd2-21b9-4d5b-b622-40438d40aba2/resource/"
    "b1bd71e7-d0ad-4214-9053-cbd58e9564a7/download/"
    "empreendimento-geracao-distribuida.csv"
)
CACHE_PATH = os.path.join(os.path.dirname(__file__), "aneel_cache.csv")
CACHE_TTL_HOURS = 24

# Colunas reais do CSV da ANEEL
COL_UF        = "SigUF"
COL_MUNICIPIO = "NomMunicipio"
COL_FONTE     = "DscFonteGeracao"
COL_POTENCIA  = "MdaPotenciaInstaladaKW"
COL_PERIODO   = "AnmPeriodoReferencia"
COL_DATA      = "DthAtualizaCadastralEmpreend"
COL_PORTE     = "DscPorte"


def carregar_dados() -> pd.DataFrame:
    cache_ok = (
        os.path.exists(CACHE_PATH)
        and datetime.fromtimestamp(os.path.getmtime(CACHE_PATH))
        > datetime.now() - timedelta(hours=CACHE_TTL_HOURS)
    )

    if cache_ok:
        print(f"Usando cache local (atualizado há menos de {CACHE_TTL_HOURS}h)...")
    else:
        print("Baixando dados da ANEEL... (pode demorar alguns segundos)")

    df = pd.read_csv(
        CACHE_PATH if cache_ok else CSV_URL,
        sep=";",
        encoding="latin1",
        low_memory=False,
    )

    if not cache_ok:
        df.to_csv(CACHE_PATH, sep=";", index=False, encoding="latin1")
        print(f"Cache salvo em {CACHE_PATH}")

    return df


def potencia_num(df: pd.DataFrame) -> pd.Series:
    return pd.to_numeric(
        df[COL_POTENCIA].astype(str).str.replace(",", "."), errors="coerce"
    )


def relatorio(df_br: pd.DataFrame, df: pd.DataFrame, cidade: str | None, estado: str | None):
    total_br   = len(df_br)
    total      = len(df)
    label      = " / ".join(filter(None, [cidade, estado])) if (cidade or estado) else "Brasil"
    data_ref   = df_br[COL_PERIODO].iloc[0] if not df_br.empty else "?"

    print("\n" + "=" * 58)
    print(f"  MARKET SHARE SOLAR — {label.upper()}")
    print(f"  Referência ANEEL: {data_ref}  |  Gerado: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print("=" * 58)

    share = (total / total_br * 100) if total_br > 0 else 0
    print(f"\nInstalações no Brasil:       {total_br:>10,}")
    print(f"Instalações em {label:<12}  {total:>10,}")
    print(f"Market share (qtd):          {share:>9.2f}%")

    cap = potencia_num(df).sum() / 1000
    cap_br = potencia_num(df_br).sum() / 1000
    print(f"Capacidade instalada:        {cap:>9,.1f} MW  (Brasil: {cap_br:,.1f} MW)")

    # Por porte
    if COL_PORTE in df.columns:
        print("\n--- Por porte ---")
        for porte, qtd in df[COL_PORTE].value_counts().items():
            print(f"  {porte:<25} {qtd:>8,}  ({qtd/total*100:.1f}%)")

    # Por município (top 10) — só quando não filtrou por cidade
    if not cidade and COL_MUNICIPIO in df.columns:
        print("\n--- Top 10 municípios ---")
        for mun, qtd in df[COL_MUNICIPIO].value_counts().head(10).items():
            print(f"  {str(mun):<30} {qtd:>8,}")

    # Evolução por ano
    if COL_DATA in df.columns:
        try:
            anos = pd.to_datetime(df[COL_DATA], dayfirst=True, errors="coerce").dt.year
            contagem = anos.value_counts().sort_index()
            print("\n--- Conexões por ano ---")
            max_val = contagem.max()
            for ano, qtd in contagem.items():
                if pd.notna(ano) and int(ano) >= 2018:
                    barra = "█" * int(qtd / max_val * 28)
                    print(f"  {int(ano)}  {barra:<28} {qtd:>8,}")
        except Exception:
            pass

    print("\n" + "=" * 58)


def main():
    parser = argparse.ArgumentParser(description="Market Share Solar — ANEEL GD")
    parser.add_argument("--cidade", "-c", help="Nome do município (ex: 'Jaraguá do Sul')")
    parser.add_argument("--estado", "-e", help="Sigla do estado (ex: SC)")
    parser.add_argument("--limpar-cache", action="store_true", help="Força novo download")
    args = parser.parse_args()

    if args.limpar_cache and os.path.exists(CACHE_PATH):
        os.remove(CACHE_PATH)
        print("Cache removido.")

    df = carregar_dados()

    # Filtrar apenas solar fotovoltaico
    df_solar = df[df[COL_FONTE].str.contains("solar", case=False, na=False)]

    df_filtrado = df_solar.copy()
    if args.estado:
        df_filtrado = df_filtrado[df_filtrado[COL_UF].str.upper() == args.estado.upper()]
    if args.cidade:
        df_filtrado = df_filtrado[
            df_filtrado[COL_MUNICIPIO].str.upper().str.contains(args.cidade.upper(), na=False)
        ]

    relatorio(df_solar, df_filtrado, args.cidade, args.estado)


if __name__ == "__main__":
    main()
