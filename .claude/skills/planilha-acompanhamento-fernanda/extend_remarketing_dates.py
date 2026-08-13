#!/usr/bin/env python3
"""Estende a aba REMARKETING do Caio ate 15/07 (fim do carrinho), preenche os dias
que faltam (pos-CPL), corrige RESUMO e recalcula a tabela por tipo. Idempotente."""
import datetime as dt
import preencher as p

RMKT_GID = 765003715
# rows 27..33 = 09/07..15/07 (08/07 = row 26 = "qua.")
NOVAS = [
    (27, "09/07 - qui."), (28, "10/07 - sex."), (29, "11/07 - sáb."),
    (30, "12/07 - dom."), (31, "13/07 - seg."), (32, "14/07 - ter."), (33, "15/07 - qua."),
]
LAST = NOVAS[-1][0]  # 33

CURRENCY = {"type": "CURRENCY", "pattern": "\"R$\" #,##0.00"}
PERCENT = {"type": "PERCENT", "pattern": "0.00%"}
NUMBER = {"type": "NUMBER", "pattern": "#,##0"}


def rc(r0, r1, c0, c1, fmt):
    return {"repeatCell": {"range": {"sheetId": RMKT_GID, "startRowIndex": r0, "endRowIndex": r1,
            "startColumnIndex": c0, "endColumnIndex": c1},
            "cell": {"userEnteredFormat": {"numberFormat": fmt}},
            "fields": "userEnteredFormat.numberFormat"}}


def main():
    svc = p.sheets_service()
    sid = p.SHEET_ID

    # 0) confere que 08/07 esta na row 26 (sanidade)
    a = p.get_values(svc, sid, f"'{p.REMARK_ABA}'!A26", "FORMATTED_VALUE")
    if not (a and a[0] and a[0][0].startswith("08/07")):
        raise SystemExit(f"esperava 08/07 na row 26, achei {a}. Abortando.")

    # 1) datas + formulas E/F/G nas novas linhas (idempotente: sobrescreve labels/formulas)
    upd = []
    for r, lbl in NOVAS:
        upd.append((f"A{r}", lbl))
        upd.append((f"E{r}", f"=IFERROR(B{r}/D{r};0)"))
        upd.append((f"F{r}", f"=IFERROR(B{r}/C{r}*1000;0)"))
        upd.append((f"G{r}", f"=IFERROR(D{r}/C{r};0)"))
    # 2) RESUMO passa a somar ate a nova ultima linha
    upd.append((f"B3", f"=SUM(B4:B{LAST})"))
    upd.append((f"C3", f"=SUM(C4:C{LAST})"))
    upd.append((f"D3", f"=SUM(D4:D{LAST})"))
    p.escrever_aba(svc, p.REMARK_ABA, upd)

    # 3) formato das novas linhas (idx 26..33)
    svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": [
        rc(26, LAST, 1, 2, CURRENCY),  # B
        rc(26, LAST, 2, 4, NUMBER),    # C,D
        rc(26, LAST, 4, 6, CURRENCY),  # E,F
        rc(26, LAST, 6, 7, PERCENT),   # G
    ]}).execute()

    # 4) preenche B/C/D dos dias pos-CPL ja passados (<= hoje)
    camps = p.campanhas_rmkt()
    hoje = dt.date.today()
    rmkt_col_a = p.get_values(svc, sid, f"'{p.REMARK_ABA}'!A1:A60", "FORMATTED_VALUE")
    filled = []
    for r, lbl in NOVAS:
        dd, mm = lbl.split(" ")[0].split("/")
        d = dt.date(hoje.year, int(mm), int(dd))
        if d <= hoje:
            sp, im, cl = p.rmkt_metricas_dia(camps, d.strftime("%Y-%m-%d"))
            p.escrever_aba(svc, p.REMARK_ABA, [(f"B{r}", sp), (f"C{r}", im), (f"D{r}", cl)])
            filled.append(f"   {lbl}: R$ {sp:,.2f} | impr {im:,} | clk {cl:,}".replace(",", "."))

    # 5) recalcula tabela por tipo (agora cobre ate hoje)
    p.atualizar_tabela_tipos(svc, rmkt_col_a, camps)

    print("REMARKETING estendida ate 15/07. Dias preenchidos:")
    print("\n".join(filled) if filled else "  (nenhum novo dia com dados)")


if __name__ == "__main__":
    main()
