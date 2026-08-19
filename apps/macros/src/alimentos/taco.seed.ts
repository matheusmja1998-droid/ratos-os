/**
 * Base inicial de alimentos, referenciada na TACO (Tabela Brasileira de
 * Composição de Alimentos, NEPA/Unicamp, 4a edição) e em rótulos de produtos.
 *
 * Valores por 100 g da porção comestível, no modo de preparo indicado.
 * Modo de preparo faz parte da identidade: arroz cru e arroz cozido são
 * itens diferentes, e é o cozido que vai pro prato.
 *
 * LICENÇA — importa se este app virar produto pago:
 *
 *   TACO (NEPA/Unicamp, 4a ed. 2011, 597 alimentos) — o PDF oficial diz
 *   "É permitida a reprodução parcial ou total desta obra, desde que citada
 *   a fonte". Sem cláusula não-comercial: pode ser usada, inclusive
 *   comercialmente, com a citação.
 *
 *   TBCA (USP/FoRC) — CC BY-NC-ND 4.0: proíbe uso comercial E proíbe obra
 *   derivada, o que já barra normalizar os valores pro schema daqui. Os itens
 *   marcados abaixo com fonte 'TBCA' estão aqui por conveniência de uso
 *   pessoal e PRECISAM sair (ou virar equivalente TACO/rótulo) antes de
 *   qualquer versão comercial. Uso comercial exige acordo com os
 *   coordenadores da USP.
 *
 *   ROTULO — valor declarado pelo fabricante na embalagem. Fato comercial
 *   publicado, sem restrição de uso.
 */
export interface SeedAlimento {
  nome: string;
  modoPreparo: string;
  fonte: string;
  codigoFonte?: string;
  marca?: string;
  kcal100g: number;
  proteina100g: number;
  carboidrato100g: number;
  gordura100g: number;
  fibra100g?: number;
  gorduraSaturada100g?: number;
  porcoes?: { rotulo: string; gramas: number }[];
}

export const ALIMENTOS_TACO: SeedAlimento[] = [
  // ---- Cereais e derivados ----
  { nome: 'Arroz branco', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'C0002',
    kcal100g: 128, proteina100g: 2.5, carboidrato100g: 28.1, gordura100g: 0.2, fibra100g: 1.6, gorduraSaturada100g: 0.1,
    porcoes: [{ rotulo: 'colher de servir', gramas: 45 }, { rotulo: 'escumadeira', gramas: 80 }] },
  { nome: 'Arroz integral', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'C0006',
    kcal100g: 124, proteina100g: 2.6, carboidrato100g: 25.8, gordura100g: 1.0, fibra100g: 2.7, gorduraSaturada100g: 0.3 },
  { nome: 'Macarrão', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'C0033',
    kcal100g: 111, proteina100g: 3.9, carboidrato100g: 23.1, gordura100g: 0.4, fibra100g: 1.6 },
  { nome: 'Pão francês', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'C0044',
    kcal100g: 300, proteina100g: 8.0, carboidrato100g: 58.6, gordura100g: 3.1, fibra100g: 2.3, gorduraSaturada100g: 0.6,
    porcoes: [{ rotulo: 'unidade', gramas: 50 }] },
  { nome: 'Pão de forma integral', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'C0046',
    kcal100g: 253, proteina100g: 9.4, carboidrato100g: 49.9, gordura100g: 3.4, fibra100g: 6.9,
    porcoes: [{ rotulo: 'fatia', gramas: 25 }] },
  { nome: 'Tapioca', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'C0059',
    kcal100g: 240, proteina100g: 0.3, carboidrato100g: 59.5, gordura100g: 0.1, fibra100g: 0.6 },
  { nome: 'Aveia em flocos', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'C0010',
    kcal100g: 394, proteina100g: 13.9, carboidrato100g: 66.6, gordura100g: 8.5, fibra100g: 9.1, gorduraSaturada100g: 1.5 },
  { nome: 'Farofa de mandioca', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'C0025',
    kcal100g: 406, proteina100g: 2.0, carboidrato100g: 78.8, gordura100g: 10.3, fibra100g: 6.4 },
  { nome: 'Cuscuz de milho', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'C0021',
    kcal100g: 113, proteina100g: 2.2, carboidrato100g: 25.3, gordura100g: 0.5, fibra100g: 1.4 },

  // ---- Leguminosas ----
  { nome: 'Feijão carioca', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'L0004',
    kcal100g: 76, proteina100g: 4.8, carboidrato100g: 13.6, gordura100g: 0.5, fibra100g: 8.5, gorduraSaturada100g: 0.1,
    porcoes: [{ rotulo: 'concha média', gramas: 80 }] },
  { nome: 'Feijão preto', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'L0007',
    kcal100g: 77, proteina100g: 4.5, carboidrato100g: 14.0, gordura100g: 0.5, fibra100g: 8.4 },
  { nome: 'Lentilha', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'L0013',
    kcal100g: 93, proteina100g: 6.3, carboidrato100g: 16.3, gordura100g: 0.5, fibra100g: 7.9 },
  { nome: 'Grão de bico', modoPreparo: 'cozido', fonte: 'TBCA',
    kcal100g: 164, proteina100g: 8.9, carboidrato100g: 27.4, gordura100g: 2.6, fibra100g: 7.6 },
  { nome: 'Soja proteína texturizada', modoPreparo: 'cru', fonte: 'TBCA',
    kcal100g: 336, proteina100g: 50.0, carboidrato100g: 33.0, gordura100g: 1.5, fibra100g: 18.0 },

  // ---- Carnes e ovos ----
  { nome: 'Peito de frango sem pele', modoPreparo: 'grelhado', fonte: 'TACO', codigoFonte: 'M0021',
    kcal100g: 159, proteina100g: 32.0, carboidrato100g: 0, gordura100g: 2.5, gorduraSaturada100g: 0.7 },
  { nome: 'Peito de frango sem pele', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'M0020',
    kcal100g: 163, proteina100g: 31.5, carboidrato100g: 0, gordura100g: 3.2, gorduraSaturada100g: 0.9 },
  { nome: 'Coxa de frango sem pele', modoPreparo: 'assado', fonte: 'TACO', codigoFonte: 'M0028',
    kcal100g: 215, proteina100g: 26.9, carboidrato100g: 0, gordura100g: 11.4, gorduraSaturada100g: 3.1 },
  { nome: 'Patinho moído', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'M0062',
    kcal100g: 219, proteina100g: 35.9, carboidrato100g: 0, gordura100g: 7.3, gorduraSaturada100g: 2.9 },
  { nome: 'Acém moído', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'M0004',
    kcal100g: 212, proteina100g: 26.7, carboidrato100g: 0, gordura100g: 11.0, gorduraSaturada100g: 4.6 },
  { nome: 'Bisteca suína', modoPreparo: 'grelhado', fonte: 'TACO', codigoFonte: 'M0079',
    kcal100g: 305, proteina100g: 30.6, carboidrato100g: 0, gordura100g: 19.5, gorduraSaturada100g: 6.9 },
  { nome: 'Ovo de galinha inteiro', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'M0100',
    kcal100g: 146, proteina100g: 13.3, carboidrato100g: 0.6, gordura100g: 9.5, gorduraSaturada100g: 2.9,
    porcoes: [{ rotulo: 'unidade média', gramas: 50 }] },
  { nome: 'Clara de ovo', modoPreparo: 'cozido', fonte: 'TACO',
    kcal100g: 59, proteina100g: 13.4, carboidrato100g: 0, gordura100g: 0.1,
    porcoes: [{ rotulo: 'clara', gramas: 33 }] },
  { nome: 'Tilápia filé', modoPreparo: 'grelhado', fonte: 'TBCA',
    kcal100g: 128, proteina100g: 26.2, carboidrato100g: 0, gordura100g: 2.7, gorduraSaturada100g: 0.9 },
  { nome: 'Sardinha em conserva', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'P0033',
    kcal100g: 285, proteina100g: 24.6, carboidrato100g: 0, gordura100g: 20.7, gorduraSaturada100g: 5.4 },
  { nome: 'Atum em conserva ao natural', modoPreparo: 'industrializado', fonte: 'ROTULO',
    kcal100g: 110, proteina100g: 25.0, carboidrato100g: 0, gordura100g: 1.0, gorduraSaturada100g: 0.3 },

  // ---- Laticínios ----
  { nome: 'Leite integral', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'D0003',
    kcal100g: 61, proteina100g: 2.9, carboidrato100g: 4.3, gordura100g: 3.2, gorduraSaturada100g: 1.9,
    porcoes: [{ rotulo: 'copo (200 ml)', gramas: 200 }] },
  { nome: 'Leite desnatado', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'D0002',
    kcal100g: 35, proteina100g: 3.4, carboidrato100g: 4.9, gordura100g: 0.2, gorduraSaturada100g: 0.1 },
  { nome: 'Iogurte natural integral', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'D0016',
    kcal100g: 51, proteina100g: 4.1, carboidrato100g: 1.9, gordura100g: 3.0, gorduraSaturada100g: 1.9 },
  { nome: 'Queijo minas frescal', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'D0010',
    kcal100g: 264, proteina100g: 17.4, carboidrato100g: 3.2, gordura100g: 20.2, gorduraSaturada100g: 12.8 },
  { nome: 'Queijo mussarela', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'D0011',
    kcal100g: 330, proteina100g: 22.6, carboidrato100g: 3.0, gordura100g: 25.2, gorduraSaturada100g: 16.0,
    porcoes: [{ rotulo: 'fatia', gramas: 20 }] },
  { nome: 'Requeijão cremoso light', modoPreparo: 'industrializado', fonte: 'ROTULO',
    kcal100g: 172, proteina100g: 9.0, carboidrato100g: 5.0, gordura100g: 12.5, gorduraSaturada100g: 8.0,
    porcoes: [{ rotulo: 'colher de sopa', gramas: 30 }] },
  { nome: 'Whey protein concentrado', modoPreparo: 'industrializado', fonte: 'ROTULO',
    kcal100g: 400, proteina100g: 71.4, carboidrato100g: 14.3, gordura100g: 5.7, gorduraSaturada100g: 2.9,
    porcoes: [{ rotulo: 'scoop', gramas: 30 }] },

  // ---- Frutas ----
  { nome: 'Banana prata', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'F0018',
    kcal100g: 98, proteina100g: 1.3, carboidrato100g: 26.0, gordura100g: 0.1, fibra100g: 2.0,
    porcoes: [{ rotulo: 'unidade média', gramas: 70 }] },
  { nome: 'Maçã com casca', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'F0043',
    kcal100g: 56, proteina100g: 0.3, carboidrato100g: 15.2, gordura100g: 0, fibra100g: 1.3,
    porcoes: [{ rotulo: 'unidade média', gramas: 130 }] },
  { nome: 'Mamão papaia', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'F0044',
    kcal100g: 40, proteina100g: 0.5, carboidrato100g: 10.4, gordura100g: 0.1, fibra100g: 1.8 },
  { nome: 'Melancia', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'F0047',
    kcal100g: 33, proteina100g: 0.9, carboidrato100g: 8.1, gordura100g: 0, fibra100g: 0.1 },
  { nome: 'Abacaxi', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'F0002',
    kcal100g: 48, proteina100g: 0.9, carboidrato100g: 12.3, gordura100g: 0.1, fibra100g: 1.0 },
  { nome: 'Laranja pera', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'F0039',
    kcal100g: 37, proteina100g: 1.0, carboidrato100g: 8.9, gordura100g: 0.1, fibra100g: 0.8 },
  { nome: 'Abacate', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'F0001',
    kcal100g: 96, proteina100g: 1.2, carboidrato100g: 6.0, gordura100g: 8.4, fibra100g: 6.3, gorduraSaturada100g: 2.2 },

  // ---- Hortaliças / tubérculos ----
  { nome: 'Batata inglesa', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'V0018',
    kcal100g: 52, proteina100g: 1.2, carboidrato100g: 11.9, gordura100g: 0, fibra100g: 1.3 },
  { nome: 'Batata doce', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'V0016',
    kcal100g: 77, proteina100g: 0.6, carboidrato100g: 18.4, gordura100g: 0.1, fibra100g: 2.2 },
  { nome: 'Mandioca', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'V0038',
    kcal100g: 125, proteina100g: 0.6, carboidrato100g: 30.1, gordura100g: 0.3, fibra100g: 1.6 },
  { nome: 'Mandioca', modoPreparo: 'frito', fonte: 'TACO', codigoFonte: 'V0039',
    kcal100g: 300, proteina100g: 1.4, carboidrato100g: 38.9, gordura100g: 15.6, fibra100g: 2.7, gorduraSaturada100g: 3.6 },
  { nome: 'Alface crespa', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'V0004',
    kcal100g: 11, proteina100g: 1.3, carboidrato100g: 1.7, gordura100g: 0.2, fibra100g: 1.7 },
  { nome: 'Tomate', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'V0056',
    kcal100g: 15, proteina100g: 1.1, carboidrato100g: 3.1, gordura100g: 0.2, fibra100g: 1.2 },
  { nome: 'Brócolis', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'V0022',
    kcal100g: 25, proteina100g: 2.1, carboidrato100g: 4.4, gordura100g: 0.5, fibra100g: 3.4 },
  { nome: 'Cenoura', modoPreparo: 'cru', fonte: 'TACO', codigoFonte: 'V0026',
    kcal100g: 34, proteina100g: 1.3, carboidrato100g: 7.7, gordura100g: 0.2, fibra100g: 3.2 },

  // ---- Óleos e gorduras ----
  { nome: 'Óleo de soja', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'O0007',
    kcal100g: 884, proteina100g: 0, carboidrato100g: 0, gordura100g: 100, gorduraSaturada100g: 15.7,
    porcoes: [{ rotulo: 'colher de sopa', gramas: 8 }] },
  { nome: 'Azeite de oliva', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'O0002',
    kcal100g: 884, proteina100g: 0, carboidrato100g: 0, gordura100g: 100, gorduraSaturada100g: 13.8 },
  { nome: 'Manteiga com sal', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'O0005',
    kcal100g: 726, proteina100g: 0.4, carboidrato100g: 0.1, gordura100g: 82.4, gorduraSaturada100g: 48.8 },
  { nome: 'Amendoim torrado', modoPreparo: 'assado', fonte: 'TACO', codigoFonte: 'N0004',
    kcal100g: 544, proteina100g: 27.2, carboidrato100g: 20.3, gordura100g: 43.9, fibra100g: 8.0, gorduraSaturada100g: 6.1 },
  { nome: 'Pasta de amendoim integral', modoPreparo: 'industrializado', fonte: 'ROTULO',
    kcal100g: 588, proteina100g: 25.0, carboidrato100g: 20.0, gordura100g: 47.0, fibra100g: 8.0, gorduraSaturada100g: 7.0 },

  // ---- As "maravilhas": comida que dá prazer, tratada como comida ----
  { nome: 'Chocolate ao leite', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'S0010',
    kcal100g: 540, proteina100g: 7.2, carboidrato100g: 59.6, gordura100g: 30.3, fibra100g: 2.0, gorduraSaturada100g: 18.5,
    porcoes: [{ rotulo: 'quadradinho', gramas: 6 }] },
  { nome: 'Brigadeiro', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'S0007',
    kcal100g: 394, proteina100g: 4.4, carboidrato100g: 55.9, gordura100g: 17.4, gorduraSaturada100g: 10.4 },
  { nome: 'Sorvete de creme', modoPreparo: 'industrializado', fonte: 'ROTULO',
    kcal100g: 207, proteina100g: 3.5, carboidrato100g: 23.6, gordura100g: 11.0, gorduraSaturada100g: 7.0 },
  { nome: 'Pizza mussarela', modoPreparo: 'assado', fonte: 'TBCA',
    kcal100g: 269, proteina100g: 12.3, carboidrato100g: 29.5, gordura100g: 11.2, fibra100g: 1.8, gorduraSaturada100g: 5.4,
    porcoes: [{ rotulo: 'fatia', gramas: 100 }] },
  { nome: 'Pastel de carne', modoPreparo: 'frito', fonte: 'TBCA',
    kcal100g: 320, proteina100g: 8.5, carboidrato100g: 30.0, gordura100g: 18.5, fibra100g: 1.5, gorduraSaturada100g: 4.5 },
  { nome: 'Cerveja pilsen', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'B0004',
    kcal100g: 41, proteina100g: 0.6, carboidrato100g: 3.3, gordura100g: 0,
    porcoes: [{ rotulo: 'lata (350 ml)', gramas: 350 }, { rotulo: 'long neck (355 ml)', gramas: 355 }] },
  { nome: 'Coxinha de frango', modoPreparo: 'frito', fonte: 'TBCA',
    kcal100g: 292, proteina100g: 9.3, carboidrato100g: 27.4, gordura100g: 16.1, gorduraSaturada100g: 4.0 },
  { nome: 'Batata palha', modoPreparo: 'industrializado', fonte: 'ROTULO',
    kcal100g: 545, proteina100g: 4.0, carboidrato100g: 52.0, gordura100g: 34.0, fibra100g: 4.0, gorduraSaturada100g: 4.5 },
  { nome: 'Pipoca com manteiga', modoPreparo: 'industrializado', fonte: 'TBCA',
    kcal100g: 448, proteina100g: 9.0, carboidrato100g: 57.0, gordura100g: 21.0, fibra100g: 10.0, gorduraSaturada100g: 9.0 },
  { nome: 'Doce de leite', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'S0016',
    kcal100g: 306, proteina100g: 6.8, carboidrato100g: 59.5, gordura100g: 6.0, gorduraSaturada100g: 3.7 },
  { nome: 'Creme de avelã com cacau', modoPreparo: 'industrializado', fonte: 'ROTULO',
    kcal100g: 539, proteina100g: 6.3, carboidrato100g: 57.5, gordura100g: 30.9, fibra100g: 3.4, gorduraSaturada100g: 10.6 },
  { nome: 'Hambúrguer bovino', modoPreparo: 'grelhado', fonte: 'TBCA',
    kcal100g: 260, proteina100g: 19.0, carboidrato100g: 3.5, gordura100g: 19.0, gorduraSaturada100g: 8.0 },

  // ---- Diversos ----
  { nome: 'Café coado sem açúcar', modoPreparo: 'cozido', fonte: 'TACO', codigoFonte: 'B0002',
    kcal100g: 4, proteina100g: 0.2, carboidrato100g: 0.7, gordura100g: 0 },
  { nome: 'Açúcar refinado', modoPreparo: 'industrializado', fonte: 'TACO', codigoFonte: 'S0002',
    kcal100g: 387, proteina100g: 0, carboidrato100g: 99.9, gordura100g: 0,
    porcoes: [{ rotulo: 'colher de chá', gramas: 5 }] },
  { nome: 'Pão de queijo', modoPreparo: 'assado', fonte: 'TBCA',
    kcal100g: 363, proteina100g: 5.2, carboidrato100g: 39.0, gordura100g: 20.0, fibra100g: 1.0, gorduraSaturada100g: 7.5,
    porcoes: [{ rotulo: 'unidade pequena', gramas: 20 }, { rotulo: 'unidade média', gramas: 35 }] },
  { nome: 'Açaí polpa com guaraná', modoPreparo: 'industrializado', fonte: 'ROTULO',
    kcal100g: 110, proteina100g: 1.0, carboidrato100g: 22.0, gordura100g: 2.5, fibra100g: 2.0, gorduraSaturada100g: 0.6,
    porcoes: [{ rotulo: 'tigela (300 g)', gramas: 300 }] },

  // Psyllium saiu daqui de propósito: os valores que eu tinha eram estimativa,
  // não leitura de rótulo, e não fechavam na conferência de coerência. Cadastre
  // pelo rótulo da marca que você usa — a rota POST /alimentos confere a soma
  // dos macros contra as calorias na hora de salvar.
];
