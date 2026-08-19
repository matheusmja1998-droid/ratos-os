import { papelDoAlimento, tipoDaRefeicao, notaDePreferencia } from './prato';

describe('composição do prato', () => {
  it('reconhece o tipo de refeição pelo nome', () => {
    expect(tipoDaRefeicao('Café da manhã')).toBe('cafe');
    expect(tipoDaRefeicao('Almoço')).toBe('almoco');
    expect(tipoDaRefeicao('Janta')).toBe('janta');
    expect(tipoDaRefeicao('Ceia')).toBe('ceia');
    expect(tipoDaRefeicao('Lanche da tarde')).toBe('lanche');
  });

  it('trata refeição sem nome próprio como almoço', () => {
    // "Refeição 2" não diz nada; almoço é o prato mais completo e o mais
    // fácil de podar.
    expect(tipoDaRefeicao('Refeição 2')).toBe('almoco');
  });

  it('classifica os alimentos nos papéis do prato', () => {
    expect(papelDoAlimento('Arroz branco')).toBe('base');
    expect(papelDoAlimento('Feijão carioca')).toBe('leguminosa');
    expect(papelDoAlimento('Peito de frango sem pele')).toBe('proteina');
    expect(papelDoAlimento('Alface crespa')).toBe('salada');
    expect(papelDoAlimento('Banana prata')).toBe('fruta');
  });

  it('não classifica o que não compõe prato', () => {
    expect(papelDoAlimento('Fermento em pó')).toBeNull();
  });

  it('prefere o que de fato vai no prato brasileiro', () => {
    // Arroz branco ganha de inhame na base.
    expect(notaDePreferencia('base', 'Arroz branco'))
      .toBeGreaterThan(notaDePreferencia('base', 'Inhame'));
    // Feijão carioca ganha de lentilha.
    expect(notaDePreferencia('leguminosa', 'Feijão carioca'))
      .toBeGreaterThan(notaDePreferencia('leguminosa', 'Lentilha'));
  });

  it('a preferência muda conforme a refeição', () => {
    // No café, pão ganha de arroz — que é o certo na mesa.
    expect(notaDePreferencia('base', 'Pão de forma integral', 'cafe'))
      .toBeGreaterThan(notaDePreferencia('base', 'Arroz branco', 'cafe'));
    // No almoço, o contrário.
    expect(notaDePreferencia('base', 'Arroz branco', 'almoco'))
      .toBeGreaterThan(notaDePreferencia('base', 'Pão de forma integral', 'almoco'));
  });

  it('ovo é proteína de café, frango não', () => {
    expect(notaDePreferencia('proteina', 'Ovo de galinha inteiro', 'cafe'))
      .toBeGreaterThan(notaDePreferencia('proteina', 'Peito de frango sem pele', 'cafe'));
  });
});
