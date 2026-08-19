import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alimento } from '../comum/entidades';
import { AlimentosService } from '../alimentos/alimentos.service';
import { violaRestricao } from '../alimentos/restricoes';
import {
  MODELOS_REFEICAO,
  PAPEIS,
  PapelPrato,
  notaDePreferencia,
  papelDoAlimento,
  tipoDaRefeicao,
} from './prato';
import { EspacoRestante } from './planejador.service';

export interface ComponentePrato {
  papel: PapelPrato;
  rotulo: string;
  alimentoId: string;
  nome: string;
  modoPreparo: string;
  fonte: string;
  gramas: number;
  macros: ReturnType<AlimentosService['calcularPorGramas']>;
  porcoes: ReturnType<AlimentosService['porcoesComMacros']>;
  /** Outras opções do mesmo papel, pra trocar sem refazer o prato. */
  alternativas: {
    alimentoId: string;
    nome: string;
    modoPreparo: string;
    fonte: string;
    gramas: number;
    macros: ReturnType<AlimentosService['calcularPorGramas']>;
    porcoes: ReturnType<AlimentosService['porcoesComMacros']>;
  }[];
}

@Injectable()
export class MontadorService {
  constructor(
    @InjectRepository(Alimento) private readonly repo: Repository<Alimento>,
    private readonly alimentos: AlimentosService,
  ) {}

  /**
   * Monta um prato inteiro para uma refeição.
   *
   * Em vez de listar ingredientes por macro — "150 g de proteína" — devolve o
   * prato como se pensa comida: arroz, feijão, carne e salada. Cada componente
   * vem com alternativas do mesmo papel, então trocar o arroz por macarrão não
   * desmonta o resto.
   *
   * As porções são dimensionadas pelo que ainda cabe no dia: se sobrou pouco
   * carboidrato, a base entra menor em vez de sumir.
   */
  async montarPrato(params: {
    nomeRefeicao: string;
    espaco: EspacoRestante;
    restricoes?: string[];
    excluir?: string[];
    /** Papéis que a pessoa não quer neste prato. */
    semPapeis?: PapelPrato[];
  }): Promise<{ tipo: string; componentes: ComponentePrato[]; totais: ReturnType<AlimentosService['calcularPorGramas']> }> {
    const tipo = tipoDaRefeicao(params.nomeRefeicao);
    const papeis = MODELOS_REFEICAO[tipo].filter(
      (p) => !(params.semPapeis ?? []).includes(p),
    );

    const candidatos = await this.repo.find({ where: { verificado: true } });
    const excluir = new Set(params.excluir ?? []);

    // Agrupa a base inteira por papel, uma vez só.
    const porPapel = new Map<PapelPrato, Alimento[]>();
    for (const a of candidatos) {
      if (excluir.has(a.id)) continue;
      if (violaRestricao(a.nome, params.restricoes)) continue;
      if (this.ehIngrediente(a.nome)) continue;

      const papel = papelDoAlimento(a.nome);
      if (!papel) continue;
      if (!porPapel.has(papel)) porPapel.set(papel, []);
      porPapel.get(papel)!.push(a);
    }

    // Quanto do espaço do dia esta refeição pode ocupar. Um prato não gasta o
    // dia inteiro: se ainda faltam três refeições, cada uma leva uma fração.
    const fatia = this.fatiaDoEspaco(papeis.length);

    const componentes: ComponentePrato[] = [];
    for (const papel of papeis) {
      const def = PAPEIS.find((p) => p.papel === papel)!;
      const opcoes = (porPapel.get(papel) ?? [])
        .map((a) => {
          const gramas = this.dimensionar(a, def.gramasTipicas, params.espaco, fatia);
          return { a, gramas, macros: this.alimentos.calcularPorGramas(a, gramas) };
        })
        .filter((o) => o.gramas >= 15)
        // Primeiro o que de fato vai no prato; entre iguais, o nome mais curto
        // ("Arroz branco" antes de "Arroz integral parboilizado tipo 2").
        .sort((x, y) => {
          const nx = notaDePreferencia(papel, x.a.nome, tipo);
          const ny = notaDePreferencia(papel, y.a.nome, tipo);
          if (nx !== ny) return ny - nx;
          return x.a.nome.length - y.a.nome.length;
        })
        .slice(0, 8);

      if (opcoes.length === 0) continue;

      const [escolhido, ...resto] = opcoes;
      componentes.push({
        papel,
        rotulo: def.rotulo,
        alimentoId: escolhido.a.id,
        nome: escolhido.a.nome,
        modoPreparo: escolhido.a.modoPreparo,
        fonte: escolhido.a.fonte,
        gramas: escolhido.gramas,
        macros: escolhido.macros,
        porcoes: this.alimentos.porcoesComMacros(escolhido.a),
        alternativas: resto.map((o) => ({
          alimentoId: o.a.id,
          nome: o.a.nome,
          modoPreparo: o.a.modoPreparo,
          fonte: o.a.fonte,
          gramas: o.gramas,
          macros: o.macros,
          porcoes: this.alimentos.porcoesComMacros(o.a),
        })),
      });
    }

    const totais = componentes.reduce(
      (acc, c) => ({
        kcal: acc.kcal + c.macros.kcal,
        proteinaG: Math.round((acc.proteinaG + c.macros.proteinaG) * 10) / 10,
        carboidratoG: Math.round((acc.carboidratoG + c.macros.carboidratoG) * 10) / 10,
        gorduraG: Math.round((acc.gorduraG + c.macros.gorduraG) * 10) / 10,
        fibraG: Math.round((acc.fibraG + c.macros.fibraG) * 10) / 10,
        gorduraSaturadaG:
          Math.round((acc.gorduraSaturadaG + c.macros.gorduraSaturadaG) * 10) / 10,
      }),
      { kcal: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0, fibraG: 0, gorduraSaturadaG: 0 },
    );

    return { tipo, componentes, totais };
  }

  /**
   * Busca um alimento pra ocupar um papel do prato.
   *
   * As alternativas fixas nunca cobrem tudo — quem vai comer carne moída
   * precisa procurar por ela. A busca aqui já devolve a porção dimensionada
   * pelo espaço do dia, pra o resultado entrar no prato pronto pra usar.
   *
   * O filtro por papel é uma preferência, não uma trava: se a pessoa procura
   * "carne moída" no lugar da proteína, o que casa com o papel sobe, mas nada
   * é escondido — a busca dela manda.
   */
  async buscarParaPapel(params: {
    termo: string;
    papel: PapelPrato;
    espaco: EspacoRestante;
    quantosPapeis: number;
    restricoes?: string[];
    excluir?: string[];
    limite?: number;
  }) {
    const achados = await this.alimentos.buscar(params.termo, (params.limite ?? 6) * 4);
    const excluir = new Set(params.excluir ?? []);
    const def = PAPEIS.find((p) => p.papel === params.papel);
    const fatia = this.fatiaDoEspaco(params.quantosPapeis);

    return achados
      .filter((a) => !excluir.has(a.id))
      .filter((a) => !violaRestricao(a.nome, params.restricoes))
      .filter((a) => !this.ehIngrediente(a.nome))
      // Quem cumpre o papel procurado vem primeiro; o resto continua acessível.
      .sort((x, y) => {
        const px = papelDoAlimento(x.nome) === params.papel ? 1 : 0;
        const py = papelDoAlimento(y.nome) === params.papel ? 1 : 0;
        if (px !== py) return py - px;

        // Cru quase nunca é o que se come: desce na lista, sem sumir — carne
        // crua pesada antes de cozinhar é caso legítimo.
        const cx = x.modoPreparo === 'cru' ? 1 : 0;
        const cy = y.modoPreparo === 'cru' ? 1 : 0;
        if (cx !== cy) return cx - cy;

        return (
          notaDePreferencia(params.papel, y.nome) -
          notaDePreferencia(params.papel, x.nome)
        );
      })
      .slice(0, params.limite ?? 6)
      .map((a) => {
        const gramas = this.dimensionar(
          a,
          def?.gramasTipicas ?? 100,
          params.espaco,
          fatia,
        );
        return {
          alimentoId: a.id,
          nome: a.nome,
          modoPreparo: a.modoPreparo,
          fonte: a.fonte,
          gramas: Math.max(15, gramas),
          macros: this.alimentos.calcularPorGramas(a, Math.max(15, gramas)),
          porcoes: this.alimentos.porcoesComMacros(a),
          cumpreOPapel: papelDoAlimento(a.nome) === params.papel,
        };
      });
  }

  /**
   * Fração do espaço restante que um prato pode ocupar.
   *
   * Prato com mais componentes tende a ser a refeição principal e leva mais.
   */
  private fatiaDoEspaco(quantosPapeis: number): number {
    if (quantosPapeis >= 5) return 0.5;
    if (quantosPapeis === 4) return 0.4;
    return 0.3;
  }

  /**
   * Ajusta a porção pelo que ainda cabe.
   *
   * Parte da porção típica e encolhe se o macro dominante do alimento já
   * estiver apertado. Nunca some por completo: melhor pouco arroz do que
   * nenhum, porque a pessoa vê o prato inteiro e ajusta.
   */
  private dimensionar(
    a: Alimento,
    tipicas: number,
    espaco: EspacoRestante,
    fatia: number,
  ): number {
    const limites: number[] = [tipicas];

    const cabe = (disponivel: number, por100g: number) => {
      if (por100g <= 0) return;
      limites.push(Math.max(0, (disponivel * fatia) / por100g) * 100);
    };

    cabe(Math.max(0, espaco.kcal), a.kcal100g);
    cabe(Math.max(0, espaco.carboidratoG), a.carboidrato100g);
    cabe(Math.max(0, espaco.gorduraG), a.gordura100g);

    const bruto = Math.min(...limites);
    return Math.round(bruto / 5) * 5;
  }

  /** Fermento, tempero e afins não compõem prato. */
  private ehIngrediente(nome: string): boolean {
    const alvo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return [
      'fermento', 'tempero', 'caldo de', 'sal ', 'pimenta', 'colorau',
      'corante', 'gelatina em po', 'leite em po', 'farinha lactea', 'amido',
      'polvilho', 'glutamato', 'bicarbonato', 'essencia', 'glicose', 'xarope',
      'acucar', 'farinha de trigo', 'farinha de rosca', 'maisena', 'oleo',
      'azeite', 'banha', 'manteiga', 'margarina', 'molho', 'extrato',
      'doce de leite', 'leite condensado', 'creme de leite',
    ].some((t) => alvo.includes(t));
  }
}
