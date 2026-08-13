#!/usr/bin/env python3
"""
One-off: cria a aba REMARKETING na planilha do Caio espelhando a da Fernanda,
puxa as metricas de remarketing do FB e preenche, e adiciona a coluna
"Investimento Geral" (= B + REMARKETING!B) na VISAO GERAL.

Roda na VPS: AGENTE_ENV=/root/agente/.env SA_JSON=/root/agente/sa_caio_spend.json python3 build_remarketing_caio.py
"""
import json
import datetime as dt
import preencher as p  # reutiliza meta_get, sheets_service, get_values, AD_ACCOUNT, SHEET_ID, ABA

REMARK_ABA = "REMARKETING"
# Filtro de remarketing: nome CONTEM "IE30_" (tag datada [IE30_JUL_26]/[IE30_AGO_26]).
# Disjunto da captacao, que usa "[IE30]" (colchete fecha logo apos IE30).
RMKT_TAG = "IE30_"


def meta_get_retry(path, params, tries=4):
    import time
    last = None
    for k in range(tries):
        try:
            return p.meta_get(path, params)
        except Exception as e:
            last = e
            time.sleep(2 * (k + 1))
    raise last


def campanhas_rmkt():
    d = meta_get_retry(f"{p.AD_ACCOUNT}/campaigns", {
        "fields": "id,name",
        "filtering": json.dumps([{"field": "name", "operator": "CONTAIN", "value": RMKT_TAG}]),
        "limit": 300,
    })
    return d.get("data", [])


def coletar_por_dia_e_tipo(camps, since_iso, until_iso):
    """UMA chamada por campanha (time_increment diario). Retorna:
    por_dia: {iso: (spend, impr, clk)} agregado de todas; por_tipo: {tipo: spend_total}."""
    por_dia = {}
    por_tipo = {t: 0.0 for t in TIPOS_ORDEM}
    for c in camps:
        rows = meta_get_retry(f"{c['id']}/insights", {
            "time_range": json.dumps({"since": since_iso, "until": until_iso}),
            "time_increment": 1,
            "fields": "spend,impressions,inline_link_clicks",
            "level": "campaign",
        }).get("data", [])
        tp = tipo_campanha(c["name"])
        for i in rows:
            iso = i.get("date_start")
            sp = float(i.get("spend", 0) or 0)
            im = int(i.get("impressions", 0) or 0)
            cl = int(i.get("inline_link_clicks", 0) or 0)
            a, b, d = por_dia.get(iso, (0.0, 0, 0))
            por_dia[iso] = (round(a + sp, 2), b + im, d + cl)
            por_tipo[tp] += sp
    return por_dia, por_tipo


def tipo_campanha(nome):
    u = nome.upper()
    if "REPLAY" in u:
        return "Replay (CPLs)"
    if "AO VIVO" in u:
        return "Ao vivo / CPL"
    if "RMKT" in u or "LEMBRETE" in u or "REGRESSIVA" in u or "CONTAGEM" in u:
        return "Lembrete (contagem)"
    if "CONVERS" in u or "CARRINHO" in u:
        return "Carrinho/Conversão"
    return "Outros"


TIPOS_ORDEM = ["Replay (CPLs)", "Ao vivo / CPL", "Lembrete (contagem)", "Carrinho/Conversão", "Outros"]


def main():
    svc = p.sheets_service()
    sid = p.SHEET_ID

    # 1) datas da VISAO GERAL (rows 4..last)
    colA = p.get_values(svc, sid, f"'{p.ABA}'!A1:A40", "FORMATTED_VALUE")
    datas = []  # (row, label)
    for i, r in enumerate(colA, 1):
        v = (r[0] if r else "").strip()
        if i >= 4 and v and v[0].isdigit() and "/" in v:
            datas.append((i, v))
    if not datas:
        raise SystemExit("nao achei datas na VISAO GERAL")
    first_row = datas[0][0]      # 4
    last_row = datas[-1][0]      # 26
    print(f"datas: linhas {first_row}..{last_row} ({len(datas)} dias)")

    # 2) cria (ou reusa, se ja existir e estiver vazia) a aba REMARKETING
    meta = svc.spreadsheets().get(spreadsheetId=sid).execute()
    abas = {s["properties"]["title"]: s["properties"]["sheetId"] for s in meta["sheets"]}
    if REMARK_ABA in abas:
        a1 = p.get_values(svc, sid, f"'{REMARK_ABA}'!A1", "FORMATTED_VALUE")
        if a1 and a1[0] and str(a1[0][0]).strip():
            raise SystemExit(f"aba {REMARK_ABA!r} ja existe E tem conteudo. Abortando pra nao sobrescrever.")
        rmkt_gid = abas[REMARK_ABA]
        print(f"aba {REMARK_ABA} ja existia vazia (gid {rmkt_gid}), reusando")
    else:
        add = svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": [{
            "addSheet": {"properties": {"title": REMARK_ABA,
                                        "gridProperties": {"rowCount": last_row + 10, "columnCount": 14}}}
        }]}).execute()
        rmkt_gid = add["replies"][0]["addSheet"]["properties"]["sheetId"]
        print(f"aba {REMARK_ABA} criada, gid {rmkt_gid}")

    # 3) metricas do FB: 1 chamada por campanha (time_increment diario) -> por dia e por tipo
    camps = campanhas_rmkt()
    print(f"campanhas rmkt: {len(camps)}")
    hoje = dt.date.today()

    def label_to_iso(lbl):
        dd, mm = lbl.split(" ")[0].split("/")
        return f"2026-{mm}-{dd}"

    ini = label_to_iso(datas[0][1])
    fim = min(hoje, dt.date.fromisoformat(label_to_iso(datas[-1][1]))).isoformat()
    por_dia_iso, por_tipo = coletar_por_dia_e_tipo(camps, ini, fim)

    dia_vals = {}  # row -> (spend, impr, clk) para dias passados/hoje
    for row, lbl in datas:
        iso = label_to_iso(lbl)
        if dt.date.fromisoformat(iso) <= hoje:
            dia_vals[row] = por_dia_iso.get(iso, (0.0, 0, 0))

    # 4) monta o corpo (USER_ENTERED, separador ';' locale BR)
    data = []

    def put(a1, val):
        data.append({"range": f"'{REMARK_ABA}'!{a1}", "values": [[val]]})

    put("A1", "REMARKETING")
    for col, txt in zip("ABCDEFG", ["Data", "Investimento", "Impressoes", "Cliques", "CPC", "CPM", "CTR"]):
        put(f"{col}2", txt)
    put("I2", "POR TIPO DE CAMPANHA")
    # RESUMO
    put("A3", "RESUMO")
    put("B3", f"=SUM(B{first_row}:B{last_row})")
    put("C3", f"=SUM(C{first_row}:C{last_row})")
    put("D3", f"=SUM(D{first_row}:D{last_row})")
    put("E3", "=IFERROR(B3/D3;0)")
    put("F3", "=IFERROR(B3/C3*1000;0)")
    put("G3", "=IFERROR(D3/C3;0)")
    put("I3", "Tipo"); put("J3", "Investimento"); put("K3", "% do total")
    # linhas por dia
    for row, lbl in datas:
        put(f"A{row}", lbl)
        if row in dia_vals:
            sp, im, cl = dia_vals[row]
            put(f"B{row}", sp); put(f"C{row}", im); put(f"D{row}", cl)
        put(f"E{row}", f"=IFERROR(B{row}/D{row};0)")
        put(f"F{row}", f"=IFERROR(B{row}/C{row}*1000;0)")
        put(f"G{row}", f"=IFERROR(D{row}/C{row};0)")
    # tabela lateral por tipo (rows 4..8 + TOTAL em 9)
    total_row = 4 + len(TIPOS_ORDEM)  # 9
    for k, t in enumerate(TIPOS_ORDEM):
        rr = 4 + k
        put(f"I{rr}", t)
        put(f"J{rr}", round(por_tipo[t], 2))
        put(f"K{rr}", f"=IFERROR(J{rr}/$J${total_row};0)")
    put(f"I{total_row}", "TOTAL")
    put(f"J{total_row}", f"=SUM(J4:J{total_row-1})")
    put(f"K{total_row}", f"=IFERROR(J{total_row}/$J${total_row};0)")

    svc.spreadsheets().values().batchUpdate(spreadsheetId=sid, body={
        "valueInputOption": "USER_ENTERED", "data": data}).execute()
    print(f"REMARKETING preenchida: {len(datas)} dias, {sum(1 for r in dia_vals)} com dados FB")

    # 5) coluna "Investimento Geral" na VISAO GERAL (col nova no fim, nao-destrutivo, idempotente)
    def idx_to_col(idx0):
        s = ""
        n = idx0 + 1
        while n:
            n, r = divmod(n - 1, 26)
            s = chr(65 + r) + s
        return s
    vg_gid = abas[p.ABA]
    # ja existe uma coluna "Investimento Geral"? reusa; senao, cria no fim
    hdr = p.get_values(svc, sid, f"'{p.ABA}'!1:2", "FORMATTED_VALUE")
    row2 = hdr[1] if len(hdr) > 1 else []
    nova = None
    for j, v in enumerate(row2):
        if str(v).strip().lower() == "investimento geral":
            nova = idx_to_col(j)
            break
    if nova is None:
        vg_props = next(s["properties"] for s in meta["sheets"] if s["properties"]["title"] == p.ABA)
        ncols = vg_props["gridProperties"]["columnCount"]
        svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": [{
            "appendDimension": {"sheetId": vg_gid, "dimension": "COLUMNS", "length": 1}}]}).execute()
        nova = idx_to_col(ncols)  # ex: ncols=18 (R) -> S
    ig = [{"range": f"'{p.ABA}'!{nova}2", "values": [["Investimento Geral"]]}]
    for row, _ in datas:
        ig.append({"range": f"'{p.ABA}'!{nova}{row}", "values": [[f"=B{row}+REMARKETING!B{row}"]]})
    svc.spreadsheets().values().batchUpdate(spreadsheetId=sid, body={
        "valueInputOption": "USER_ENTERED", "data": ig}).execute()
    print(f"VISAO GERAL: coluna {nova} = 'Investimento Geral' (=B+REMARKETING!B) adicionada")
    print("OK")


if __name__ == "__main__":
    main()
