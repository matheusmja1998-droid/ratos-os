/**
 * Papéis de um prato brasileiro.
 *
 * A ideia: em vez de devolver "150 g de proteína" e deixar a pessoa montar o
 * prato, o app monta o prato — base, proteína, acompanhamento, salada — e
 * deixa trocar cada componente por outro do mesmo papel. É assim que se
 * pensa comida: "arroz, feijão, carne e salada", não "42 g de carboidrato".
 */
export type PapelPrato = 'base' | 'leguminosa' | 'proteina' | 'acompanhamento' | 'salada' | 'fruta' | 'bebida';

export interface DefinicaoPapel {
  papel: PapelPrato;
  rotulo: string;
  /** Trechos de nome que identificam um alimento deste papel. */
  termos: string[];
  /** Porção típica no prato, em gramas. */
  gramasTipicas: number;
  /** Quantos componentes deste papel entram no prato, por refeição. */
  quantos: number;
}

/** Composição de cada tipo de refeição, na ordem em que aparece no prato. */
export const MODELOS_REFEICAO: Record<string, PapelPrato[]> = {
  cafe: ['base', 'proteina', 'fruta', 'bebida'],
  almoco: ['base', 'leguminosa', 'proteina', 'acompanhamento', 'salada'],
  janta: ['base', 'leguminosa', 'proteina', 'salada'],
  lanche: ['base', 'proteina', 'fruta'],
  ceia: ['proteina', 'fruta'],
};

/** Descobre o tipo de refeição pelo nome que a pessoa deu. */
export function tipoDaRefeicao(nome: string): keyof typeof MODELOS_REFEICAO {
  const n = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  if (/(cafe|manha|desjejum|breakfast)/.test(n)) return 'cafe';
  if (/(almoco|almoçar)/.test(n)) return 'almoco';
  if (/(janta|jantar|noite)/.test(n)) return 'janta';
  if (/(ceia|antes de dormir)/.test(n)) return 'ceia';
  if (/(lanche|tarde|pos.?treino|merenda)/.test(n)) return 'lanche';

  // "Refeição 1", "Refeição 2"... sem pista: trata como almoço, que é o prato
  // mais completo e portanto o mais fácil de podar.
  return 'almoco';
}

/**
 * O que realmente vai no prato do brasileiro, na ordem de preferência.
 *
 * Sem isso a base devolve "Inhame" antes de "Arroz branco" — tecnicamente
 * certo, irreal na mesa. Quem casa com um destes sobe na lista.
 */
export const PREFERIDOS: Record<PapelPrato, string[]> = {
  base: ['arroz branco', 'arroz', 'macarrao', 'batata inglesa', 'batata doce', 'mandioca', 'pao', 'tapioca', 'cuscuz'],
  leguminosa: ['feijao carioca', 'feijao preto', 'feijao', 'lentilha', 'grao de bico'],
  proteina: [
    'peito de frango', 'frango', 'patinho', 'acem', 'carne', 'bisteca',
    'tilapia', 'ovo', 'atum', 'sardinha', 'queijo', 'iogurte',
  ],
  acompanhamento: ['farofa', 'brocolis', 'cenoura', 'abobrinha', 'couve', 'legumes', 'vagem', 'beterraba'],
  salada: ['alface', 'tomate', 'rucula', 'pepino', 'repolho', 'salada'],
  fruta: ['banana', 'maca', 'mamao', 'laranja', 'melancia', 'abacaxi', 'manga'],
  bebida: ['leite', 'cafe', 'suco'],
};

/** Quanto este alimento é "de prato" para o papel. Maior é melhor. */
export function notaDePreferencia(
  papel: PapelPrato,
  nome: string,
  tipo?: keyof typeof MODELOS_REFEICAO,
): number {
  const alvo = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // Café e lanche pedem outra comida: pão e ovo, não arroz e bife.
  const especifico = tipo ? PREFERIDOS_POR_REFEICAO[tipo]?.[papel] : undefined;
  const lista = especifico ?? PREFERIDOS[papel] ?? [];

  const i = lista.findIndex((t) => alvo.includes(t));
  return i === -1 ? 0 : lista.length - i;
}

/**
 * Preferências que mudam conforme a refeição.
 *
 * Sem isso o café da manhã vem com arroz e peito de frango: correto em macro,
 * absurdo na mesa. Só declara o que difere do padrão.
 */
export const PREFERIDOS_POR_REFEICAO: Partial<
  Record<keyof typeof MODELOS_REFEICAO, Partial<Record<PapelPrato, string[]>>>
> = {
  cafe: {
    base: ['pao de forma', 'pao frances', 'pao', 'tapioca', 'aveia', 'cuscuz', 'crepioca'],
    proteina: ['ovo', 'queijo', 'iogurte', 'presunto', 'clara', 'whey'],
    bebida: ['cafe', 'leite', 'suco'],
  },
  lanche: {
    base: ['pao de forma', 'pao', 'tapioca', 'aveia', 'biscoito'],
    proteina: ['iogurte', 'queijo', 'ovo', 'whey', 'presunto'],
  },
  ceia: {
    proteina: ['iogurte', 'queijo', 'ovo', 'leite', 'whey'],
    fruta: ['banana', 'maca', 'mamao'],
  },
};

export const PAPEIS: DefinicaoPapel[] = [
  {
    papel: 'base',
    rotulo: 'Base',
    gramasTipicas: 120,
    quantos: 1,
    termos: [
      'arroz', 'macarrao', 'batata', 'mandioca', 'inhame', 'cara ', 'polenta',
      'cuscuz', 'quinoa', 'pao', 'tapioca', 'aveia', 'farofa', 'purê', 'pure',
      'milho verde', 'nhoque', 'panqueca', 'crepioca',
    ],
  },
  {
    papel: 'leguminosa',
    rotulo: 'Feijão',
    gramasTipicas: 90,
    quantos: 1,
    termos: ['feijao', 'lentilha', 'grao de bico', 'ervilha', 'fava,', 'soja'],
  },
  {
    papel: 'proteina',
    rotulo: 'Proteína',
    gramasTipicas: 130,
    quantos: 1,
    termos: [
      'frango', 'peito', 'coxa', 'sobrecoxa', 'carne', 'patinho', 'acem',
      'alcatra', 'coxao', 'contra file', 'maminha', 'picanha', 'fraldinha',
      'bisteca', 'lombo', 'pernil', 'costela', 'file', 'bife', 'hamburguer',
      'peixe', 'tilapia', 'atum', 'sardinha', 'merluza', 'salmao', 'pescada',
      'ovo', 'clara', 'omelete', 'queijo', 'iogurte', 'whey', 'presunto',
      'peru', 'linguica', 'almondega', 'strogonoff', 'estrogonofe',
    ],
  },
  {
    papel: 'acompanhamento',
    rotulo: 'Acompanhamento',
    gramasTipicas: 80,
    quantos: 1,
    termos: [
      'farofa', 'batata palha', 'vinagrete', 'couve', 'abobrinha', 'berinjela',
      'brocolis', 'couve-flor', 'cenoura', 'abobora', 'chuchu', 'quiabo',
      'vagem', 'beterraba', 'legumes', 'mandioca', 'banana da terra',
    ],
  },
  {
    papel: 'salada',
    rotulo: 'Salada',
    gramasTipicas: 60,
    quantos: 1,
    termos: [
      'alface', 'rucula', 'agriao', 'tomate', 'pepino', 'repolho', 'acelga',
      'escarola', 'chicoria', 'salada', 'espinafre', 'palmito', 'cebola',
    ],
  },
  {
    papel: 'fruta',
    rotulo: 'Fruta',
    gramasTipicas: 120,
    quantos: 1,
    termos: [
      'banana', 'maca', 'mamao', 'melancia', 'melao', 'abacaxi', 'laranja',
      'manga', 'uva', 'pera', 'morango', 'kiwi', 'goiaba', 'tangerina',
      'abacate', 'ameixa', 'caqui', 'acai',
    ],
  },
  {
    papel: 'bebida',
    rotulo: 'Bebida',
    gramasTipicas: 200,
    quantos: 1,
    termos: ['leite', 'cafe', 'suco', 'cha ', 'achocolatado', 'vitamina'],
  },
];

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Que papel este alimento cumpre no prato?
 *
 * A ordem de PAPEIS importa: mandioca serve de base e de acompanhamento, e
 * base vem primeiro porque é o uso mais comum.
 */
export function papelDoAlimento(nome: string): PapelPrato | null {
  const alvo = normalizar(nome);
  for (const p of PAPEIS) {
    if (p.termos.some((t) => alvo.includes(t))) return p.papel;
  }
  return null;
}
