import { ALIMENTOS_TACO } from './taco.seed';
import { ALIMENTOS_TACO_COMPLETO } from './taco.completo';

/**
 * Guarda de licença.
 *
 * A TACO permite reprodução "desde que citada a fonte", sem cláusula
 * não-comercial — pode ir pra produto pago. A TBCA é CC BY-NC-ND 4.0:
 * proíbe uso comercial E proíbe obra derivada, o que já barra normalizar os
 * valores pro schema daqui.
 *
 * Estes testes existem pra que a decisão apareça antes de virar problema
 * jurídico: se o app for comercializado, os itens TBCA precisam sair ou ser
 * substituídos por equivalente TACO ou de rótulo.
 */
describe('licença das fontes de dados', () => {
  const todos = [...ALIMENTOS_TACO, ...ALIMENTOS_TACO_COMPLETO];

  it('só usa fontes conhecidas', () => {
    const permitidas = new Set(['TACO', 'TBCA', 'USDA', 'ROTULO', 'USUARIO']);
    const desconhecidas = [...new Set(todos.map((a) => a.fonte))].filter(
      (f) => !permitidas.has(f),
    );
    expect(desconhecidas).toEqual([]);
  });

  it('a base gerada é 100% TACO', () => {
    const outras = ALIMENTOS_TACO_COMPLETO.filter((a) => a.fonte !== 'TACO');
    expect(outras).toHaveLength(0);
  });

  it('todo alimento declara sua fonte e o modo de preparo', () => {
    const incompletos = todos.filter((a) => !a.fonte || !a.modoPreparo || !a.nome);
    expect(incompletos).toEqual([]);
  });

  it('itens TBCA (licença não-comercial) estão inventariados', () => {
    // Se este número mudar, a lista abaixo precisa ser revista junto.
    // Uso pessoal: tudo certo. Uso comercial: estes itens precisam sair.
    const tbca = todos.filter((a) => a.fonte === 'TBCA').map((a) => a.nome);
    // Se este número subir, alguém adicionou dado de licença não-comercial.
    expect(tbca).toHaveLength(9);
    expect(todos.filter((a) => a.fonte === 'TACO').length).toBeGreaterThan(580);
  });

  it('os macros de cada alimento fecham com as calorias declaradas', () => {
    const incoerentes = todos.filter((a) => {
      if (a.kcal100g < 50) return false;
      // A fibra entra no carboidrato total mas quase não fornece energia, então
      // um alimento muito fibroso (psyllium, farelo) "não fecha" pela conta
      // ingênua. Usa o carboidrato líquido quando a fibra é declarada.
      const carboLiquido = Math.max(0, a.carboidrato100g - (a.fibra100g ?? 0));
      const calcComFibra = a.proteina100g * 4 + a.carboidrato100g * 4 + a.gordura100g * 9;
      const calcLiquido = a.proteina100g * 4 + carboLiquido * 4 + a.gordura100g * 9;
      const erro = Math.min(
        Math.abs(calcComFibra - a.kcal100g),
        Math.abs(calcLiquido - a.kcal100g),
      );
      return erro / a.kcal100g > 0.3;
    });
    // "Fermento em pó" diverge na própria TACO por causa dos sais minerais.
    expect(incoerentes.map((a) => a.nome)).toEqual(['Fermento em pó (químico)']);
  });

  it('nenhum alimento tem valor negativo ou absurdo', () => {
    const invalidos = todos.filter(
      (a) =>
        a.kcal100g < 0 || a.kcal100g > 900 ||
        a.proteina100g < 0 || a.proteina100g > 100 ||
        a.carboidrato100g < 0 || a.carboidrato100g > 100 ||
        a.gordura100g < 0 || a.gordura100g > 100,
    );
    expect(invalidos.map((a) => a.nome)).toEqual([]);
  });
});
