# Aprendizado — Agente Fernanda

Log de evoluções no agente baseado em decisões manuais que o Matheus tomou no chat.

---

## 2026-06-08 — Padrões de otimização do dia codificados

### Contexto
Agente rodou 07h e só sugeriu "vigiar" 2 ads. Matheus precisou pedir análises manuais e tomou 5 decisões que o agente devia ter sugerido sozinho.

### Decisões manuais que viraram regras

1. **Pausei VD_26 da C12** (CPL 3d R$18,30 — ad sem lead suficiente)
   → Já coberto pela regra `pausar_ad_sem_lead` (limiar 3×CPL alvo).

2. **Pausei VD_28 FITCH RATINGS da C21** (R$45 gastos, 0 leads em 3d)
   → Já coberto. Limiar configurado em `regras_otimizacao.pausar_ad_sem_lead.spend_min = 30`.

3. **Reduzi C12 de R$600 → R$480** (CPL hoje R$28,96 = quase 3× alvo)
   → Nova regra: `reduzir_budget_campanha`
   - Gatilho: CPL hoje ≥ 2× CPL alvo E gasto hoje > 50% do budget
   - Ação: -20% no daily_budget

4. **Subi C13 de R$600 → R$720** (CPL hoje R$8,37 🟢, freq 1,02, CTR subindo)
   → Nova regra: `subir_budget_campanha`
   - Gatilho: CPL hoje ≤ alvo E (freq 3d < 1.10 OU CTR subindo)
   - Ação: +20% no daily_budget

5. **Pedi 2 próximos da fila pra C21 e C12** (cada uma com 1 criativo carregando >90% do gasto)
   → Nova regra: `alerta_mono_criativo`
   - Gatilho: 1 ad responde por >80% do gasto 3d da campanha
   - Ação sugerida: `subir_2_proximos_fila` (heuristica, ainda nao executa)

6. **VD_26 morreu na C12 mas estava se recuperando na C21**
   → Heuristica documentada no yaml: criativo cansado em uma campanha pode reviver em outra (publico frio diferente). Antes de banir global, testar em outra campanha.
   → Detectada pela regra `sinal_virada_criativo`: CPM↓ + CTR↑ + CPL hoje < CPL 3d = manter rodando.

### O que mudou no codigo

**`clientes/fernanda.yaml`** — bloco novo `regras_otimizacao` com 6 regras parametrizadas (gatilhos + acoes).

**`motor/diagnosticar.py`**:
- `_serie_diaria(ad, metrica)` — pega serie [d3, d2, d1] da janela do snapshot.
- `_tendencia(serie, maior_pior)` — classifica `piorando`/`melhorando`/`estavel`.
- `diagnosticar_ad` ganhou 2 regras: `pausar_ad_tendencia_ruim` (3 dias seguidos piorando + CPL ultimo dia >= R$18) e `sinal_virada_criativo` (manter rodando se CPM↓ + CTR↑).
- `diagnosticar_budget_campanha` — nova funcao, sugere subir/reduzir budget de campanha.
- `diagnosticar_mono_criativo` — nova funcao, alerta quando 1 ad domina >80% do gasto.

**`motor/coletar.py`** — janelas `d1`, `d2`, `d3` adicionadas (necessario pra serie diaria funcionar).

### Validacao
Dry-run em 2026-06-08 09h pos atualizacao:
- Antes: 2 sugestoes ("vigiar VD_26", "vigiar AVIAO")
- Depois: 6 sugestoes incluindo `reduzir C12 -20%`, `mono-criativo em C12/C13/C21`, mais as 2 originais.

### Acoes futuras
Promover `reduzir_budget_campanha` e `subir_budget_campanha` de sugerir → executar (modo `acoes_fase_2`). Agente ja tem a funcao `mudar_budget_diario` no `executor.py`.

`subir_2_proximos_fila` precisa funcao executor nova — bloqueada por permissao API (App da BM Fernanda nao tem capability pra criar adcreatives, descoberto hoje).
