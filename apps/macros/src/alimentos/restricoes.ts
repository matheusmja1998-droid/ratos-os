/**
 * Restrições alimentares declaradas no cadastro.
 *
 * Cada uma vira um filtro sobre a base: em vez de a pessoa descartar sardinha,
 * ovo e leite um a um, ela diz "não como peixe" uma vez e some tudo de peixe.
 *
 * O casamento é por trecho do nome normalizado. É deliberadamente generoso —
 * numa dúvida entre esconder demais e sugerir o que a pessoa não come, esconder
 * é o erro barato: ela sempre pode buscar o alimento pelo nome.
 */
export interface Restricao {
  chave: string;
  rotulo: string;
  ajuda: string;
  /** Grupo em que aparece no cadastro. */
  grupo: 'Carnes e ovos' | 'Laticínios' | 'Vegetais' | 'Grãos e massas' | 'Outros';
  /** Trechos de nome que caem nesta restrição. */
  termos: string[];
}

export const RESTRICOES: Restricao[] = [
  {
    chave: 'carne_vermelha',
    rotulo: 'Carne vermelha',
    ajuda: 'boi, porco, cordeiro',
    grupo: 'Carnes e ovos',
    termos: [
      'carne', 'boi', 'bovin', 'patinho', 'acem', 'alcatra', 'coxao', 'contra file',
      'file mignon', 'maminha', 'picanha', 'fraldinha', 'costela', 'lagarto',
      'musculo', 'porco', 'suin', 'bisteca', 'lombo', 'pernil', 'bacon', 'toucinho',
      'linguica', 'salsicha', 'presunto', 'mortadela', 'salame', 'cordeiro',
      'carneiro', 'vitela', 'hamburguer', 'churrasco', 'feijoada', 'paio',
    ],
  },
  {
    chave: 'frango',
    rotulo: 'Frango e aves',
    ajuda: 'frango, peru, codorna',
    grupo: 'Carnes e ovos',
    termos: ['frango', 'galinha', 'peru', 'chester', 'codorna', 'pato'],
  },
  {
    chave: 'peixe',
    rotulo: 'Peixe e frutos do mar',
    ajuda: 'peixe, camarão, lula',
    grupo: 'Carnes e ovos',
    termos: [
      'peixe', 'atum', 'sardinha', 'tilapia', 'salmao', 'bacalhau', 'merluza',
      'pescad', 'corvina', 'abadejo', 'cacao', 'namorado', 'pintado', 'tucunare',
      'traira', 'camarao', 'lula', 'polvo', 'mexilhao', 'ostra', 'siri',
      'caranguejo', 'lagosta', 'anchova', 'arenque', 'truta', 'dourado',
      // Nomes regionais de peixe que a lista genérica não pega.
      'porquinho', 'pescadinha', 'badejo', 'cavala', 'cioba', 'garoupa',
      'robalo', 'tainha', 'sarda', 'espada', 'agulha', 'carapeba', 'xareu',
      'pacu', 'pirarucu', 'piau', 'curimata', 'surubim', 'mapara', 'filhote',
    ],
  },
  {
    chave: 'ovo',
    rotulo: 'Ovo',
    ajuda: 'ovo, clara, omelete',
    grupo: 'Carnes e ovos',
    termos: ['ovo', 'clara', 'gema', 'omelete'],
  },
  {
    chave: 'leite',
    rotulo: 'Leite e derivados',
    ajuda: 'leite, queijo, iogurte',
    grupo: 'Laticínios',
    termos: [
      'leite', 'queijo', 'iogurte', 'requeijao', 'manteiga', 'creme de leite',
      'nata', 'coalhada', 'ricota', 'mussarela', 'parmesao', 'cottage',
      'whey', 'achocolatado', 'doce de leite', 'condensado',
    ],
  },
  {
    chave: 'gluten',
    rotulo: 'Glúten',
    ajuda: 'trigo, pão, massa',
    grupo: 'Grãos e massas',
    termos: [
      'trigo', 'pao', 'macarrao', 'massa', 'biscoito', 'bolacha', 'bolo',
      'torrada', 'farinha de trigo', 'cevada', 'centeio', 'aveia', 'pizza',
      'lasanha', 'nhoque', 'panqueca', 'salgadinho', 'empada', 'pastel',
      'coxinha', 'esfiha', 'cerveja',
    ],
  },
  {
    chave: 'alcool',
    rotulo: 'Álcool',
    ajuda: 'cerveja, vinho, destilado',
    grupo: 'Outros',
    termos: ['cerveja', 'vinho', 'cachaca', 'whisky', 'vodka', 'aguardente', 'licor', 'chopp'],
  },
  {
    chave: 'suino',
    rotulo: 'Só porco',
    ajuda: 'mantém boi e frango',
    grupo: 'Carnes e ovos',
    termos: [
      'porco', 'suin', 'bacon', 'toucinho', 'presunto', 'lombo', 'pernil',
      'bisteca', 'linguica', 'salame', 'paio', 'torresmo',
    ],
  },
  {
    chave: 'feijao',
    rotulo: 'Feijão e leguminosas',
    ajuda: 'feijão, lentilha, grão de bico',
    grupo: 'Grãos e massas',
    termos: ['feijao', 'lentilha', 'grao de bico', 'ervilha', 'soja', 'tremoco', 'fava'],
  },
  {
    chave: 'folhas',
    rotulo: 'Folhas e saladas',
    ajuda: 'alface, rúcula, couve',
    grupo: 'Vegetais',
    termos: [
      'alface', 'rucula', 'agriao', 'couve', 'espinafre', 'acelga', 'escarola',
      'chicoria', 'almeirao', 'repolho', 'salada',
    ],
  },
  {
    chave: 'legumes',
    rotulo: 'Legumes',
    ajuda: 'abobrinha, berinjela, brócolis',
    grupo: 'Vegetais',
    termos: [
      'abobrinha', 'berinjela', 'brocolis', 'couve-flor', 'chuchu', 'quiabo',
      'jilo', 'vagem', 'pepino', 'pimentao', 'beterraba', 'cenoura', 'abobora',
      'tomate', 'nabo', 'rabanete',
    ],
  },
  {
    chave: 'cogumelo',
    rotulo: 'Cogumelos',
    ajuda: 'champignon, shitake',
    grupo: 'Vegetais',
    termos: ['cogumelo', 'champignon', 'shitake', 'shimeji', 'funghi'],
  },
  {
    chave: 'castanhas',
    rotulo: 'Castanhas e amendoim',
    ajuda: 'castanha, nozes, amendoim',
    grupo: 'Outros',
    termos: [
      'castanha', 'noz', 'nozes', 'amendoim', 'amendoa', 'avela', 'pistache',
      'macadamia', 'pinhao', 'semente',
    ],
  },
  {
    chave: 'visceras',
    rotulo: 'Miúdos e vísceras',
    ajuda: 'fígado, coração, moela',
    grupo: 'Carnes e ovos',
    termos: ['figado', 'coracao', 'moela', 'rim', 'bucho', 'dobradinha', 'lingua', 'miolo'],
  },
];

/** Restrições agrupadas, na ordem em que aparecem no cadastro. */
export const GRUPOS_RESTRICAO = [
  'Carnes e ovos',
  'Laticínios',
  'Grãos e massas',
  'Vegetais',
  'Outros',
] as const;

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** O alimento cai em alguma das restrições escolhidas? */
export function violaRestricao(
  nomeAlimento: string,
  restricoes: string[] = [],
): boolean {
  if (!restricoes.length) return false;
  const alvo = normalizar(nomeAlimento);

  return RESTRICOES.filter((r) => restricoes.includes(r.chave)).some((r) =>
    r.termos.some((t) => alvo.includes(t)),
  );
}
