// Cálculo de custo de tokens da IA. Preços do Claude Haiku 4.5 (USD por 1M tokens).
// Fonte: tabela da Anthropic. Ajustar aqui se trocar de modelo ou mudar o preço.
const PRECO = {
  input: 1.0 / 1_000_000, // input normal (não cacheado)
  output: 5.0 / 1_000_000,
  cacheWrite: 1.25 / 1_000_000, // gravar no cache custa 25% a mais que input
  cacheRead: 0.1 / 1_000_000, // ler do cache custa 90% menos
};

// cotação USD→BRL usada pra exibir. Aproximada; o custo real é em USD.
const USD_BRL = 5.5;

export function calcularCusto(u: {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}): { usd: number; brl: number } {
  const usd =
    u.input * PRECO.input +
    u.output * PRECO.output +
    u.cacheWrite * PRECO.cacheWrite +
    u.cacheRead * PRECO.cacheRead;
  return { usd, brl: usd * USD_BRL };
}

// formata BRL com 2 casas (custos são pequenos, precisa de centavos)
export function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}
