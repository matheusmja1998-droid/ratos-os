import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemRefeicao, Meta, Refeicao } from '../comum/entidades';
import { AlimentosService } from '../alimentos/alimentos.service';

export interface TotaisDia {
  kcal: number;
  proteinaG: number;
  carboidratoG: number;
  gorduraG: number;
  fibraG: number;
  gorduraSaturadaG: number;
}

const ZERO: TotaisDia = {
  kcal: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0, fibraG: 0, gorduraSaturadaG: 0,
};

/**
 * Quantas refeições um dia novo começa tendo.
 *
 * Quatro cobre a rotina mais comum sem entulhar a tela. Quem faz mais come
 * mais vezes, e adiciona; quem faz menos, remove. O número não é doutrina.
 */
const REFEICOES_INICIAIS = 4;

/** Nome neutro: "Refeição 3" não pressupõe a rotina de ninguém. */
const nomePadrao = (ordem: number) => `Refeição ${ordem + 1}`;

@Injectable()
export class DiarioService {
  constructor(
    @InjectRepository(Refeicao) private readonly refeicoes: Repository<Refeicao>,
    @InjectRepository(ItemRefeicao) private readonly itens: Repository<ItemRefeicao>,
    @InjectRepository(Meta) private readonly metas: Repository<Meta>,
    private readonly alimentos: AlimentosService,
  ) {}

  /** Garante que o dia exista com suas refeições. */
  async garantirDia(usuarioId: string, data: string): Promise<Refeicao[]> {
    const existentes = await this.refeicoes.find({
      where: { usuarioId, data },
      relations: { itens: true },
      order: { ordem: 'ASC' },
    });
    if (existentes.length > 0) return existentes;

    // Um dia novo herda a estrutura do último dia que a pessoa montou: se ela
    // organizou 5 refeições ontem, não faz sentido recomeçar do zero hoje.
    const ultimo = await this.refeicoes.find({
      where: { usuarioId },
      order: { data: 'DESC', ordem: 'ASC' },
      take: 12,
    });
    const modelo = ultimo.filter((r) => r.data === ultimo[0]?.data);

    const novas = (modelo.length > 0
      ? modelo.map((r) => ({ nome: r.nome, ordem: r.ordem }))
      : Array.from({ length: REFEICOES_INICIAIS }, (_, i) => ({
          nome: nomePadrao(i),
          ordem: i,
        }))
    ).map((r) => this.refeicoes.create({ usuarioId, data, ...r }));
    await this.refeicoes.save(novas);
    return this.refeicoes.find({
      where: { usuarioId, data },
      relations: { itens: true },
      order: { ordem: 'ASC' },
    });
  }

  /**
   * Adiciona alimento a uma refeição.
   *
   * `gramas` é sempre gramas — não existe "quantidade de porções" na API,
   * justamente pra tornar impossível o erro de multiplicar porção por porção.
   */
  async adicionarItem(params: {
    usuarioId: string;
    data: string;
    refeicaoId: string;
    alimentoId: string;
    gramas: number;
    ehMaravilha?: boolean;
    consumido?: boolean;
  }): Promise<ItemRefeicao> {
    const refeicao = await this.refeicoes.findOne({
      where: { id: params.refeicaoId, usuarioId: params.usuarioId },
    });
    if (!refeicao) throw new NotFoundException('Refeição não encontrada');

    const alimento = await this.alimentos.porId(params.alimentoId);
    const macros = this.alimentos.calcularPorGramas(alimento, params.gramas);

    const item = this.itens.create({
      refeicaoId: refeicao.id,
      alimentoId: alimento.id,
      alimentoNome: `${alimento.nome} (${alimento.modoPreparo})`,
      gramas: params.gramas,
      ...macros,
      ehMaravilha: params.ehMaravilha ?? false,
      consumido: params.consumido ?? true,
    });
    return this.itens.save(item);
  }

  /** Acrescenta uma refeição ao dia, no fim da lista. */
  async adicionarRefeicao(usuarioId: string, data: string, nome?: string): Promise<Refeicao> {
    const doDia = await this.refeicoes.find({ where: { usuarioId, data } });
    const ordem = doDia.length;
    return this.refeicoes.save(
      this.refeicoes.create({
        usuarioId,
        data,
        nome: nome?.trim() || nomePadrao(ordem),
        ordem,
      }),
    );
  }

  /** Renomeia uma refeição — "Café", "Pós-treino", o que fizer sentido. */
  async renomearRefeicao(usuarioId: string, refeicaoId: string, nome: string): Promise<Refeicao> {
    const r = await this.refeicoes.findOne({ where: { id: refeicaoId, usuarioId } });
    if (!r) throw new NotFoundException('Refeição não encontrada');
    r.nome = nome.trim() || r.nome;
    return this.refeicoes.save(r);
  }

  /**
   * Remove uma refeição do dia.
   *
   * Recusa se houver comida registrada nela: apagar em silêncio o que a pessoa
   * anotou seria pior do que pedir pra ela tirar os itens antes.
   */
  async removerRefeicao(usuarioId: string, refeicaoId: string): Promise<void> {
    const r = await this.refeicoes.findOne({
      where: { id: refeicaoId, usuarioId },
      relations: { itens: true },
    });
    if (!r) throw new NotFoundException('Refeição não encontrada');

    if ((r.itens ?? []).length > 0) {
      throw new BadRequestException(
        'Essa refeição tem comida anotada. Tire os itens antes de removê-la.',
      );
    }

    await this.refeicoes.delete(r.id);

    // Renumera as que sobraram pra não deixar buraco na ordem.
    const restantes = await this.refeicoes.find({
      where: { usuarioId, data: r.data },
      order: { ordem: 'ASC' },
    });
    await Promise.all(
      restantes.map((item, i) =>
        item.ordem === i ? null : this.refeicoes.update(item.id, { ordem: i }),
      ),
    );
  }

  async removerItem(usuarioId: string, itemId: string): Promise<void> {
    const item = await this.itens.findOne({
      where: { id: itemId },
      relations: { refeicao: true },
    });
    if (!item || item.refeicao.usuarioId !== usuarioId) {
      throw new NotFoundException('Item não encontrado');
    }
    await this.itens.delete(itemId);
  }

  async atualizarGramas(usuarioId: string, itemId: string, gramas: number): Promise<ItemRefeicao> {
    const item = await this.itens.findOne({
      where: { id: itemId },
      relations: { refeicao: true },
    });
    if (!item || item.refeicao.usuarioId !== usuarioId) {
      throw new NotFoundException('Item não encontrado');
    }
    const alimento = await this.alimentos.porId(item.alimentoId);
    Object.assign(item, { gramas }, this.alimentos.calcularPorGramas(alimento, gramas));
    return this.itens.save(item);
  }

  somarTotais(refeicoes: Refeicao[]): TotaisDia {
    const arred = (n: number) => Math.round(n * 10) / 10;
    const t = refeicoes
      .flatMap((r) => r.itens ?? [])
      .reduce(
        (acc, i) => ({
          kcal: acc.kcal + i.kcal,
          proteinaG: acc.proteinaG + i.proteinaG,
          carboidratoG: acc.carboidratoG + i.carboidratoG,
          gorduraG: acc.gorduraG + i.gorduraG,
          fibraG: acc.fibraG + i.fibraG,
          gorduraSaturadaG: acc.gorduraSaturadaG + i.gorduraSaturadaG,
        }),
        { ...ZERO },
      );
    return {
      kcal: Math.round(t.kcal),
      proteinaG: arred(t.proteinaG),
      carboidratoG: arred(t.carboidratoG),
      gorduraG: arred(t.gorduraG),
      fibraG: arred(t.fibraG),
      gorduraSaturadaG: arred(t.gorduraSaturadaG),
    };
  }

  async metaAtiva(usuarioId: string): Promise<Meta | null> {
    return this.metas.findOne({
      where: { usuarioId, ativa: true },
      order: { criadoEm: 'DESC' },
    });
  }

  /**
   * Painel do dia: o que já entrou, o que falta, e o que ainda cabe.
   *
   * O "restante" pode ficar negativo e tudo bem — é informação, não punição.
   * A leitura de "estourou" fica na camada de apresentação, sem julgamento.
   */
  async resumoDia(usuarioId: string, data: string) {
    const refeicoes = await this.garantirDia(usuarioId, data);
    const consumidas = refeicoes.map((r) => ({
      ...r,
      itens: (r.itens ?? []).filter((i) => i.consumido),
    }));

    const totais = this.somarTotais(refeicoes);
    const totaisConsumidos = this.somarTotais(consumidas);
    const meta = await this.metaAtiva(usuarioId);

    const restante = meta
      ? {
          kcal: Math.round(meta.calorias - totais.kcal),
          proteinaG: Math.round((meta.proteinaG - totais.proteinaG) * 10) / 10,
          carboidratoG: Math.round((meta.carboidratoG - totais.carboidratoG) * 10) / 10,
          gorduraG: Math.round((meta.gorduraG - totais.gorduraG) * 10) / 10,
        }
      : null;

    return {
      data,
      refeicoes,
      totais,
      totaisConsumidos,
      meta,
      restante,
      // Marcadores de saúde que o método acompanha junto dos 3 macros.
      fibra: meta ? { atual: totais.fibraG, meta: meta.fibraMetaG } : null,
      gorduraSaturada: meta
        ? { atual: totais.gorduraSaturadaG, teto: meta.gorduraSaturadaTetoG }
        : null,
    };
  }
}
