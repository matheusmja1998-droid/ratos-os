import { CalculoService } from './calculo.service';
import { DadosCorporais } from './calculo.tipos';

describe('CalculoService', () => {
  const s = new CalculoService();

  const gustavo: DadosCorporais = {
    sexo: 'masculino', idadeAnos: 30, pesoKg: 101, alturaCm: 180, nivelAtividade: 'moderado',
  };

  it('calcula a TMB por Mifflin-St Jeor', () => {
    // 10*101 + 6.25*180 - 5*30 + 5 = 1990
    expect(s.calcularTmb(gustavo)).toBeCloseTo(1990, 0);
  });

  it('bate com o GET do exemplo em vídeo (~3100 kcal)', () => {
    const r = s.calcular(gustavo);
    expect(r.get).toBeGreaterThan(3000);
    expect(r.get).toBeLessThan(3200);
  });

  it('usa peso alvo, e não peso atual, na proteína', () => {
    const obeso: DadosCorporais = { ...gustavo, pesoKg: 140 };
    const r = s.calcular(obeso);
    // Peso atual x 2 daria 280g. O alvo mantém em patamar utilizável.
    expect(r.macros.proteinaG).toBeLessThan(200);
    expect(r.macros.proteinaG).toBe(Math.round(r.pesoAlvoKg * 2));
  });

  it('mantém a mesma proteína independente do peso atual', () => {
    const magro = s.calcular({ ...gustavo, pesoKg: 85 });
    const gordo = s.calcular({ ...gustavo, pesoKg: 140 });
    expect(magro.macros.proteinaG).toBe(gordo.macros.proteinaG);
  });

  it('fecha a conta: kcal dos macros == calorias reportadas', () => {
    const r = s.calcular(gustavo);
    const soma =
      r.macros.proteinaG * 4 + r.macros.carboidratoG * 4 + r.macros.gorduraG * 9;
    expect(soma).toBe(r.macros.calorias);
  });

  it('chega perto da meta calórica (tolerância de arredondamento)', () => {
    const r = s.calcular(gustavo);
    expect(Math.abs(r.macros.calorias - r.metaCalorica)).toBeLessThanOrEqual(10);
  });

  it('limita o déficit a 25% do GET pra quem gasta pouco', () => {
    const r = s.calcular(
      { sexo: 'feminino', idadeAnos: 45, pesoKg: 60, alturaCm: 155, nivelAtividade: 'sedentario' },
      'emagrecer',
      500,
    );
    expect(r.metaCalorica).toBeGreaterThan(r.tmb);
    expect(r.avisos.some((a) => a.includes('reduzido'))).toBe(true);
  });

  it('nunca deixa a gordura abaixo do piso hormonal', () => {
    const r = s.calcular(
      { sexo: 'feminino', idadeAnos: 60, pesoKg: 50, alturaCm: 150, nivelAtividade: 'sedentario' },
      'emagrecer',
      1000,
    );
    expect(r.macros.gorduraG).toBeGreaterThanOrEqual(40);
  });

  it('nunca devolve carboidrato negativo', () => {
    const r = s.calcular(
      { sexo: 'feminino', idadeAnos: 70, pesoKg: 45, alturaCm: 148, nivelAtividade: 'sedentario' },
      'emagrecer',
      1000,
    );
    expect(r.macros.carboidratoG).toBeGreaterThanOrEqual(0);
  });

  it('aumenta a meta no objetivo de ganho', () => {
    const manter = s.calcular(gustavo, 'manter');
    const ganhar = s.calcular(gustavo, 'ganhar', 300);
    expect(ganhar.metaCalorica).toBeGreaterThan(manter.metaCalorica);
  });

  it('entrega a memória de cálculo completa', () => {
    const r = s.calcular(gustavo);
    expect(r.passos).toHaveLength(7);
    expect(r.passos.every((p) => p.formula && p.substituicao && p.porque)).toBe(true);
  });
});
