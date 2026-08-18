import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alimento, Meta } from '../comum/entidades';
import { AlimentosService } from '../alimentos/alimentos.service';
import { KCAL_POR_GRAMA } from '../calculo/calculo.service';
import { TotaisDia } from './diario.service';

export interface EspacoRestante {
  kcal: number;
  proteinaG: number;
  carboidratoG: number;
  gorduraG: number;
}

export interface SugestaoPorcao {
  alimentoId: string;
  nome: string;
  modoPreparo: string;
  fonte: string;
  gramasSugeridas: number;
  macros: ReturnType<AlimentosService['calcularPorGramas']>;
  motivo: string;
}

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
  async sugerirFechamento(espaco: EspacoRestante, limite = 6): Promise<SugestaoPorcao[]> {
    const candidatos = await this.alimentosRepo.find({ where: { verificado: true } });
    const sugestoes: SugestaoPorcao[] = [];

    for (const a of candidatos) {
      if (a.proteina100g < 10) continue;

      const cabe = this.quantoCabe(a, espaco);
      if (!cabe.cabe || cabe.gramas < 20) continue;

      // Porção máxima plausível numa refeição só, pelo tipo de alimento.
      const tetoPorcao = this.tetoPorcaoRealista(a);

      // O quanto bastaria pra zerar a proteína que falta — pode ser mais do
      // que cabe num prato, e aí o teto vale.
      const gramasParaProteina =
        Math.ceil(((Math.max(0, espaco.proteinaG) / a.proteina100g) * 100) / 5) * 5;

      const gramas = Math.min(cabe.gramas, tetoPorcao, Math.max(20, gramasParaProteina));
      if (gramas < 20) continue;

      const macros = this.alimentos.calcularPorGramas(a, gramas);
      if (macros.proteinaG < 5) continue;

      const fechaTudo = macros.proteinaG >= espaco.proteinaG;
      const restaria = Math.round((espaco.proteinaG - macros.proteinaG) * 10) / 10;

      sugestoes.push({
        alimentoId: a.id,
        nome: a.nome,
        modoPreparo: a.modoPreparo,
        fonte: a.fonte,
        gramasSugeridas: gramas,
        macros,
        motivo: fechaTudo
          ? `${macros.proteinaG} g de proteína usando ${macros.kcal} kcal — fecha o que faltava`
          : `${macros.proteinaG} g de proteína usando ${macros.kcal} kcal; ainda faltariam ${restaria} g`,
      });
    }

    // Melhor densidade de proteína por caloria gasta.
    return sugestoes
      .sort((a, b) => b.macros.proteinaG / (b.macros.kcal || 1) - a.macros.proteinaG / (a.macros.kcal || 1))
      .slice(0, limite);
  }

  /**
   * Teto de porção por refeição, em gramas.
   *
   * Não existe tabela oficial disso — são faixas do que se come de fato num
   * prato, pra sugestão sair aplicável em vez de só aritmeticamente válida.
   */
  private tetoPorcaoRealista(a: Alimento): number {
    const nome = a.nome.toLowerCase();

    if (nome.includes('whey') || nome.includes('psyllium')) return 40;
    if (nome.includes('queijo') || nome.includes('requeijão')) return 60;
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
