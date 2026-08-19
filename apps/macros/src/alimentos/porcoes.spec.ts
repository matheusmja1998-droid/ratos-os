import { porcoesDe } from './porcoes';
import { violaRestricao, RESTRICOES, GRUPOS_RESTRICAO } from './restricoes';

describe('porções caseiras', () => {
  it('ovo é unidade, não gramas', () => {
    const p = porcoesDe('Ovo de galinha inteiro', 'cozido');
    expect(p.length).toBeGreaterThan(0);
    expect(p[0].rotulo).toContain('ovo');
    expect(p[0].gramas).toBe(50);
  });

  it('clara e gema têm pesos próprios', () => {
    expect(porcoesDe('Clara de ovo')[0].gramas).toBe(33);
    expect(porcoesDe('Gema de ovo')[0].gramas).toBe(17);
  });

  it('arroz vai em colher, feijão em concha', () => {
    expect(porcoesDe('Arroz branco', 'cozido')[0].rotulo).toContain('colher');
    expect(porcoesDe('Feijão carioca', 'cozido')[0].rotulo).toContain('concha');
  });

  it('pão de forma é fatia, pão francês é unidade', () => {
    expect(porcoesDe('Pão de forma integral')[0].rotulo).toBe('fatia');
    expect(porcoesDe('Pão francês')[0].rotulo).toBe('unidade');
  });

  it('não inventa porção para o que não tem', () => {
    expect(porcoesDe('Fubá de milho', 'cru')).toEqual([]);
  });

  it('a exceção impede a regra genérica', () => {
    // "arroz cru" não recebe colher de servir: ninguém serve arroz cru.
    expect(porcoesDe('Arroz branco', 'cru')).toEqual([]);
  });
});

describe('restrições alimentares', () => {
  it('todo grupo declarado existe na lista', () => {
    const grupos = new Set(RESTRICOES.map((r) => r.grupo));
    grupos.forEach((g) => expect(GRUPOS_RESTRICAO).toContain(g));
  });

  it('peixe pega nomes genéricos e regionais', () => {
    ['Atum em conserva', 'Sardinha', 'Pescadinha', 'Porquinho', 'Tilápia filé']
      .forEach((n) => expect(violaRestricao(n, ['peixe'])).toBe(true));
  });

  it('não esconde nada quando não há restrição', () => {
    expect(violaRestricao('Sardinha', [])).toBe(false);
    expect(violaRestricao('Sardinha')).toBe(false);
  });

  it('restrição de ovo pega clara e gema', () => {
    expect(violaRestricao('Clara de ovo', ['ovo'])).toBe(true);
    expect(violaRestricao('Gema de ovo', ['ovo'])).toBe(true);
  });

  it('só porco mantém boi e frango', () => {
    expect(violaRestricao('Bisteca suína', ['suino'])).toBe(true);
    expect(violaRestricao('Peito de frango sem pele', ['suino'])).toBe(false);
    expect(violaRestricao('Patinho moído', ['suino'])).toBe(false);
  });

  it('não confunde grupos diferentes', () => {
    expect(violaRestricao('Peito de frango sem pele', ['peixe'])).toBe(false);
    expect(violaRestricao('Arroz branco', ['leite'])).toBe(false);
  });
});
