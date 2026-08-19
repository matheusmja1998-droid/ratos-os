/**
 * Porções caseiras por alimento.
 *
 * Ninguém pesa ovo: come "dois ovos". Ninguém serve arroz em gramas: bota
 * "duas colheres". A base TACO trabalha em gramas — é o dado correto — mas
 * obrigar a pessoa a converter de cabeça é o que faz ela desistir de registrar.
 *
 * As regras casam por trecho do nome normalizado (sem acento, minúsculo), da
 * mais específica para a mais genérica. A primeira que casar vence.
 *
 * Os pesos são médios de porção comum no Brasil. São estimativa por definição:
 * quem quiser precisão pesa, e a opção de gramas continua ali.
 */
export interface PorcaoCaseira {
  rotulo: string;
  gramas: number;
}

interface RegraPorcao {
  /** Trechos que o nome do alimento precisa conter (todos). */
  contem: string[];
  /** Trechos que impedem a regra de valer. */
  exceto?: string[];
  porcoes: PorcaoCaseira[];
}

const REGRAS: RegraPorcao[] = [
  // ---- Ovos: o caso mais claro de unidade ----
  { contem: ['clara'], porcoes: [{ rotulo: 'clara', gramas: 33 }] },
  { contem: ['gema'], porcoes: [{ rotulo: 'gema', gramas: 17 }] },
  { contem: ['ovo', 'codorna'], porcoes: [{ rotulo: 'ovo de codorna', gramas: 10 }] },
  { contem: ['ovo'], porcoes: [
    { rotulo: 'ovo médio', gramas: 50 },
    { rotulo: 'ovo grande', gramas: 60 },
  ] },

  // ---- Pães e massas ----
  { contem: ['pao', 'forma'], porcoes: [{ rotulo: 'fatia', gramas: 25 }] },
  { contem: ['pao', 'frances'], porcoes: [{ rotulo: 'unidade', gramas: 50 }] },
  { contem: ['pao', 'queijo'], porcoes: [
    { rotulo: 'unidade pequena', gramas: 20 },
    { rotulo: 'unidade média', gramas: 35 },
  ] },
  { contem: ['pao'], porcoes: [{ rotulo: 'unidade', gramas: 50 }] },
  { contem: ['tapioca'], porcoes: [{ rotulo: 'unidade', gramas: 90 }] },
  { contem: ['torrada'], porcoes: [{ rotulo: 'unidade', gramas: 8 }] },
  { contem: ['biscoito'], porcoes: [{ rotulo: 'unidade', gramas: 8 }] },

  // ---- Frutas em unidade ----
  { contem: ['banana'], porcoes: [
    { rotulo: 'unidade média', gramas: 70 },
    { rotulo: 'unidade grande', gramas: 100 },
  ] },
  { contem: ['maca'], porcoes: [{ rotulo: 'unidade média', gramas: 130 }] },
  { contem: ['laranja'], porcoes: [{ rotulo: 'unidade média', gramas: 180 }] },
  { contem: ['tangerina'], porcoes: [{ rotulo: 'unidade', gramas: 120 }] },
  { contem: ['pera'], porcoes: [{ rotulo: 'unidade', gramas: 130 }] },
  { contem: ['kiwi'], porcoes: [{ rotulo: 'unidade', gramas: 75 }] },
  { contem: ['ameixa'], porcoes: [{ rotulo: 'unidade', gramas: 60 }] },
  { contem: ['manga'], porcoes: [{ rotulo: 'unidade', gramas: 200 }] },
  { contem: ['abacate'], porcoes: [{ rotulo: 'unidade', gramas: 200 }] },
  { contem: ['mamao'], porcoes: [{ rotulo: 'fatia', gramas: 130 }] },
  { contem: ['melancia'], porcoes: [{ rotulo: 'fatia', gramas: 200 }] },
  { contem: ['melao'], porcoes: [{ rotulo: 'fatia', gramas: 150 }] },
  { contem: ['abacaxi'], porcoes: [{ rotulo: 'fatia', gramas: 100 }] },
  { contem: ['morango'], porcoes: [{ rotulo: 'unidade', gramas: 12 }] },
  { contem: ['uva'], porcoes: [{ rotulo: 'cacho pequeno', gramas: 100 }] },

  // ---- Arroz, feijão e companhia: colher e concha ----
  { contem: ['arroz'], exceto: ['cru', 'doce'], porcoes: [
    { rotulo: 'colher de servir', gramas: 45 },
    { rotulo: 'escumadeira', gramas: 80 },
  ] },
  { contem: ['feijao'], exceto: ['cru'], porcoes: [
    { rotulo: 'concha média', gramas: 80 },
    { rotulo: 'concha grande', gramas: 110 },
  ] },
  { contem: ['lentilha'], porcoes: [{ rotulo: 'concha', gramas: 80 }] },
  { contem: ['grao de bico'], porcoes: [{ rotulo: 'concha', gramas: 80 }] },
  { contem: ['macarrao'], exceto: ['cru'], porcoes: [
    { rotulo: 'pegador', gramas: 100 },
    { rotulo: 'prato', gramas: 200 },
  ] },
  { contem: ['farofa'], porcoes: [{ rotulo: 'colher de sopa', gramas: 20 }] },
  { contem: ['cuscuz'], porcoes: [{ rotulo: 'porção', gramas: 120 }] },
  { contem: ['pure'], porcoes: [{ rotulo: 'colher de servir', gramas: 60 }] },

  // ---- Carnes: filé, bife, pedaço ----
  { contem: ['peito', 'frango'], porcoes: [
    { rotulo: 'filé médio', gramas: 120 },
    { rotulo: 'filé grande', gramas: 180 },
  ] },
  { contem: ['coxa'], porcoes: [{ rotulo: 'unidade', gramas: 90 }] },
  { contem: ['sobrecoxa'], porcoes: [{ rotulo: 'unidade', gramas: 110 }] },
  { contem: ['asa'], porcoes: [{ rotulo: 'unidade', gramas: 40 }] },
  { contem: ['bisteca'], porcoes: [{ rotulo: 'unidade', gramas: 120 }] },
  { contem: ['file'], porcoes: [{ rotulo: 'filé médio', gramas: 120 }] },
  { contem: ['hamburguer'], porcoes: [{ rotulo: 'unidade', gramas: 80 }] },
  { contem: ['linguica'], porcoes: [{ rotulo: 'gomo', gramas: 60 }] },
  { contem: ['salsicha'], porcoes: [{ rotulo: 'unidade', gramas: 50 }] },
  { contem: ['sardinha'], porcoes: [{ rotulo: 'unidade', gramas: 40 }] },
  { contem: ['tilapia'], porcoes: [{ rotulo: 'filé', gramas: 130 }] },
  { contem: ['carne'], exceto: ['moida'], porcoes: [{ rotulo: 'bife médio', gramas: 100 }] },
  { contem: ['patinho'], porcoes: [{ rotulo: 'porção', gramas: 100 }] },
  { contem: ['acem'], porcoes: [{ rotulo: 'porção', gramas: 100 }] },
  { contem: ['presunto'], porcoes: [{ rotulo: 'fatia', gramas: 15 }] },
  { contem: ['mortadela'], porcoes: [{ rotulo: 'fatia', gramas: 20 }] },

  // ---- Laticínios ----
  { contem: ['leite'], exceto: ['po', 'condensado'], porcoes: [
    { rotulo: 'copo (200 ml)', gramas: 200 },
    { rotulo: 'xícara (240 ml)', gramas: 240 },
  ] },
  { contem: ['iogurte'], porcoes: [{ rotulo: 'pote', gramas: 170 }] },
  { contem: ['queijo', 'mussarela'], porcoes: [{ rotulo: 'fatia', gramas: 20 }] },
  { contem: ['queijo', 'minas'], porcoes: [{ rotulo: 'fatia', gramas: 30 }] },
  { contem: ['queijo'], porcoes: [{ rotulo: 'fatia', gramas: 20 }] },
  { contem: ['requeijao'], porcoes: [{ rotulo: 'colher de sopa', gramas: 30 }] },
  { contem: ['manteiga'], porcoes: [{ rotulo: 'ponta de faca', gramas: 8 }] },
  { contem: ['margarina'], porcoes: [{ rotulo: 'ponta de faca', gramas: 8 }] },
  { contem: ['whey'], porcoes: [{ rotulo: 'scoop', gramas: 30 }] },

  // ---- Gorduras e pastas: colher ----
  { contem: ['oleo'], porcoes: [{ rotulo: 'colher de sopa', gramas: 8 }] },
  { contem: ['azeite'], porcoes: [{ rotulo: 'fio', gramas: 5 }, { rotulo: 'colher de sopa', gramas: 8 }] },
  { contem: ['pasta de amendoim'], porcoes: [{ rotulo: 'colher de sopa', gramas: 20 }] },
  { contem: ['creme de avela'], porcoes: [{ rotulo: 'colher de sopa', gramas: 20 }] },
  { contem: ['doce de leite'], porcoes: [{ rotulo: 'colher de sopa', gramas: 25 }] },
  { contem: ['mel'], porcoes: [{ rotulo: 'colher de sopa', gramas: 20 }] },
  { contem: ['acucar'], porcoes: [
    { rotulo: 'colher de chá', gramas: 5 },
    { rotulo: 'colher de sopa', gramas: 12 },
  ] },
  { contem: ['aveia'], porcoes: [{ rotulo: 'colher de sopa', gramas: 15 }] },
  { contem: ['psyllium'], porcoes: [{ rotulo: 'colher de sopa', gramas: 10 }] },

  // ---- Bebidas ----
  { contem: ['cerveja'], porcoes: [
    { rotulo: 'lata (350 ml)', gramas: 350 },
    { rotulo: 'long neck', gramas: 355 },
  ] },
  { contem: ['refrigerante'], porcoes: [{ rotulo: 'lata (350 ml)', gramas: 350 }] },
  { contem: ['suco'], porcoes: [{ rotulo: 'copo (200 ml)', gramas: 200 }] },
  { contem: ['cafe'], porcoes: [{ rotulo: 'xícara', gramas: 50 }] },
  { contem: ['vinho'], porcoes: [{ rotulo: 'taça', gramas: 150 }] },

  // ---- Doces e salgados ----
  { contem: ['chocolate'], porcoes: [
    { rotulo: 'quadradinho', gramas: 6 },
    { rotulo: 'barra pequena', gramas: 25 },
  ] },
  { contem: ['brigadeiro'], porcoes: [{ rotulo: 'unidade', gramas: 20 }] },
  { contem: ['sorvete'], porcoes: [{ rotulo: 'bola', gramas: 60 }] },
  { contem: ['pizza'], porcoes: [{ rotulo: 'fatia', gramas: 100 }] },
  { contem: ['pastel'], porcoes: [{ rotulo: 'unidade', gramas: 80 }] },
  { contem: ['coxinha'], porcoes: [{ rotulo: 'unidade', gramas: 70 }] },
  { contem: ['bolo'], porcoes: [{ rotulo: 'fatia', gramas: 80 }] },
  { contem: ['pipoca'], porcoes: [{ rotulo: 'saco pequeno', gramas: 30 }] },
  { contem: ['batata palha'], porcoes: [{ rotulo: 'punhado', gramas: 25 }] },

  // ---- Tubérculos e legumes em unidade ----
  { contem: ['batata', 'inglesa'], porcoes: [{ rotulo: 'unidade média', gramas: 100 }] },
  { contem: ['batata', 'doce'], porcoes: [{ rotulo: 'unidade média', gramas: 130 }] },
  { contem: ['cenoura'], porcoes: [{ rotulo: 'unidade média', gramas: 90 }] },
  { contem: ['tomate'], porcoes: [{ rotulo: 'unidade média', gramas: 100 }] },
  { contem: ['cebola'], porcoes: [{ rotulo: 'unidade média', gramas: 100 }] },
  { contem: ['alface'], porcoes: [{ rotulo: 'folha', gramas: 10 }] },
];

/** Remove acentos e normaliza, igual à busca. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Porções caseiras que fazem sentido para um alimento.
 * Devolve lista vazia quando nada casa — aí a pessoa usa gramas mesmo.
 */
export function porcoesDe(nome: string, modoPreparo = ''): PorcaoCaseira[] {
  const alvo = normalizar(`${nome} ${modoPreparo}`);

  for (const regra of REGRAS) {
    if (!regra.contem.every((t) => alvo.includes(t))) continue;
    if (regra.exceto?.some((t) => alvo.includes(t))) continue;
    return regra.porcoes;
  }
  return [];
}
