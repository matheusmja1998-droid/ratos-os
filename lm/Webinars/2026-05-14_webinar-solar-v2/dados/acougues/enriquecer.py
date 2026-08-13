import json, csv

raw = json.load(open('dados/acougues/apify_raw.json'))
filtered = [r for r in raw if not r.get('permanentlyClosed') and not r.get('temporarilyClosed') and 'Belo Horizonte' in (r.get('address') or '')][:30]

# Açougues: classificação por nº reviews + nome
# Boutique de carne / casa de carnes premium = alto ticket
# Açougue de bairro tradicional = baixo ticket
# Frigorífico / distribuidor = atacado
def classificar(title, reviews):
    t = title.lower()
    if 'boutique' in t or 'prime' in t or 'nobres' in t:
        return 'boutique de carnes'
    if 'frigo' in t or 'distribuid' in t or 'central carnes' in t:
        return 'atacado/distribuição'
    if reviews >= 100:
        return 'açougue de referência'
    if reviews >= 40:
        return 'açougue consolidado'
    return 'açougue de bairro'

# Consumo elétrico de açougue (refrigeração 24/7, balança, iluminação, climatização)
# Açougue de bairro (60-120m²): 1.5-4 MWh/ano, R$1.5k-4k/mês
# Consolidado (120-250m²): 4-9 MWh/ano, R$4k-9k/mês
# Referência (250-400m²): 9-18 MWh/ano, R$9k-18k/mês
# Boutique (premium, mais climatização): 12-25 MWh/ano, R$12k-25k/mês
# Atacado/distribuição (câmaras frias grandes): 30-100 MWh/ano, R$30k-100k/mês
CONSUMO = {
    'açougue de bairro':       ('1.5-4', '1.5-4'),
    'açougue consolidado':     ('4-9', '4-9'),
    'açougue de referência':   ('9-18', '9-18'),
    'boutique de carnes':      ('12-25', '12-25'),
    'atacado/distribuição':    ('30-100', '30-100'),
}

def gerar_dor_gancho(title, porte, neighborhood, reviews):
    if porte == 'atacado/distribuição':
        dor = "Câmaras frias rodando 24/7 são o maior custo fixo depois da carne — qualquer aumento de tarifa some com a margem."
        gancho = "Economia de energia em escala (corte direto no custo fixo dominante) · Autonomia se a CEMIG cair (câmara fria parada = mercadoria perdida em horas) · Sustentabilidade pra negociar com supermercado/atacado cliente."
    elif porte == 'boutique de carnes':
        dor = "Climatização forte + iluminação de vitrine + câmaras = conta de luz pesando muito num negócio de ticket alto."
        gancho = "Economia que vira investimento em premium (fachada, vitrine, carnes nobres) · Autonomia da vitrine se a luz cair (cliente boutique não tolera operação parada) · Sustentabilidade como narrativa de marca premium."
    elif porte == 'açougue de referência':
        dor = "Movimento alto, refrigeração no limite, energia comendo parte da margem mesmo com bom giro."
        gancho = "Economia mensal direta (giro alto = consumo alto = conta pesada) · Autonomia da câmara se faltar luz (proteção do estoque) · Sustentabilidade como diferencial pra fidelizar a clientela do bairro."
    elif porte == 'açougue consolidado':
        dor = "Operação enxuta, margem fina, dono toma decisão de compra — energia é dor visível todo mês."
        gancho = "Economia direta na conta (dor mensal visível no caixa) · Autonomia se a luz cair (refrigeração não pode parar) · Sustentabilidade como vantagem local (poucos açougues do bairro têm solar)."
    else:  # bairro
        dor = "Margem fina, dono na operação, conta de luz pesa direto no fluxo de caixa do mês."
        gancho = "Economia na conta mensal (alivia fluxo de caixa apertado) · Autonomia da câmara fria se faltar luz (sobrevivência do negócio) · Sustentabilidade como diferencial pro consumidor consciente do bairro."
    return dor, gancho

out = []
for i, r in enumerate(filtered, 1):
    title = r.get('title','')
    porte = classificar(title, r.get('reviewsCount', 0))
    mwh, conta_mil = CONSUMO[porte]
    dor, gancho = gerar_dor_gancho(title, porte, r.get('neighborhood','BH'), r.get('reviewsCount',0))
    site = r.get('website') or ''
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

with open('dados/acougues/acougues-bh-enriquecido.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=out[0].keys())
    w.writeheader()
    w.writerows(out)

json.dump(out, open('dados/acougues/acougues-bh-enriquecido.json','w'), ensure_ascii=False, indent=2)
print(f'OK: {len(out)} açougues')
