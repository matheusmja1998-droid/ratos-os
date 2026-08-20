import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlimentosService, normalizar } from './alimentos.service';
import { Alimento } from '../comum/entidades';

/**
 * Busca rodando contra a base real, em SQLite na memória.
 *
 * O que estes testes protegem é o diferencial do app: o modo de preparo muda o
 * alimento, e a busca precisa respeitar isso — mandioca cozida tem 125 kcal e
 * frita tem 300.
 */
describe('AlimentosService — busca', () => {
  let service: AlimentosService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Alimento],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Alimento]),
      ],
      providers: [AlimentosService],
    }).compile();

    service = mod.get(AlimentosService);
    await service.onModuleInit();
  }, 60000);

  it('normaliza acentos', () => {
    expect(normalizar('Pão')).toBe('pao');
    expect(normalizar('Feijão Carioca')).toBe('feijao carioca');
  });

  it('carrega a base completa', async () => {
    const repo = (service as unknown as { repo: Repository<Alimento> }).repo;
    expect(await repo.count()).toBeGreaterThan(680);
  });

  it('acha alimento mesmo digitado sem acento', async () => {
    const r = await service.buscar('feijao carioca');
    expect(r[0].nome).toContain('Feijão');
  });

  it('respeita o modo de preparo pedido', async () => {
    const cozida = await service.buscar('mandioca cozida');
    const frita = await service.buscar('mandioca frita');
    expect(cozida[0].modoPreparo).toBe('cozido');
    expect(frita[0].modoPreparo).toBe('frito');
    // O ponto do diferencial: são valores muito diferentes.
    expect(frita[0].kcal100g).toBeGreaterThan(cozida[0].kcal100g * 2);
  });

  it('entende como as pessoas falam', async () => {
    // Com produtos de marca na base, "nutella" acha a Nutella mesmo; sem
    // eles, cai no equivalente genérico da TACO. Os dois servem.
    const nutella = await service.buscar('nutella');
    expect(nutella[0].nome.toLowerCase()).toMatch(/nutella|avelã/);

    const file = await service.buscar('file de frango');
    expect(file[0].nome.toLowerCase()).toContain('frango');
  });

  it('prioriza fonte verificada', async () => {
    const r = await service.buscar('arroz');
    expect(['TACO', 'TBCA']).toContain(r[0].fonte);
  });

  it('tolera flexão de gênero e número', async () => {
    // A TACO escreve "moído"; ninguém digita assim.
    const moida = await service.buscar('moida');
    expect(moida.length).toBeGreaterThan(0);
    expect(moida[0].nome.toLowerCase()).toContain('moíd');

    const moidas = await service.buscar('moidas');
    expect(moidas.length).toBeGreaterThan(0);
  });

  it('acha a comida do dia a dia que a TACO não tem', async () => {
    // Casos reais que falhavam: a TACO é de 2011 e trabalha com o alimento em
    // estado básico, sem preparo caseiro nem produto de marca.
    const casos: [string, string][] = [
      ['pao de forma', 'pão de forma'],
      ['frango desfiado', 'frango desfiado'],
      ['iogurte grego', 'iogurte grego'],
      ['peito de peru', 'peru'],
      ['ovo mexido', 'ovo mexido'],
      ['crepioca', 'crepioca'],
      ['cottage', 'cottage'],
    ];

    for (const [busca, esperado] of casos) {
      const r = await service.buscar(busca, 3);
      expect(r.length).toBeGreaterThan(0);
      expect(r[0].nome.toLowerCase()).toContain(esperado);
    }
  });

  it('o substantivo manda sobre o adjetivo', async () => {
    // "pão integral" é um pão — não pode devolver "Arroz integral" só porque
    // o adjetivo casou.
    const pao = await service.buscar('pao integral', 2);
    expect(pao[0].nome.toLowerCase()).toContain('pão');

    const queijo = await service.buscar('queijo branco', 2);
    expect(queijo[0].nome.toLowerCase()).toContain('queijo');
  });

  it('devolve vazio pra busca vazia', async () => {
    expect(await service.buscar('')).toEqual([]);
  });

  it('converte gramas corretamente', async () => {
    const [arroz] = await service.buscar('arroz cozido');
    const m = service.calcularPorGramas(arroz, 200);
    expect(m.kcal).toBe(Math.round(arroz.kcal100g * 2));
  });
});
