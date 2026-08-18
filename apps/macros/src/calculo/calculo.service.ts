import { Injectable } from '@nestjs/common';
import {
  DadosCorporais,
  Macros,
  NIVEIS_ATIVIDADE,
  Objetivo,
  PassoCalculo,
  ResultadoCalculo,
} from './calculo.tipos';

/** Energia liberada por grama na digestão de cada macronutriente. */
export const KCAL_POR_GRAMA = { proteina: 4, carboidrato: 4, gordura: 9 } as const;

/** Gramas de proteína por quilo de PESO ALVO (não do peso atual). */
const PROTEINA_POR_KG_ALVO = 2;
/** Gramas de gordura por quilo de PESO ALVO. */
const GORDURA_POR_KG_ALVO = 1;

/** Piso de gordura: abaixo disso a produção hormonal sofre. */
const GORDURA_MINIMA_G = 40;
/** Piso de carboidrato antes de começar a cortar gordura. */
const CARBO_MINIMO_G = 50;

/**
 * Fração máxima do GET que pode virar déficit.
 *
 * Um déficit fixo de 500 kcal é razoável pra quem gasta 3000, mas é agressivo
 * demais pra quem gasta 1600 — viraria quase um terço da energia do dia.
 * O déficit efetivo é limitado a 25% do GET.
 */
const DEFICIT_MAXIMO_DO_GET = 0.25;

@Injectable()
export class CalculoService {
  /**
   * Taxa Metabólica Basal pela fórmula de Mifflin-St Jeor.
   *
   * Isso é o gasto se você passasse o dia inteiro deitado. Não é o número
   * que você usa pra comer — serve só de base pro GET.
   */
  calcularTmb(d: DadosCorporais): number {
    const base = 10 * d.pesoKg + 6.25 * d.alturaCm - 5 * d.idadeAnos;
    return d.sexo === 'masculino' ? base + 5 : base - 161;
  }

  /** Gasto Energético Total: TMB corrigida pelo nível de atividade. */
  calcularGet(d: DadosCorporais): number {
    return this.calcularTmb(d) * NIVEIS_ATIVIDADE[d.nivelAtividade].fator;
  }

  /**
   * Peso alvo de referência para o cálculo de proteína e gordura.
   *
   * ATENÇÃO: não é o peso que a pessoa "quer pesar". É um peso de referência
   * derivado da altura, usado só como base de cálculo. A razão de existir:
   * quem está com 140kg e multiplica o peso ATUAL por 2 chega a 280g de
   * proteína — excesso que o corpo descarta, virando gasto sem retorno.
   *
   * Usa a fórmula de Devine ajustada, com piso pelo IMC 20 pra não devolver
   * um alvo irrealisticamente baixo em pessoas altas.
   */
  calcularPesoAlvo(sexo: string, alturaCm: number): number {
    const polegadasAcimaDe152 = Math.max(0, (alturaCm - 152.4) / 2.54);
    const devine =
      sexo === 'masculino'
        ? 50 + 2.3 * polegadasAcimaDe152
        : 45.5 + 2.3 * polegadasAcimaDe152;

    // Piso: IMC 20 costuma ser um alvo mais realista que Devine puro em pessoas altas.
    const alturaM = alturaCm / 100;
    const pisoImc20 = 20 * alturaM * alturaM;

    return Math.round(Math.max(devine, pisoImc20) * 10) / 10;
  }

  /**
   * Distribui a meta calórica entre os três macros.
   *
   * A ordem importa e é parte do método:
   *   1. Proteína primeiro (peso alvo x 2) — é o macro estrutural, não se mexe.
   *   2. Gordura depois (peso alvo x 1) — precisa de um piso pros hormônios.
   *   3. Carboidrato leva o que sobrar — é o macro de ajuste.
   */
  distribuirMacros(metaCalorica: number, pesoAlvoKg: number): Macros {
    const proteinaG = Math.round(pesoAlvoKg * PROTEINA_POR_KG_ALVO);
    let gorduraG = Math.round(pesoAlvoKg * GORDURA_POR_KG_ALVO);

    const kcalProteina = proteinaG * KCAL_POR_GRAMA.proteina;
    let kcalGordura = gorduraG * KCAL_POR_GRAMA.gordura;
    let sobra = metaCalorica - kcalProteina - kcalGordura;

    // Meta apertada demais pro par proteína+gordura: cede na gordura até o piso
    // fisiológico, preservando a proteína intacta.
    if (sobra < CARBO_MINIMO_G * KCAL_POR_GRAMA.carboidrato) {
      const kcalNecessaria = CARBO_MINIMO_G * KCAL_POR_GRAMA.carboidrato - sobra;
      const gramasACortar = Math.ceil(kcalNecessaria / KCAL_POR_GRAMA.gordura);
      gorduraG = Math.max(GORDURA_MINIMA_G, gorduraG - gramasACortar);
      kcalGordura = gorduraG * KCAL_POR_GRAMA.gordura;
      sobra = metaCalorica - kcalProteina - kcalGordura;
    }

    const carboidratoG = Math.max(0, Math.round(sobra / KCAL_POR_GRAMA.carboidrato));

    return {
      proteinaG,
      carboidratoG,
      gorduraG,
      calorias:
        proteinaG * KCAL_POR_GRAMA.proteina +
        carboidratoG * KCAL_POR_GRAMA.carboidrato +
        gorduraG * KCAL_POR_GRAMA.gordura,
    };
  }

  /**
   * Cálculo completo, com a memória de cada passo.
   *
   * O `passos` existe pra pessoa conferir a conta no papel — é o ponto do
   * método: aprender a fazer, não receber um número pronto.
   */
  calcular(
    d: DadosCorporais,
    objetivo: Objetivo = 'emagrecer',
    deficitKcal = 500,
  ): ResultadoCalculo {
    const avisos: string[] = [];
    const passos: PassoCalculo[] = [];

    const tmb = Math.round(this.calcularTmb(d));
    const fator = NIVEIS_ATIVIDADE[d.nivelAtividade].fator;
    const getBruto = this.calcularGet(d);
    // Arredonda pra dezena: a fórmula é estimativa, precisão decimal é ilusória.
    const get = Math.round(getBruto / 10) * 10;
    const pesoAlvoKg = this.calcularPesoAlvo(d.sexo, d.alturaCm);

    const sinal = objetivo === 'emagrecer' ? -1 : objetivo === 'ganhar' ? 1 : 0;

    // Dois limites pro déficit, e vale o mais restritivo:
    //  - no máximo 25% do GET;
    //  - a meta nunca desce abaixo da TMB, porque comer menos do que o corpo
    //    gasta em repouso não se sustenta e cobra caro depois.
    // Em perfis sedentários o GET é só 1,2 × TMB, então é a TMB que segura.
    const tetoPorFracao = Math.round(get * DEFICIT_MAXIMO_DO_GET);
    const tetoPorTmb = Math.max(0, get - tmb);
    const tetoDeficit = Math.min(tetoPorFracao, tetoPorTmb);
    const deficitPedido = Math.abs(deficitKcal);
    const deficitAplicado =
      sinal < 0 ? Math.min(deficitPedido, tetoDeficit) : deficitPedido;

    if (sinal < 0 && deficitAplicado < deficitPedido) {
      const motivo =
        tetoPorTmb < tetoPorFracao
          ? 'mais que isso deixaria você comendo abaixo do que seu corpo gasta parado'
          : 'mais que isso passaria de 25% do seu gasto diário';
      avisos.push(
        `O déficit de ${deficitPedido} kcal foi reduzido para ${deficitAplicado} kcal: ${motivo}. Pra acelerar, o caminho é aumentar o gasto (cardio), não cortar mais comida.`,
      );
    }

    const ajuste = sinal * deficitAplicado;
    // Arredonda a meta pra cima quando há déficit: arredondar pra baixo poderia
    // cruzar o piso da TMB que acabamos de proteger.
    const metaBruta = get + ajuste;
    const metaCalorica =
      sinal < 0 ? Math.ceil(metaBruta / 10) * 10 : Math.round(metaBruta / 10) * 10;

    const macros = this.distribuirMacros(metaCalorica, pesoAlvoKg);

    passos.push({
      ordem: 1,
      titulo: 'Taxa Metabólica Basal (TMB)',
      formula:
        d.sexo === 'masculino'
          ? '10 × peso + 6,25 × altura − 5 × idade + 5'
          : '10 × peso + 6,25 × altura − 5 × idade − 161',
      substituicao: `10 × ${d.pesoKg} + 6,25 × ${d.alturaCm} − 5 × ${d.idadeAnos} ${d.sexo === 'masculino' ? '+ 5' : '− 161'}`,
      resultado: `${tmb} kcal`,
      porque:
        'É o que seu corpo gastaria passando o dia inteiro deitado. Não é o quanto comer — é só a base do próximo passo.',
    });

    passos.push({
      ordem: 2,
      titulo: 'Gasto Energético Total (GET)',
      formula: 'TMB × fator de atividade',
      substituicao: `${tmb} × ${fator}`,
      resultado: `${get} kcal`,
      porque:
        'Aqui já entram treino e o dia a dia, incluindo os dias de descanso. Comendo isso, seu peso se mantém.',
    });

    passos.push({
      ordem: 3,
      titulo: 'Peso alvo (base de cálculo)',
      formula: 'Referência pela altura',
      substituicao: `altura ${d.alturaCm} cm`,
      resultado: `${pesoAlvoKg} kg`,
      porque:
        'NÃO é o peso que você quer atingir. É a base pra calcular proteína e gordura. Usar o peso atual quando se está acima do peso inflaria a proteína sem ganho nenhum.',
    });

    passos.push({
      ordem: 4,
      titulo: 'Meta calórica',
      formula: objetivo === 'manter' ? 'GET' : `GET ${sinal < 0 ? '−' : '+'} ajuste`,
      substituicao: objetivo === 'manter' ? `${get}` : `${get} ${sinal < 0 ? '−' : '+'} ${deficitAplicado}`,
      resultado: `${metaCalorica} kcal`,
      porque:
        objetivo === 'emagrecer'
          ? 'Déficit de 500 kcal/dia ≈ meio quilo de gordura por semana. Déficit pequeno deixa você comer mais e ainda ver resultado.'
          : objetivo === 'ganhar'
            ? 'Superávit controlado pra ganhar massa sem acumular gordura à toa.'
            : 'Manutenção: come o que gasta.',
    });

    passos.push({
      ordem: 5,
      titulo: 'Proteína',
      formula: 'peso alvo × 2',
      substituicao: `${pesoAlvoKg} × 2`,
      resultado: `${macros.proteinaG} g (${macros.proteinaG * 4} kcal)`,
      porque:
        'O macro estrutural — é o tijolo da parede. Esse número não se mexe quando você estagna: sempre se corta carbo antes.',
    });

    passos.push({
      ordem: 6,
      titulo: 'Gordura',
      formula: 'peso alvo × 1',
      substituicao: `${pesoAlvoKg} × 1`,
      resultado: `${macros.gorduraG} g (${macros.gorduraG * 9} kcal)`,
      porque:
        'É o cimento: seus hormônios são feitos a partir dela. Tem mais que o dobro de caloria por grama (9 contra 4).',
    });

    passos.push({
      ordem: 7,
      titulo: 'Carboidrato',
      formula: '(meta − kcal da proteína − kcal da gordura) ÷ 4',
      substituicao: `(${metaCalorica} − ${macros.proteinaG * 4} − ${macros.gorduraG * 9}) ÷ 4`,
      resultado: `${macros.carboidratoG} g (${macros.carboidratoG * 4} kcal)`,
      porque:
        'É a energia do pedreiro pra levantar a parede. Leva o que sobrou, e é o macro que você ajusta quando estaciona.',
    });

    if (d.nivelAtividade === 'intenso' || d.nivelAtividade === 'atleta') {
      avisos.push(
        'Você marcou um nível de atividade alto. Se na prática você não treina pesado quase todo dia, isso superestima seu gasto e o déficit não acontece. Na dúvida, escolha o nível abaixo.',
      );
    }
    if (metaCalorica < tmb && sinal >= 0) {
      avisos.push(
        `Sua meta (${metaCalorica} kcal) ficou abaixo da sua TMB (${tmb} kcal). Isso é agressivo demais pra manter no longo prazo — considere um déficit menor e mais cardio.`,
      );
    }
    if (macros.gorduraG <= GORDURA_MINIMA_G) {
      avisos.push(
        'Sua gordura está no piso mínimo. Cortar mais que isso compromete a produção hormonal.',
      );
    }
    if (macros.carboidratoG <= CARBO_MINIMO_G) {
      avisos.push(
        'Seu carboidrato está bem baixo. A partir daqui, pra continuar progredindo, o caminho é aumentar o cardio em vez de cortar mais comida.',
      );
    }

    return { tmb, get, pesoAlvoKg, deficitKcal: ajuste, metaCalorica, macros, passos, avisos };
  }
}
