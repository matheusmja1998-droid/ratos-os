#!/usr/bin/env python3
"""Aplica numberFormat na aba REMARKETING e na coluna Investimento Geral (VISAO GERAL) do Caio."""
import preencher as p

VG_GID = 0
RMKT_GID = 765003715  # gid da aba REMARKETING (do build)

CURRENCY = {"type": "CURRENCY", "pattern": "\"R$\" #,##0.00"}
PERCENT = {"type": "PERCENT", "pattern": "0.00%"}
NUMBER = {"type": "NUMBER", "pattern": "#,##0"}


def rc(gid, r0, r1, c0, c1, fmt):
    return {"repeatCell": {
        "range": {"sheetId": gid, "startRowIndex": r0, "endRowIndex": r1,
                  "startColumnIndex": c0, "endColumnIndex": c1},
        "cell": {"userEnteredFormat": {"numberFormat": fmt}},
        "fields": "userEnteredFormat.numberFormat"}}


def main():
    svc = p.sheets_service()
    reqs = [
        # REMARKETING (rows 3..27 => idx 2..27)
        rc(RMKT_GID, 2, 27, 1, 2, CURRENCY),   # B Investimento
        rc(RMKT_GID, 2, 27, 2, 4, NUMBER),     # C Impressoes, D Cliques
        rc(RMKT_GID, 2, 27, 4, 6, CURRENCY),   # E CPC, F CPM
        rc(RMKT_GID, 2, 27, 6, 7, PERCENT),    # G CTR
        rc(RMKT_GID, 3, 10, 9, 10, CURRENCY),  # J Investimento (tabela lateral)
        rc(RMKT_GID, 3, 10, 10, 11, PERCENT),  # K % do total
        # VISAO GERAL: coluna S (idx 18) Investimento Geral, rows 4..26 (idx 3..26)
        rc(VG_GID, 3, 26, 18, 19, CURRENCY),
    ]
    svc.spreadsheets().batchUpdate(spreadsheetId=p.SHEET_ID, body={"requests": reqs}).execute()
    print("formatos aplicados: REMARKETING (moeda/numero/percent) + VISAO GERAL!S (moeda)")


if __name__ == "__main__":
    main()
