import { PlanejadorService } from './planejador.service';
import { AlimentosService } from '../alimentos/alimentos.service';
import { Alimento, Meta } from '../comum/entidades';

const alimentosService = new AlimentosService({} as never);

const chocolate = {
  id: 'c1', nome: 'Chocolate ao leite', modoPreparo: 'industrializado', fonte: 'TACO',
  kcal100g: 540, proteina100g: 7.2, carboidrato100g: 59.6, gordura100g: 30.3,
  fibra100g: 2, gorduraSaturada100g: 18.5,
} as Alimento;

const arroz = {
  id: 'a1', nome: 'Arroz branco', modoPreparo: 'cozido', fonte: 'TACO',
  kcal100g: 128, proteina100g: 2.5, carboidrato100g: 28.1, gordura100g: 0.2,
  fibra100g: 1.6, gorduraSaturada100g: 0.1,
} as Alimento;

describe('PlanejadorService', () => {
  const s = new PlanejadorService({} as never, alimentosService);

  const meta = {
    calorias: 2450, proteinaG: 146, carboidratoG: 302, gorduraG: 73,
  } as Meta;

  const totaisZerados = {
    kcal: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0, fibraG: 0, gorduraSaturadaG: 0,
  };

  it('calcula o espaço restante do dia', () => {
    const espaco = s.calcularEspaco(meta, { ...totaisZerados, kcal: 500, proteinaG: 30 });
    expect(espaco.kcal).toBe(1950);
    expect(espaco.proteinaG).toBe(116);
  });

  it('diz quanto cabe da maravilha e qual macro limita', () => {
    const espaco = { kcal: 2450, proteinaG: 146, carboidratoG: 302, gorduraG: 73 };
    const r = s.quantoCabe(chocolate, espaco);
    expect(r.cabe).toBe(true);
    // 73 g de gordura / 30,3 g por 100 g -> ~240 g
    expect(r.gramas).toBeGreaterThan(200);
    expect(r.macroLimitante).toBe('gordura');
  });

  it('devolve zero quando o dia já fechou', () => {
    const espaco = { kcal: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0 };
    expect(s.quantoCabe(chocolate, espaco).cabe).toBe(false);
  });

  it('nunca sugere gramas negativas com espaço estourado', () => {
    const espaco = { kcal: -300, proteinaG: -10, carboidratoG: -50, gorduraG: -20 };
    const r = s.quantoCabe(chocolate, espaco);
    expect(r.gramas).toBeGreaterThanOrEqual(0);
    expect(r.cabe).toBe(false);
  });

  it('ajuste fino diz quanto tirar pra fechar o dia', () => {
    const espaco = { kcal: -128, proteinaG: 0, carboidratoG: 0, gorduraG: 0 };
    const r = s.ajusteFino(arroz, 200, espaco);
    expect(r.precisaAjuste).toBe(true);
    expect(r.gramasNovas).toBeLessThan(200);
    expect(r.mensagem).toContain('Arroz');
  });

  it('não pede ajuste quando o dia está dentro da meta', () => {
    const r = s.ajusteFino(arroz, 100, { kcal: 200, proteinaG: 10, carboidratoG: 20, gorduraG: 5 });
    expect(r.precisaAjuste).toBe(false);
  });

  it('detecta incoerência entre macros e calorias registradas', () => {
    const r = s.conferirCoerencia({
      ...totaisZerados, kcal: 1000, proteinaG: 100, carboidratoG: 100, gorduraG: 50,
    });
    // 100*4 + 100*4 + 50*9 = 1250, contra 1000 registrados
    expect(r.coerente).toBe(false);
    expect(r.aviso).toContain('alimento cadastrado');
  });

  it('aceita pequena divergência de arredondamento', () => {
    const r = s.conferirCoerencia({
      ...totaisZerados, kcal: 1250, proteinaG: 100, carboidratoG: 100, gorduraG: 50,
    });
    expect(r.coerente).toBe(true);
    expect(r.aviso).toBeNull();
  });
});
