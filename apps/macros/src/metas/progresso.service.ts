import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Meta, RegistroPeso, Usuario } from '../comum/entidades';
import { CalculoService } from '../calculo/calculo.service';
import { NivelAtividade, Objetivo, Sexo } from '../calculo/calculo.tipos';

export interface TendenciaPeso {
  /** Média móvel: o peso do dia oscila com água, a tendência é que informa. */
  pesoTendenciaKg: number | null;
  variacaoSemanalKg: number | null;
  semanasDeDados: number;
  confiavel: boolean;
}

export interface DiagnosticoPlato {
  emPlato: boolean;
  semanasSemProgresso: number;
  recomendacao: string | null;
  ajusteSugerido: { carboidratoG: number; cardioMin: number } | null;
}

@Injectable()
export class ProgressoService {
  constructor(
    @InjectRepository(RegistroPeso) private readonly pesos: Repository<RegistroPeso>,
    @InjectRepository(Meta) private readonly metas: Repository<Meta>,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly calculo: CalculoService,
  ) {}

  /**
   * Tendência de peso por média móvel de 7 dias.
   *
   * Um dia de cerveja e sal muda o número da balança sem nenhuma gordura ter
   * entrado. Sem suavizar, a pessoa reage a ruído — e é aí que desiste.
   */
  async tendencia(usuarioId: string, dias = 28): Promise<TendenciaPeso> {
    const registros = await this.pesos.find({
      where: { usuarioId },
      order: { data: 'DESC' },
      take: dias,
    });

    if (registros.length < 7) {
      return {
        pesoTendenciaKg: registros[0]?.pesoKg ?? null,
        variacaoSemanalKg: null,
        semanasDeDados: Math.floor(registros.length / 7),
        confiavel: false,
      };
    }

    const ordenados = [...registros].reverse();
    const media = (arr: RegistroPeso[]) =>
      arr.reduce((s, r) => s + r.pesoKg, 0) / arr.length;

    const ultimos7 = ordenados.slice(-7);
    const anteriores7 = ordenados.slice(-14, -7);

    const atual = media(ultimos7);
    const variacao = anteriores7.length >= 5 ? atual - media(anteriores7) : null;

    return {
      pesoTendenciaKg: Math.round(atual * 100) / 100,
      variacaoSemanalKg: variacao === null ? null : Math.round(variacao * 100) / 100,
      semanasDeDados: Math.floor(ordenados.length / 7),
      confiavel: ordenados.length >= 14,
    };
  }

  /**
   * Detecta platô e devolve o ajuste na ordem certa do método:
   * corta carboidrato e sobe cardio. A proteína nunca entra na conta.
   */
  async diagnosticarPlato(usuarioId: string): Promise<DiagnosticoPlato> {
    const t = await this.tendencia(usuarioId);
    const meta = await this.metas.findOne({
      where: { usuarioId, ativa: true },
      order: { criadoEm: 'DESC' },
    });

    if (!t.confiavel || t.variacaoSemanalKg === null || !meta) {
      return {
        emPlato: false,
        semanasSemProgresso: 0,
        recomendacao:
          'Ainda não há dados suficientes. Pese-se na mesma condição por pelo menos duas semanas antes de mudar qualquer coisa.',
        ajusteSugerido: null,
      };
    }

    // Menos de 200 g por semana de variação, em déficit, é estagnação real.
    const estagnado = Math.abs(t.variacaoSemanalKg) < 0.2;
    if (!estagnado) {
      return {
        emPlato: false,
        semanasSemProgresso: 0,
        recomendacao: `Está progredindo: ${t.variacaoSemanalKg} kg na última semana. Não mude nada.`,
        ajusteSugerido: null,
      };
    }

    // Corte de ~10% do carboidrato, com piso, e mais 10 min de cardio.
    const corte = Math.max(15, Math.round(meta.carboidratoG * 0.1));
    const novoCarbo = Math.max(50, meta.carboidratoG - corte);

    return {
      emPlato: true,
      semanasSemProgresso: 1,
      recomendacao:
        `Seu peso parou. O ajuste é tirar ${meta.carboidratoG - novoCarbo} g de carboidrato ` +
        `(de ${meta.carboidratoG} g para ${novoCarbo} g) e somar 10 minutos de cardio. ` +
        `A proteína fica em ${meta.proteinaG} g — ela não se mexe.`,
      ajusteSugerido: { carboidratoG: novoCarbo, cardioMin: 10 },
    };
  }

  /**
   * Recalibra o GET com base no que aconteceu de verdade.
   *
   * A fórmula é um chute inicial. Depois de algumas semanas de peso e consumo
   * registrados, o gasto real aparece nos dados: se a pessoa comeu 2500 kcal
   * por dia e perdeu 0,3 kg na semana, o gasto dela era ~2830, não o que a
   * fórmula disse. Isso é o que os apps adaptativos fazem, e é mais honesto
   * que insistir na estimativa.
   */
  calcularGetReal(params: {
    mediaConsumoKcal: number;
    variacaoPesoSemanaKg: number;
  }): number {
    // ~7700 kcal por quilo de tecido adiposo.
    const kcalPorKg = 7700;
    const deficitDiarioReal = (-params.variacaoPesoSemanaKg * kcalPorKg) / 7;
    return Math.round(params.mediaConsumoKcal + deficitDiarioReal);
  }

  async recalcularMeta(
    usuarioId: string,
    pesoAtualKg: number,
    objetivo: Objetivo = 'emagrecer',
    deficitKcal = 500,
  ): Promise<Meta> {
    const usuario = await this.usuarios.findOneOrFail({ where: { id: usuarioId } });

    const resultado = this.calculo.calcular(
      {
        sexo: usuario.sexo as Sexo,
        idadeAnos: usuario.idadeAnos,
        pesoKg: pesoAtualKg,
        alturaCm: usuario.alturaCm,
        nivelAtividade: usuario.nivelAtividade as NivelAtividade,
      },
      objetivo,
      deficitKcal,
    );

    await this.metas.update({ usuarioId, ativa: true }, { ativa: false });

    const meta = this.metas.create({
      usuarioId,
      calorias: resultado.metaCalorica,
      proteinaG: resultado.macros.proteinaG,
      carboidratoG: resultado.macros.carboidratoG,
      gorduraG: resultado.macros.gorduraG,
      getCalculado: resultado.get,
      pesoAlvoKg: resultado.pesoAlvoKg,
      deficitKcal: resultado.deficitKcal,
      origem: 'recalculo',
      justificativa: `Recalculado com peso de ${pesoAtualKg} kg.`,
      ativa: true,
    });
    return this.metas.save(meta);
  }
}
