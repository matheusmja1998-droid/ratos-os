import { CalculoService } from './calculo/calculo.service';
const s = new CalculoService();
// Caso do vídeo: homem, 30 anos, 101kg, 180cm, moderado -> GET ~3100, alvo ~81
const r = s.calcular({ sexo:'masculino', idadeAnos:30, pesoKg:101, alturaCm:180, nivelAtividade:'moderado' }, 'emagrecer', 500);
console.log('TMB', r.tmb, '| GET', r.get, '| alvo', r.pesoAlvoKg, '| meta', r.metaCalorica);
console.log('macros', JSON.stringify(r.macros));
const soma = r.macros.proteinaG*4 + r.macros.carboidratoG*4 + r.macros.gorduraG*9;
console.log('confere kcal:', soma, '== meta', r.metaCalorica, soma===r.macros.calorias ? 'OK':'FAIL');
// Caso extremo: mulher baixa, meta apertada
const r2 = s.calcular({ sexo:'feminino', idadeAnos:45, pesoKg:60, alturaCm:155, nivelAtividade:'sedentario' }, 'emagrecer', 500);
console.log('\nMulher:', r2.metaCalorica, JSON.stringify(r2.macros), '\navisos:', r2.avisos.length);
// Caso 140kg (o dele antigo) - proteina nao pode explodir
const r3 = s.calcular({ sexo:'masculino', idadeAnos:28, pesoKg:140, alturaCm:180, nivelAtividade:'leve' }, 'emagrecer', 500);
console.log('\n140kg -> proteina', r3.macros.proteinaG, 'g (peso atual x2 seria 280g)');
