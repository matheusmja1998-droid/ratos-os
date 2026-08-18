/**
 * Tipos do motor de cálculo.
 *
 * A metodologia aqui segue o método do @tchaubuchinho: o usuário aprende
 * a conta, então cada resultado carrega a memória de cálculo ("passos")
 * pra poder ser conferida no papel.
 */

export type Sexo = 'masculino' | 'feminino';

/**
 * Níveis de atividade e seus multiplicadores sobre a TMB.
 * O método é explícito: NÃO superestime. Caminhada leve de seg-sex é "leve",
 * não "moderado". Superestimar aqui destrói o déficit inteiro.
 */
export const NIVEIS_ATIVIDADE = {
  sedentario: { fator: 1.2, rotulo: 'Sedentário', ajuda: 'Trabalho sentado, nenhum exercício regular' },
  leve: { fator: 1.375, rotulo: 'Leve', ajuda: 'Exercício leve 1-3x/semana (ex: caminhada)' },
  moderado: { fator: 1.55, rotulo: 'Moderado', ajuda: 'Musculação séria 3-5x/semana' },
  intenso: { fator: 1.725, rotulo: 'Intenso', ajuda: 'Treino pesado 6-7x/semana' },
  atleta: { fator: 1.9, rotulo: 'Atleta', ajuda: 'Treino 2x/dia ou trabalho físico pesado' },
} as const;

export type NivelAtividade = keyof typeof NIVEIS_ATIVIDADE;

export type Objetivo = 'emagrecer' | 'manter' | 'ganhar';

export interface DadosCorporais {
  sexo: Sexo;
  idadeAnos: number;
  pesoKg: number;
  alturaCm: number;
  nivelAtividade: NivelAtividade;
}

export interface PassoCalculo {
  ordem: number;
  titulo: string;
  formula: string;
  substituicao: string;
  resultado: string;
  porque: string;
}

export interface Macros {
  proteinaG: number;
  carboidratoG: number;
  gorduraG: number;
  calorias: number;
}

export interface ResultadoCalculo {
  tmb: number;
  get: number;
  pesoAlvoKg: number;
  deficitKcal: number;
  metaCalorica: number;
  macros: Macros;
  passos: PassoCalculo[];
  avisos: string[];
}
