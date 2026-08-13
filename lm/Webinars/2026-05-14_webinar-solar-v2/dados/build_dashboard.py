import json, html

data = json.load(open('dados/supermercados-bh-enriquecido.json'))

rows_html = []
for r in data:
    site_link = ''
    if r['Site'] and r['Site'] not in ('-', '(só Instagram)'):
        site_link = f'<a href="{html.escape(r["Site"])}" target="_blank">site</a>'
    elif r['Site'] == '(só Instagram)':
        site_link = '<span style="color:#888;">Instagram</span>'
    else:
        site_link = '<span style="color:#555;">—</span>'

    rows_html.append(f"""
    <tr>
      <td class="num">{r['#']}</td>
      <td class="empresa"><strong>{html.escape(r['Empresa'])}</strong><br><span class="meta">{html.escape(r['Bairro'])} · {html.escape(r['Categoria'])}</span></td>
      <td class="porte"><span class="badge">{html.escape(r['Porte estimado'])}</span></td>
      <td class="rating">⭐ {r['Rating']}<br><span class="meta">{r['Reviews']} reviews</span></td>
      <td class="contato">{html.escape(str(r['Telefone']))}<br>{site_link}</td>
      <td class="consumo"><strong>{r['Consumo estimado (MWh/ano)']}</strong> MWh/ano<br><span class="meta">R$ {r['Conta estimada (R$ mil/mês)']} mil/mês</span></td>
      <td class="dor">{html.escape(r['Dor principal'])}</td>
      <td class="gancho">{html.escape(r['Lógica de abordagem'])}</td>
    </tr>
    """)

# Stats
total = len(data)
big = sum(1 for r in data if 'grande' in r['Porte estimado'].lower() or 'atacarejo' in r['Porte estimado'].lower())
medium = sum(1 for r in data if 'média' in r['Porte estimado'].lower() or 'médio' in r['Porte estimado'].lower())
small = total - big - medium

html_out = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Prospecção Supermercados BH — L.M Agência</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{
  background: #0A0A0A;
  color: #FFFFFF;
  font-family: 'Plus Jakarta Sans', sans-serif;
  padding: 40px 60px;
  min-height: 100vh;
}}
header {{
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 30px;
  border-bottom: 2px solid #111;
  margin-bottom: 40px;
}}
.brand {{
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 4px;
  color: #00E676;
}}
.brand .sub {{
  display: block;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 6px;
  color: #888;
  margin-top: 4px;
}}
.meta-info {{
  text-align: right;
  font-size: 14px;
  color: #888;
  letter-spacing: 1px;
}}
h1 {{
  font-size: 54px;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 12px;
}}
h1 .accent {{ color: #00E676; }}
.lead {{
  font-size: 20px;
  color: #BBB;
  max-width: 1100px;
  margin-bottom: 50px;
  line-height: 1.4;
}}
.stats {{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 50px;
}}
.stat {{
  background: #111;
  border-radius: 12px;
  padding: 28px 32px;
  border-left: 4px solid #00E676;
}}
.stat .num {{
  font-size: 48px;
  font-weight: 800;
  color: #00E676;
  line-height: 1;
}}
.stat .lbl {{
  font-size: 14px;
  font-weight: 600;
  color: #888;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-top: 12px;
}}
table {{
  width: 100%;
  border-collapse: collapse;
  background: #0F0F0F;
  border-radius: 12px;
  overflow: hidden;
}}
thead {{
  background: #161616;
  border-bottom: 2px solid #00E676;
}}
th {{
  text-align: left;
  padding: 18px 16px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #00E676;
  text-transform: uppercase;
}}
td {{
  padding: 18px 16px;
  border-bottom: 1px solid #1A1A1A;
  font-size: 14px;
  color: #DDD;
  vertical-align: top;
  line-height: 1.4;
}}
tr:hover td {{ background: #131313; }}
.num {{ color:#666; font-weight:800; font-size:18px; width:40px; }}
.empresa strong {{ color:#FFF; font-size:15px; }}
.meta {{ color:#666; font-size:12px; }}
.badge {{
  display: inline-block;
  background: #00E676;
  color: #0A0A0A;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  white-space: nowrap;
}}
.dor {{ color:#FF8888; font-style: italic; font-size:13px; max-width:280px; }}
.gancho {{ color:#9FFFC2; font-size:13px; max-width:380px; }}
.consumo strong {{ color:#00E676; font-size:16px; }}
.contato a {{ color:#00E676; text-decoration:none; }}
.contato a:hover {{ text-decoration:underline; }}
.footer {{
  margin-top: 60px;
  padding-top: 30px;
  border-top: 1px solid #222;
  text-align: center;
  font-size: 13px;
  color: #555;
  letter-spacing: 2px;
}}
.disclaimer {{
  background: #151515;
  border-left: 4px solid #FFC040;
  padding: 16px 24px;
  margin: 40px 0;
  font-size: 13px;
  color: #BBB;
  border-radius: 8px;
  line-height: 1.5;
}}
.disclaimer strong {{ color: #FFC040; }}
</style>
</head>
<body>

<header>
  <div class="brand">L.M<span class="sub">CONSULTORIA COMERCIAL</span></div>
  <div class="meta-info">
    PROSPECÇÃO AO VIVO · BELO HORIZONTE · MAIO 2026<br>
    Fonte: Google Maps via Apify + enriquecimento IA
  </div>
</header>

<h1>30 supermercados em BH<br>com <span class="accent">lógica de abordagem pronta.</span></h1>
<p class="lead">Lista com empresa, bairro, porte estimado, telefone, faixa de consumo energético, dor principal extraída do tipo de negócio e lógica de abordagem personalizada (economia / autonomia / sustentabilidade). Sem digitação manual. Sem 2 semanas de Google Maps.</p>

<div class="stats">
  <div class="stat"><div class="num">{total}</div><div class="lbl">Empresas mapeadas</div></div>
  <div class="stat"><div class="num">{big}</div><div class="lbl">Redes grandes / atacarejo</div></div>
  <div class="stat"><div class="num">{medium}</div><div class="lbl">Porte médio</div></div>
  <div class="stat"><div class="num">{small}</div><div class="lbl">Porte pequeno / bairro</div></div>
</div>

<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Empresa</th>
      <th>Porte</th>
      <th>Rating</th>
      <th>Contato</th>
      <th>Consumo / Conta</th>
      <th>Dor principal</th>
      <th>Lógica de abordagem</th>
    </tr>
  </thead>
  <tbody>
    {''.join(rows_html)}
  </tbody>
</table>

<div class="disclaimer">
  <strong>Sobre as estimativas:</strong> consumo e conta de luz são faixas empíricas baseadas no porte aparente do negócio (rede, atacarejo, bairro) e benchmarks de mercado pra supermercado no Brasil. Não são números reais da unidade. Servem como ponto de partida pra abordagem — o número exato vem com o diagnóstico.
</div>

<div class="footer">
  L.M CONSULTORIA COMERCIAL · MATHEUS JARDIM · (31) 98331-7347
</div>

</body>
</html>
"""

with open('dados/dashboard-supermercados-bh.html', 'w', encoding='utf-8') as f:
    f.write(html_out)

print('OK:', 'dados/dashboard-supermercados-bh.html')
