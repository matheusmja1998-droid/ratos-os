import json, csv, re

raw = json.load(open('dados/apify_raw.json'))
filtered = [r for r in raw if not r.get('permanentlyClosed') and not r.get('temporarilyClosed') and 'Belo Horizonte' in (r.get('address') or '')][:30]

# Redes conhecidas com porte estimado
REDES = {
    'Supermercados BH': 'rede grande',
    'SUPERMERCADOS BH': 'rede grande',
    'Epa Supermercados': 'rede grande',
    'Apoio Mineiro': 'atacarejo grande',
    'Uberaba Supermercados': 'rede média',
    'Uberaba Supermercado': 'rede média',
    'Supermercados Paranaiba': 'rede média',
    'Mineirão Atacado': 'atacarejo',
    'Supermercado Opa': 'rede pequena',
    'Supermercado Tirol': 'mercado de bairro',
    'Supermercado Bom Sucesso': 'mercado de bairro',
    'Supermercado Boa Ideia': 'mercado de bairro',
    'Supermercado Campeão': 'mercado de bairro',
    'Supermercado HF': 'mercado de bairro',
}

def classificar(title, reviews):
    for prefix, porte in REDES.items():
        if title.startswith(prefix) or prefix in title:
            return porte
    # Por nº reviews (fallback)
    if reviews > 3000: return 'porte grande'
    if reviews > 1000: return 'porte médio'
    return 'porte pequeno'

# Consumo: faixas empíricas pra supermercado no Brasil
# Pequeno (300-800m²): 8-25 MWh/ano, conta R$8k-25k/mês
# Médio (800-2000m²): 25-70 MWh/ano, R$25k-70k/mês
# Grande (2000m²+): 70-250 MWh/ano, R$70k-250k/mês
# Atacarejo (5000m²+): 250-800 MWh/ano, R$250k-800k/mês
CONSUMO = {
    'rede grande': ('60-180', '60-180'),
    'rede média': ('25-60', '25-60'),
    'rede pequena': ('12-30', '12-30'),
    'atacarejo grande': ('250-800', '250-800'),
    'atacarejo': ('80-200', '80-200'),
    'mercado de bairro': ('5-15', '5-15'),
    'porte grande': ('40-120', '40-120'),
    'porte médio': ('15-40', '15-40'),
    'porte pequeno': ('5-15', '5-15'),
}

# Dor + lógica de abordagem por tipo (argumentos a usar, não fala pronta)
def gerar_dor_gancho(title, porte, neighborhood, reviews):
    if 'atacarejo' in porte:
        dor = "Margem apertada em atacarejo — energia é um dos maiores custos fixos depois de mercadoria."
        gancho = "Economia de energia em escala (corte direto no maior fixo do atacarejo) · Autonomia se a CEMIG cair (proteção da câmara fria, evita perda de mercadoria) · Sustentabilidade como diferencial pra negociar com fornecedores e marca."
    elif 'rede' in porte and 'grande' in porte:
        dor = "Operação multi-loja com conta de luz alta em cada unidade — payback agregado é o argumento."
        gancho = "Economia agregada entre lojas (payback consolidado) · Autonomia se a luz cair em uma das unidades (não para a operação) · Sustentabilidade como narrativa de rede (selo verde nas embalagens, comunicação em loja)."
    elif 'rede' in porte:
        dor = "Crescendo, mas com margem comprimida — cada R$ economizado em fixo vira investimento de expansão."
        gancho = "Economia que financia a expansão (a parcela do solar é menor que a economia mensal) · Autonomia da operação se a CEMIG cair · Sustentabilidade como diferencial competitivo no bairro/cidade."
    elif 'bairro' in porte:
        dor = "Margem fina, dono presente no caixa, conta de luz mensal aperta o fluxo."
        gancho = "Economia direta na conta mensal (dor visível no fluxo de caixa) · Autonomia se a luz cair (mercado de bairro não pode fechar) · Sustentabilidade pra fidelizar cliente local consciente."
    else:
        dor = "Energia pesa no custo fixo do supermercado — refrigeração e iluminação 24/7."
        gancho = "Economia mensal direta (refrigeração 24/7) · Autonomia se a CEMIG falhar (perda de mercadoria é o pior cenário) · Sustentabilidade como narrativa de marca."
    return dor, gancho

# Montar dataset enriquecido
out = []
for i, r in enumerate(filtered, 1):
    title = r.get('title','')
    porte = classificar(title, r.get('reviewsCount', 0))
    mwh, conta_mil = CONSUMO[porte]
    dor, gancho = gerar_dor_gancho(title, porte, r.get('neighborhood','BH'), r.get('reviewsCount',0))
    site = r.get('website') or ''
    # Limpar site
    if 'instagram.com' in site: site = '(só Instagram)'
    out.append({
        '#': i,
        'Empresa': title,
        'Bairro': r.get('neighborhood','-'),
        'Categoria': r.get('categoryName','-'),
        'Porte estimado': porte.title(),
        'Rating': r.get('totalScore','-'),
        'Reviews': r.get('reviewsCount','-'),
        'Telefone': r.get('phone') or '-',
        'Site': site or '-',
        'Consumo estimado (MWh/ano)': mwh,
        'Conta estimada (R$ mil/mês)': conta_mil,
        'Dor principal': dor,
        'Lógica de abordagem': gancho,
        'Endereço': r.get('address','-'),
    })

# CSV
with open('dados/supermercados-bh-enriquecido.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=out[0].keys())
    w.writeheader()
    w.writerows(out)

# JSON pra dashboard
json.dump(out, open('dados/supermercados-bh-enriquecido.json','w'), ensure_ascii=False, indent=2)

print(f'OK: {len(out)} empresas enriquecidas')
print('CSV:', 'dados/supermercados-bh-enriquecido.csv')
print('JSON:', 'dados/supermercados-bh-enriquecido.json')
