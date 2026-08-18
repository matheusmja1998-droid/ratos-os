import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Alimento } from '../comum/entidades';
import { ALIMENTOS_TACO } from './taco.seed';

/** Remove acentos e normaliza pra busca: "pão" e "pao" acham a mesma coisa. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Como as pessoas chamam a comida x como ela está cadastrada.
 *
 * A base usa o nome técnico da TACO ("peito de frango sem pele"), mas ninguém
 * digita assim. Sem isso a busca falha justamente nos alimentos mais comuns.
 */
const SINONIMOS: Record<string, string[]> = {
  file: ['peito', 'bife'],
  'file de frango': ['peito de frango'],
  frango: ['frango'],
  bife: ['patinho', 'acem', 'bisteca'],
  carne: ['patinho', 'acem', 'bisteca'],
  'carne moida': ['patinho moido', 'acem moido'],
  peixe: ['tilapia', 'sardinha', 'atum'],
  refri: ['refrigerante'],
  pao: ['pao'],
  macarrao: ['macarrao'],
  ovo: ['ovo'],
  presunto: ['presunto'],
  batata: ['batata'],
  nutella: ['creme de avela'],
  'doce de leite': ['doce de leite'],
  iogurte: ['iogurte'],
  requeijao: ['requeijao'],
  suco: ['suco'],
};

/** Ordem de confiança das fontes. Dado verificado sobe na busca. */
const PESO_FONTE: Record<string, number> = {
  TACO: 100, TBCA: 90, USDA: 80, ROTULO: 50, USUARIO: 10,
};

@Injectable()
export class AlimentosService implements OnModuleInit {
  constructor(
    @InjectRepository(Alimento) private readonly repo: Repository<Alimento>,
  ) {}

  /** Popula a base na primeira execução. */
  async onModuleInit() {
    const total = await this.repo.count();
    if (total > 0) return;

    const registros = ALIMENTOS_TACO.map((a) =>
      this.repo.create({
        nome: a.nome,
        nomeBusca: normalizar(`${a.nome} ${a.modoPreparo}`),
        modoPreparo: a.modoPreparo as Alimento['modoPreparo'],
        fonte: a.fonte as Alimento['fonte'],
        codigoFonte: a.codigoFonte,
        marca: a.marca,
        kcal100g: a.kcal100g,
        proteina100g: a.proteina100g,
        carboidrato100g: a.carboidrato100g,
        gordura100g: a.gordura100g,
        fibra100g: a.fibra100g ?? 0,
        gorduraSaturada100g: a.gorduraSaturada100g ?? 0,
        porcoes: a.porcoes ?? [],
        verificado: true,
      }),
    );
    await this.repo.save(registros);
  }

  /**
   * Busca por nome. Resultados de fonte confiável (TACO/TBCA) vêm primeiro —
   * é o que evita cadastrar um dado inventado sem perceber.
   */
  async buscar(termo: string, limite = 25): Promise<Alimento[]> {
    const alvo = normalizar(termo);
    if (!alvo) return [];

    const achados = await this.repo.find({
      where: { nomeBusca: Like(`%${alvo}%`) },
      take: limite * 3,
    });

    // Nada encontrado pelo nome literal: tenta como a pessoa fala.
    if (achados.length === 0) {
      const porSinonimo = await this.buscarPorSinonimo(alvo, limite);
      if (porSinonimo.length > 0) return porSinonimo;
    }

    return achados
      .sort((a, b) => {
        // Quem começa com o termo digitado vem antes.
        const inicioA = a.nomeBusca.startsWith(alvo) ? 1 : 0;
        const inicioB = b.nomeBusca.startsWith(alvo) ? 1 : 0;
        if (inicioA !== inicioB) return inicioB - inicioA;

        const fonteA = PESO_FONTE[a.fonte] ?? 0;
        const fonteB = PESO_FONTE[b.fonte] ?? 0;
        if (fonteA !== fonteB) return fonteB - fonteA;

        return a.nome.length - b.nome.length;
      })
      .slice(0, limite);
  }

  /**
   * Segunda tentativa da busca: traduz o termo coloquial e, se ainda assim
   * nada bater, procura por cada palavra isolada ("file de frango" -> "frango").
   */
  private async buscarPorSinonimo(alvo: string, limite: number): Promise<Alimento[]> {
    const termos = new Set<string>();

    for (const [coloquial, tecnicos] of Object.entries(SINONIMOS)) {
      if (alvo.includes(coloquial)) tecnicos.forEach((t) => termos.add(t));
    }
    // Palavras com 4+ letras costumam carregar o sentido ("frango", "arroz").
    alvo.split(/\s+/).filter((p) => p.length >= 4).forEach((p) => termos.add(p));

    const vistos = new Map<string, Alimento>();
    for (const termo of termos) {
      const achados = await this.repo.find({
        where: { nomeBusca: Like(`%${termo}%`) },
        take: limite,
      });
      achados.forEach((a) => vistos.set(a.id, a));
    }

    return [...vistos.values()]
      .sort((a, b) => (PESO_FONTE[b.fonte] ?? 0) - (PESO_FONTE[a.fonte] ?? 0))
      .slice(0, limite);
  }

  async porId(id: string): Promise<Alimento> {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`Alimento ${id} não encontrado`);
    return a;
  }

  async porCodigoBarras(codigo: string): Promise<Alimento | null> {
    return this.repo.findOne({ where: { codigoBarras: codigo } });
  }

  /**
   * Calcula os macros de uma quantidade em gramas.
   *
   * Trabalhamos sempre em gramas, nunca em "porções": o erro clássico de app
   * de macro é registrar 20 porções de 25 g achando que registrou 20 g.
   */
  calcularPorGramas(alimento: Alimento, gramas: number) {
    const f = gramas / 100;
    const arred = (n: number) => Math.round(n * 10) / 10;
    return {
      kcal: Math.round(alimento.kcal100g * f),
      proteinaG: arred(alimento.proteina100g * f),
      carboidratoG: arred(alimento.carboidrato100g * f),
      gorduraG: arred(alimento.gordura100g * f),
      fibraG: arred(alimento.fibra100g * f),
      gorduraSaturadaG: arred(alimento.gorduraSaturada100g * f),
    };
  }

  /**
   * Cadastro pelo usuário. Sem fonte declarada o alimento entra como não
   * verificado e afunda na busca — dado de origem desconhecida não pode
   * competir com a TACO.
   */
  async criar(dados: Partial<Alimento>, usuarioId: string): Promise<Alimento> {
    const fonte = (dados.fonte ?? 'USUARIO') as Alimento['fonte'];
    const alimento = this.repo.create({
      ...dados,
      fonte,
      nomeBusca: normalizar(`${dados.nome} ${dados.modoPreparo ?? ''}`),
      verificado: fonte === 'TACO' || fonte === 'TBCA' || fonte === 'USDA',
      criadoPorUsuarioId: usuarioId,
    });
    return this.repo.save(alimento);
  }

  /**
   * Confere se as calorias declaradas batem com a soma dos macros.
   *
   * Se a pessoa cadastra um rótulo e a conta não fecha, quase sempre há erro
   * de digitação. Melhor avisar na hora do que descobrir o desvio semanas
   * depois num resultado que não veio.
   */
  validarCoerencia(a: Pick<Alimento, 'kcal100g' | 'proteina100g' | 'carboidrato100g' | 'gordura100g'>) {
    const calculado = a.proteina100g * 4 + a.carboidrato100g * 4 + a.gordura100g * 9;
    const diferenca = Math.abs(calculado - a.kcal100g);
    const tolerancia = Math.max(20, a.kcal100g * 0.1);
    return {
      coerente: diferenca <= tolerancia,
      kcalCalculado: Math.round(calculado),
      kcalDeclarado: a.kcal100g,
      diferenca: Math.round(diferenca),
      aviso:
        diferenca > tolerancia
          ? `A soma dos macros dá ${Math.round(calculado)} kcal, mas o rótulo diz ${a.kcal100g} kcal. Confira os valores antes de salvar — provavelmente há um erro de digitação.`
          : null,
    };
  }
}
