import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alimento, Meta } from '../comum/entidades';
import { AlimentosService } from '../alimentos/alimentos.service';
import { violaRestricao } from '../alimentos/restricoes';
import { KCAL_POR_GRAMA } from '../calculo/calculo.service';
import { TotaisDia } from './diario.service';

export interface EspacoRestante {
  kcal: number;
  proteinaG: number;
  carboidratoG: number;
  gorduraG: number;
  /** Fibra não tem teto: é meta a atingir, não limite a respeitar. */
  fibraG?: number;
}

export interface SugestaoPorcao {
  alimentoId: string;
  nome: string;
  modoPreparo: string;
  fonte: string;
  gramasSugeridas: number;
  macros: ReturnType<AlimentosService['calcularPorGramas']>;
  motivo: string;
  /** Que macro esta sugestão resolve melhor. */
  resolve: MacroAlvo;
  /** Porções caseiras, pra sugestão poder ser anotada em unidade. */
  porcoes: ReturnType<AlimentosService['porcoesComMacros']>;
}

/** O que ainda falta no dia e vale sugerir. */
export type MacroAlvo = 'proteina' | 'carboidrato' | 'gordura' | 'fibra';

interface PerfilAlvo {
  chave: MacroAlvo;
  rotulo: string;
  /** Mínimo por 100 g pro alimento ser considerado boa fonte. */
  minimoPor100g: number;
  /** Quanto o alimento precisa entregar na porção pra valer a pena. */
  minimoNaPorcao: number;
  por100g: (a: Alimento) => number;
  naPorcao: (m: ReturnType<AlimentosService['calcularPorGramas']>) => number;
  faltaNoEspaco: (e: EspacoRestante) => number;
}

const ALVOS: PerfilAlvo[] = [
  {
    chave: 'proteina',
    rotulo: 'proteína',
    minimoPor100g: 10,
    minimoNaPorcao: 5,
    por100g: (a) => a.proteina100g,
    naPorcao: (m) => m.proteinaG,
    faltaNoEspaco: (e) => e.proteinaG,
  },
  {
    chave: 'carboidrato',
    rotulo: 'carboidrato',
    minimoPor100g: 15,
    minimoNaPorcao: 10,
    por100g: (a) => a.carboidrato100g,
    naPorcao: (m) => m.carboidratoG,
    faltaNoEspaco: (e) => e.carboidratoG,
  },
  {
    chave: 'gordura',
    rotulo: 'gordura',
    minimoPor100g: 8,
    minimoNaPorcao: 4,
    por100g: (a) => a.gordura100g,
    naPorcao: (m) => m.gorduraG,
    faltaNoEspaco: (e) => e.gorduraG,
  },
  {
    chave: 'fibra',
    rotulo: 'fibra',
    minimoPor100g: 3,
    minimoNaPorcao: 2,
    por100g: (a) => a.fibra100g,
    naPorcao: (m) => m.fibraG,
    faltaNoEspaco: (e) => e.fibraG ?? 0,
  },
];

/**
 * Planejamento reverso.
 *
 * A ideia veio do método: quando a cabeça está descansada é fácil dizer "não";
 * à noite, cansado, não é. Então o dia começa pelo que a pessoa realmente quer
 * comer — a sobremesa, a pizza — e o resto se encaixa em volta. Assim o prazer
 * é ponto de partida, não recompensa condicionada.
 */
@Injectable()
export class PlanejadorService {
  constructor(
    @InjectRepository(Alimento) private readonly alimentosRepo: Repository<Alimento>,
    private readonly alimentos: AlimentosService,
  ) {}

  /** O que ainda cabe no dia depois do que já foi planejado. */
  calcularEspaco(meta: Meta, totais: TotaisDia): EspacoRestante {
    const arred = (n: number) => Math.round(n * 10) / 10;
    return {
      kcal: Math.round(meta.calorias - totais.kcal),
      proteinaG: arred(meta.proteinaG - totais.proteinaG),
      carboidratoG: arred(meta.carboidratoG - totais.carboidratoG),
      gorduraG: arred(meta.gorduraG - totais.gorduraG),
      fibraG: arred((meta.fibraMetaG ?? 30) - totais.fibraG),
    };
  }

  /**
   * Quanto dá pra comer de um alimento sem estourar nenhum macro.
   *
   * Responde a pergunta prática de quem está montando o dia: "cabe quanto
   * de brigadeiro hoje?". Se não cabe, devolve 0 com o macro que travou —
   * saber o que travou é o que ensina.
   */
  quantoCabe(alimento: Alimento, espaco: EspacoRestante) {
    const limites: { gramas: number; macro: string }[] = [];

    const porMacro = (disponivel: number, por100g: number, nome: string) => {
      if (por100g <= 0) return;
      limites.push({ gramas: (disponivel / por100g) * 100, macro: nome });
    };

    porMacro(espaco.kcal, alimento.kcal100g, 'calorias');
    porMacro(espaco.carboidratoG, alimento.carboidrato100g, 'carboidrato');
    porMacro(espaco.gorduraG, alimento.gordura100g, 'gordura');

    if (limites.length === 0) {
      return { gramas: 0, macroLimitante: 'nenhum', cabe: false };
    }

    const menor = limites.reduce((a, b) => (a.gramas < b.gramas ? a : b));
    const gramas = Math.floor(Math.max(0, menor.gramas) / 5) * 5;

    return {
      gramas,
      macroLimitante: menor.macro,
      cabe: gramas > 0,
    };
  }

  /**
   * Depois da "maravilha" escolhida, sugere o que fecha o dia.
   *
   * A prioridade é a proteína, porque é o macro que costuma ficar para trás e
   * o único que o método não deixa cortar. Entre dois alimentos que entregam a
   * mesma proteína, vence o que gasta menos do espaço que sobrou.
   *
   * As porções são limitadas ao que uma pessoa come de fato numa refeição:
   * sugerir 570 g de atum pra fechar a proteína é matematicamente correto e
   * inútil na prática.
   */
  async sugerirFechamento(
    espaco: EspacoRestante,
    limite = 6,
    opcoes: { excluir?: string[]; pular?: number; restricoes?: string[]; alvo?: MacroAlvo } = {},
  ): Promise<{
    sugestoes: SugestaoPorcao[];
    temMais: boolean;
    alvo: MacroAlvo;
    faltando: { macro: MacroAlvo; rotulo: string; falta: number }[];
  }> {
    const candidatos = await this.alimentosRepo.find({ where: { verificado: true } });

    // Alimentos que a pessoa não come. Sugerir de novo o que ela já recusou é
    // ignorá-la — e ela para de olhar as sugestões.
    const excluir = new Set(opcoes.excluir ?? []);

    // O que ainda falta, do maior buraco pro menor. A proteína desempata na
    // frente quando o buraco é parecido: é o macro que não se recupera depois.
    const faltando = ALVOS.map((a) => ({
      macro: a.chave,
      rotulo: a.rotulo,
      falta: Math.round(Math.max(0, a.faltaNoEspaco(espaco)) * 10) / 10,
      peso: Math.max(0, a.faltaNoEspaco(espaco)) * (a.chave === 'proteina' ? 1.3 : 1),
    }))
      .sort((x, y) => y.peso - x.peso)
      .map(({ macro, rotulo, falta }) => ({ macro, rotulo, falta }));

    const alvo = opcoes.alvo ?? faltando[0]?.macro ?? 'proteina';
    const perfil = ALVOS.find((a) => a.chave === alvo)!;

    const sugestoes: SugestaoPorcao[] = [];
    const faltaDoAlvo = Math.max(0, perfil.faltaNoEspaco(espaco));

    for (const a of candidatos) {
      if (excluir.has(a.id)) continue;
      // Restrições declaradas no cadastro: some o grupo inteiro de uma vez.
      if (violaRestricao(a.nome, opcoes.restricoes)) continue;
      // Ingrediente não é refeição: fermento e tempero têm proteína por 100 g,
      // mas ninguém come 40 g de fermento pra fechar a proteína do dia.
      if (this.ehIngrediente(a.nome)) continue;
      if (perfil.por100g(a) < perfil.minimoPor100g) continue;

      const cabe = this.quantoCabe(a, espaco);
      if (!cabe.cabe || cabe.gramas < 20) continue;

      // Porção máxima plausível numa refeição só, pelo tipo de alimento.
      const tetoPorcao = this.tetoPorcaoRealista(a);

      // O quanto bastaria pra zerar o que falta do macro alvo — pode ser mais
      // do que cabe num prato, e aí o teto vale.
      const gramasParaAlvo =
        Math.ceil(((faltaDoAlvo / perfil.por100g(a)) * 100) / 5) * 5;

      const gramas = Math.min(cabe.gramas, tetoPorcao, Math.max(20, gramasParaAlvo));
      if (gramas < 20) continue;

      const macros = this.alimentos.calcularPorGramas(a, gramas);
      const entrega = perfil.naPorcao(macros);
      if (entrega < perfil.minimoNaPorcao) continue;

      const fechaTudo = entrega >= faltaDoAlvo;
      const restaria = Math.round((faltaDoAlvo - entrega) * 10) / 10;

      sugestoes.push({
        alimentoId: a.id,
        nome: a.nome,
        modoPreparo: a.modoPreparo,
        fonte: a.fonte,
        gramasSugeridas: gramas,
        macros,
        resolve: alvo,
        porcoes: this.alimentos.porcoesComMacros(a),
        motivo: fechaTudo
          ? `${entrega} g de ${perfil.rotulo} usando ${macros.kcal} kcal — fecha o que faltava`
          : `${entrega} g de ${perfil.rotulo} usando ${macros.kcal} kcal; ainda faltariam ${restaria} g`,
      });
    }

    // Ordena por densidade do macro alvo por caloria, mas dá vantagem ao que
    // se come numa refeição de verdade: doce em calda tem muito carboidrato e
    // é péssima sugestão de "o que comer pra fechar o dia".
    const ordenadas = sugestoes.sort((a, b) => {
      const nota = (s: SugestaoPorcao) =>
        (perfil.naPorcao(s.macros) / (s.macros.kcal || 1)) *
        (this.ehComidaDeRefeicao(s.nome) ? 1.6 : 1);
      return nota(b) - nota(a);
    });

    // `pular` permite pedir "outras opções" sem repetir as já mostradas.
    const inicio = opcoes.pular ?? 0;
    return {
      sugestoes: ordenadas.slice(inicio, inicio + limite),
      temMais: ordenadas.length > inicio + limite,
      alvo,
      faltando: faltando.filter((f) => f.falta > 0),
    };
  }

  /**
   * O alimento é do tipo que compõe uma refeição de verdade?
   *
   * Não é juízo sobre a comida — doce continua sendo comida e pode ser
   * registrado normalmente. É só que, na hora de sugerir "o que comer pra
   * fechar o carboidrato", arroz e batata resolvem melhor que compota.
   */
  private ehComidaDeRefeicao(nome: string): boolean {
    const alvo = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const base = [
      'arroz', 'feijao', 'batata', 'mandioca', 'macarrao', 'pao', 'aveia',
      'tapioca', 'cuscuz', 'inhame', 'cara', 'polenta', 'quinoa', 'lentilha',
      'grao de bico', 'milho', 'farofa', 'frango', 'carne', 'peixe', 'ovo',
      'atum', 'sardinha', 'tilapia', 'patinho', 'acem', 'file', 'peito',
      'coxa', 'leite', 'iogurte', 'queijo', 'abacate', 'castanha', 'amendoim',
      'azeite', 'banana', 'maca', 'laranja', 'mamao', 'melancia', 'abacaxi',
      'brocolis', 'cenoura', 'abobrinha', 'couve', 'espinafre', 'tomate',
    ];
    const fora = ['calda', 'compota', 'marmelada', 'doce de', 'cristalizad', 'em conserva com'];

    if (fora.some((t) => alvo.includes(t))) return false;
    return base.some((t) => alvo.includes(t));
  }

  /**
   * O alimento é ingrediente, não refeição?
   *
   * A base TACO tem fermento, tempero e leite em pó — corretos como dado,
   * absurdos como sugestão de "o que comer pra fechar a proteína".
   */
  private ehIngrediente(nome: string): boolean {
    const alvo = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return [
      'fermento', 'tempero', 'caldo de', 'sal ', 'pimenta', 'colorau',
      'corante', 'gelatina em po', 'leite em po', 'farinha lactea',
      'amido', 'polvilho', 'glutamato', 'bicarbonato', 'essencia',
      // Ninguém come açúcar puro ou glicose pra fechar o carboidrato do dia.
      'glicose', 'xarope', 'acucar', 'mel de', 'melado', 'rapadura',
      'farinha de trigo', 'farinha de rosca', 'maisena', 'creme de milho',
    ].some((t) => alvo.includes(t));
  }

  /**
   * Teto de porção por refeição, em gramas.
   *
   * Não existe tabela oficial disso — são faixas do que se come de fato num
   * prato, pra sugestão sair aplicável em vez de só aritmeticamente válida.
   */
  private tetoPorcaoRealista(a: Alimento): number {
    // Normaliza acento e pontuação: a TACO escreve "Leite (de coco)", e a
    // regra precisa casar com "leite de coco".
    const nome = a.nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[(),.]/g, ' ')
      .replace(/\s+/g, ' ');

    if (nome.includes('whey') || nome.includes('psyllium')) return 40;
    // Óleo e azeite entram a fio, não em concha: 65 g de azeite é meio copo.
    if (nome.includes('oleo') || nome.includes('azeite') || nome.includes('banha')) return 15;
    if (nome.includes('manteiga') || nome.includes('margarina')) return 20;
    if (nome.includes('queijo') || nome.includes('requeijao')) return 60;
    // Creme de leite, leite de coco e maionese vão de colher, não de copo.
    if (
      nome.includes('creme de leite') ||
      nome.includes('leite de coco') ||
      nome.includes('maionese') ||
      nome.includes('nata')
    ) return 60;
    if (nome.includes('clara')) return 200;
    if (nome.includes('ovo')) return 150;
    if (nome.includes('leite') || nome.includes('iogurte')) return 300;
    // Carnes, peixes e similares: um filé grande.
    if (a.proteina100g >= 20) return 250;
    return 200;
  }

  /**
   * Ajuste fino no fim do planejamento: quanto mexer num item pra cravar a meta.
   *
   * É a operação que fecha o dia — em vez de "você estourou 80 kcal", entrega
   * "tire 20 g do arroz". Diagnóstico com a ação junto.
   */
  ajusteFino(alimento: Alimento, gramasAtuais: number, espaco: EspacoRestante) {
    const excessoKcal = -espaco.kcal;
    if (excessoKcal <= 0) {
      return { precisaAjuste: false, gramasNovas: gramasAtuais, mensagem: 'Está dentro da meta.' };
    }
    if (alimento.kcal100g <= 0) {
      return { precisaAjuste: false, gramasNovas: gramasAtuais, mensagem: 'Este alimento não muda as calorias.' };
    }

    const gramasARemover = Math.ceil((excessoKcal / alimento.kcal100g) * 100 / 5) * 5;
    const gramasNovas = Math.max(0, gramasAtuais - gramasARemover);

    return {
      precisaAjuste: true,
      gramasNovas,
      gramasARemover: Math.min(gramasARemover, gramasAtuais),
      mensagem:
        gramasNovas > 0
          ? `Passe ${alimento.nome} de ${gramasAtuais} g para ${gramasNovas} g e o dia fecha.`
          : `Mesmo tirando todo o ${alimento.nome} ainda sobram ${Math.round(excessoKcal - gramasAtuais * alimento.kcal100g / 100)} kcal. Ajuste outro item também.`,
    };
  }

  /**
   * Conferência de coerência do dia: macros batem mas caloria não?
   * Então há alimento cadastrado errado — o mesmo teste que se faz no papel.
   */
  conferirCoerencia(totais: TotaisDia) {
    const calculado =
      totais.proteinaG * KCAL_POR_GRAMA.proteina +
      totais.carboidratoG * KCAL_POR_GRAMA.carboidrato +
      totais.gorduraG * KCAL_POR_GRAMA.gordura;
    const diferenca = Math.abs(calculado - totais.kcal);

    return {
      coerente: diferenca <= 70,
      kcalPelosMacros: Math.round(calculado),
      kcalRegistrado: totais.kcal,
      diferenca: Math.round(diferenca),
      aviso:
        diferenca > 70
          ? `Seus macros somam ${Math.round(calculado)} kcal, mas o diário mostra ${totais.kcal} kcal. Quando a conta não fecha, quase sempre é um alimento cadastrado com valores errados.`
          : null,
    };
  }
}
