// Precisa vir antes do AppModule ser carregado: o TypeORM lê DB_PATH na
// avaliação do módulo, então definir isso dentro do beforeAll seria tarde.
process.env.DB_PATH = ':memory:';

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './app.module';
import { PASTA_PUBLICA } from './comum/caminhos';

/**
 * Fluxo de ponta a ponta, do jeito que uma pessoa usa o app:
 * cria conta, calcula as metas, come uma "maravilha", vê o que sobrou e
 * registra o peso.
 */
describe('Macros (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    (app as NestExpressApplication).useStaticAssets(PASTA_PUBLICA);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  }, 120000);

  afterAll(async () => { await app?.close(); });

  const req = () => request(app.getHttpServer());

  it('cria conta e devolve o perfil completo', async () => {
    const r = await req().post('/api/auth/registrar').send({
      email: 'e2e@teste.com', senha: 'senha12345', nome: 'Teste E2E',
      sexo: 'masculino', idadeAnos: 33, alturaCm: 178, nivelAtividade: 'moderado',
    }).expect(201);

    token = r.body.token;
    expect(token).toBeTruthy();

    // O perfil precisa vir inteiro: sem idade, altura e nível o cálculo
    // silenciosamente cairia em valores padrão e produziria a meta errada.
    const eu = await req().get('/api/auth/eu').set('Authorization', `Bearer ${token}`).expect(200);
    expect(eu.body).toMatchObject({ idadeAnos: 33, alturaCm: 178, nivelAtividade: 'moderado' });
  });

  it('onboarding entrega metas e primeiro peso já no cadastro', async () => {
    const r = await req().post('/api/auth/registrar').send({
      email: 'onboarding@teste.com', senha: 'senha12345', nome: 'Onboarding',
      sexo: 'masculino', idadeAnos: 33, alturaCm: 178, nivelAtividade: 'moderado',
      pesoKg: 95, objetivo: 'emagrecer', deficitKcal: 500,
    }).expect(201);

    // Sai do cadastro com a conta pronta, não num app vazio.
    expect(r.body.meta).toBeTruthy();
    expect(r.body.meta.origem).toBe('onboarding');
    expect(r.body.calculo.passos).toHaveLength(7);

    // Confere a metodologia: GET na centena, peso alvo inteiro,
    // proteína = alvo × 2.
    const c = r.body.calculo;
    expect(c.get % 100).toBe(0);
    expect(Number.isInteger(c.pesoAlvoKg)).toBe(true);
    expect(c.macros.proteinaG).toBe(c.pesoAlvoKg * 2);
    expect(c.macros.gorduraG).toBe(c.pesoAlvoKg);

    const auth = { Authorization: `Bearer ${r.body.token}` };

    // A meta já vale no diário.
    const dia = await req().get('/api/diario').set(auth).expect(200);
    expect(dia.body.meta.calorias).toBe(c.metaCalorica);

    // O peso do cadastro virou o primeiro ponto da série.
    const pesos = await req().get('/api/metas/peso').set(auth).expect(200);
    expect(pesos.body[0].pesoKg).toBe(95);
  });

  it('sem peso, o cadastro não inventa meta', async () => {
    const r = await req().post('/api/auth/registrar').send({
      email: 'semdados@teste.com', senha: 'senha12345', nome: 'Sem Dados',
    }).expect(201);

    expect(r.body.meta).toBeNull();
    expect(r.body.calculo).toBeNull();
  });

  it('recusa senha curta e e-mail repetido', async () => {
    await req().post('/api/auth/registrar')
      .send({ email: 'x@x.com', senha: '123', nome: 'X' }).expect(400);
    await req().post('/api/auth/registrar')
      .send({ email: 'e2e@teste.com', senha: 'senha12345', nome: 'Outro' }).expect(409);
  });

  it('bloqueia acesso sem token', async () => {
    await req().get('/api/diario').expect(401);
  });

  it('calcula metas com a memória de cálculo', async () => {
    const r = await req().post('/api/calculo').send({
      sexo: 'masculino', idadeAnos: 33, pesoKg: 95, alturaCm: 178,
      nivelAtividade: 'moderado', objetivo: 'emagrecer', deficitKcal: 500,
    }).expect(201);

    expect(r.body.passos).toHaveLength(7);
    expect(r.body.macros.proteinaG).toBe(Math.round(r.body.pesoAlvoKg * 2));
  });

  it('salva as metas do usuário', async () => {
    const r = await req().post('/api/metas/recalcular')
      .set('Authorization', `Bearer ${token}`)
      .send({ pesoKg: 95, objetivo: 'emagrecer', deficitKcal: 500 }).expect(201);

    expect(r.body.ativa).toBe(true);
    expect(r.body.carboidratoG).toBeGreaterThan(0);
  });

  it('come a maravilha primeiro e o dia se ajusta em volta', async () => {
    const auth = { Authorization: `Bearer ${token}` };

    const busca = await req().get('/api/alimentos/buscar?q=chocolate&limite=1')
      .expect(200);
    const chocolate = busca.body[0];

    const antes = await req().get('/api/diario').set(auth).expect(200);
    // A última refeição do dia — normalmente onde entra a sobremesa.
    const refeicao = antes.body.refeicoes[antes.body.refeicoes.length - 1];

    await req().post('/api/diario/itens').set(auth).send({
      refeicaoId: refeicao.id, alimentoId: chocolate.id, gramas: 50, ehMaravilha: true,
    }).expect(201);

    const depois = await req().get('/api/diario').set(auth).expect(200);
    expect(depois.body.totais.kcal).toBeGreaterThan(0);
    expect(depois.body.restante.kcal).toBeLessThan(antes.body.restante.kcal);

    const espaco = await req().get('/api/diario/espaco').set(auth).expect(200);
    expect(espaco.body.proteinaG).toBeGreaterThan(0);

    const fechar = await req().get('/api/diario/fechar').set(auth).expect(200);
    expect(fechar.body.sugestoes.length).toBeGreaterThan(0);
    // Sugestão precisa caber num prato de verdade, não ser só correta na conta.
    fechar.body.sugestoes.forEach((s: { gramasSugeridas: number }) => {
      expect(s.gramasSugeridas).toBeLessThanOrEqual(300);
    });
  });

  it('só aceita peso em gramas, nunca em porções', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);
    const busca = await req().get('/api/alimentos/buscar?q=arroz&limite=1').expect(200);

    await req().post('/api/diario/itens').set(auth).send({
      refeicaoId: dia.body.refeicoes[0].id,
      alimentoId: busca.body[0].id,
      gramas: 100,
      quantidadePorcoes: 4, // campo inexistente: precisa ser rejeitado
    }).expect(400);
  });

  it('avisa quando o rótulo não fecha a conta', async () => {
    const r = await req().post('/api/alimentos/validar').send({
      nome: 'Barra teste', modoPreparo: 'industrializado', fonte: 'ROTULO',
      kcal100g: 200, proteina100g: 30, carboidrato100g: 40, gordura100g: 15,
    }).expect(201);

    expect(r.body.coerente).toBe(false);
    expect(r.body.aviso).toContain('erro de digitação');
  });

  it('a busca distingue o modo de preparo', async () => {
    const cozida = await req().get('/api/alimentos/buscar?q=mandioca%20cozida&limite=1').expect(200);
    const frita = await req().get('/api/alimentos/buscar?q=mandioca%20frita&limite=1').expect(200);

    expect(cozida.body[0].modoPreparo).toBe('cozido');
    expect(frita.body[0].modoPreparo).toBe('frito');
    expect(frita.body[0].kcal100g).toBeGreaterThan(cozida.body[0].kcal100g);
  });

  it('registra peso e o ajuste de platô não mexe na proteína', async () => {
    const auth = { Authorization: `Bearer ${token}` };

    await req().post('/api/metas/peso').set(auth).send({ pesoKg: 95 }).expect(201);
    const t = await req().get('/api/metas/tendencia').set(auth).expect(200);
    expect(t.body.pesoTendenciaKg).toBe(95);

    const antes = await req().get('/api/metas').set(auth).expect(200);
    const novoCarbo = antes.body.carboidratoG - 30;

    const depois = await req().post('/api/metas/ajustar-carboidrato')
      .set(auth).send({ carboidratoG: novoCarbo }).expect(201);

    expect(depois.body.carboidratoG).toBe(novoCarbo);
    expect(depois.body.proteinaG).toBe(antes.body.proteinaG); // regra central
    expect(depois.body.gorduraG).toBe(antes.body.gorduraG);
  });

  it('o ajuste de platô corta carboidrato antes de gordura', async () => {
    const auth = { Authorization: `Bearer ${token}` };

    const antes = await req().get('/api/metas').set(auth).expect(200);
    const alvoCarbo = antes.body.carboidratoG - 20;

    const r = await req().post('/api/metas/ajustar-carboidrato')
      .set(auth).send({ carboidratoG: alvoCarbo }).expect(201);

    expect(r.body.carboidratoG).toBe(alvoCarbo);
    expect(r.body.gorduraG).toBe(antes.body.gorduraG);
    expect(r.body.proteinaG).toBe(antes.body.proteinaG);
  });

  it('a gordura nunca desce abaixo do piso hormonal', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const antes = await req().get('/api/metas').set(auth).expect(200);

    const r = await req().post('/api/metas/ajustar-carboidrato')
      .set(auth).send({ carboidratoG: antes.body.carboidratoG, gorduraG: 10 })
      .expect(201);

    expect(r.body.gorduraG).toBe(40);
    expect(r.body.proteinaG).toBe(antes.body.proteinaG); // intocada
  });

  it('deixa montar as refeições do dia', async () => {
    const auth = { Authorization: `Bearer ${token}` };

    const antes = await req().get('/api/diario').set(auth).expect(200);
    const quantas = antes.body.refeicoes.length;

    // Acrescenta uma com nome próprio.
    const nova = await req().post('/api/diario/refeicoes').set(auth)
      .send({ nome: 'Pós-treino' }).expect(201);
    expect(nova.body.nome).toBe('Pós-treino');

    const depois = await req().get('/api/diario').set(auth).expect(200);
    expect(depois.body.refeicoes).toHaveLength(quantas + 1);

    // Renomeia.
    const renomeada = await req().patch(`/api/diario/refeicoes/${nova.body.id}`)
      .set(auth).send({ nome: 'Ceia' }).expect(200);
    expect(renomeada.body.nome).toBe('Ceia');

    // Remove a vazia.
    await req().delete(`/api/diario/refeicoes/${nova.body.id}`).set(auth).expect(200);
    const final = await req().get('/api/diario').set(auth).expect(200);
    expect(final.body.refeicoes).toHaveLength(quantas);
  });

  it('clona uma refeição inteira para outra', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);

    const origem = dia.body.refeicoes.find(
      (r: { itens: unknown[] }) => (r.itens ?? []).length > 0,
    );
    const destino = dia.body.refeicoes.find(
      (r: { id: string; itens: unknown[] }) =>
        r.id !== origem.id && (r.itens ?? []).length === 0,
    );
    expect(origem && destino).toBeTruthy();

    const copias = await req().post(`/api/diario/refeicoes/${origem.id}/clonar`)
      .set(auth).send({ destinoId: destino.id }).expect(201);

    expect(copias.body).toHaveLength(origem.itens.length);

    // A cópia bate item a item com a origem.
    const depois = await req().get('/api/diario').set(auth).expect(200);
    const novo = depois.body.refeicoes.find((r: { id: string }) => r.id === destino.id);
    const soma = (itens: { kcal: number }[]) =>
      itens.reduce((a, i) => a + i.kcal, 0);
    expect(soma(novo.itens)).toBeCloseTo(soma(origem.itens), 1);
  });

  it('recusa clonar refeição vazia ou para ela mesma', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);

    const cheia = dia.body.refeicoes.find(
      (r: { itens: unknown[] }) => (r.itens ?? []).length > 0,
    );
    const vazia = dia.body.refeicoes.find(
      (r: { itens: unknown[] }) => (r.itens ?? []).length === 0,
    );

    await req().post(`/api/diario/refeicoes/${cheia.id}/clonar`)
      .set(auth).send({ destinoId: cheia.id }).expect(400);

    if (vazia) {
      await req().post(`/api/diario/refeicoes/${vazia.id}/clonar`)
        .set(auth).send({ destinoId: cheia.id }).expect(400);
    }
  });

  it('não apaga refeição que tem comida anotada', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);

    // A primeira refeição já recebeu itens nos testes anteriores.
    const comItens = dia.body.refeicoes.find(
      (r: { itens: unknown[] }) => (r.itens ?? []).length > 0,
    );
    expect(comItens).toBeTruthy();

    const r = await req().delete(`/api/diario/refeicoes/${comItens.id}`)
      .set(auth).expect(400);
    expect(r.body.message).toContain('Tire os itens');
  });

  it('monta um prato completo pra uma refeição', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);

    // Dá nome de refeição real pra composição fazer sentido.
    const alvo = dia.body.refeicoes[dia.body.refeicoes.length - 1];
    await req().patch(`/api/diario/refeicoes/${alvo.id}`)
      .set(auth).send({ nome: 'Janta' }).expect(200);

    const r = await req().get(`/api/diario/montar/${alvo.id}`).set(auth).expect(200);

    expect(r.body.tipo).toBe('janta');
    expect(r.body.componentes.length).toBeGreaterThan(0);

    // Um prato de janta traz base, feijão, proteína e salada — não uma lista
    // de ingredientes soltos por macro.
    const papeis = r.body.componentes.map((c: { papel: string }) => c.papel);
    expect(papeis).toContain('proteina');

    // Cada componente traz alternativas do mesmo papel, pra trocar.
    r.body.componentes.forEach((c: { alternativas: unknown[] }) => {
      expect(Array.isArray(c.alternativas)).toBe(true);
    });

    // O total do prato é a soma dos componentes.
    const soma = r.body.componentes.reduce(
      (a: number, c: { macros: { kcal: number } }) => a + c.macros.kcal, 0);
    expect(Math.abs(soma - r.body.totais.kcal)).toBeLessThanOrEqual(1);
  });

  it('busca um alimento pra ocupar um papel do prato', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);
    const alvo = dia.body.refeicoes[dia.body.refeicoes.length - 1];

    // As alternativas fixas não cobrem tudo: quem vai comer carne moída
    // precisa poder procurar por ela.
    const r = await req()
      .get(`/api/diario/montar/${alvo.id}/buscar?q=carne%20moida&papel=proteina`)
      .set(auth)
      .expect(200);

    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body[0].nome.toLowerCase()).toContain('carne');
    // Vem com a porção já dimensionada pelo espaço do dia.
    expect(r.body[0].gramas).toBeGreaterThan(0);
    expect(r.body[0].macros.kcal).toBeGreaterThan(0);
  });

  it('a porção da proteína mira o que falta, não a porção genérica', async () => {
    // Conta própria: os testes anteriores já consumiram o dia do usuário
    // principal, e aqui o que importa é o dia ainda em aberto.
    const conta = await req().post('/api/auth/registrar').send({
      email: 'porcao@teste.com', senha: 'senha12345', nome: 'Porção',
      sexo: 'masculino', idadeAnos: 28, alturaCm: 184,
      nivelAtividade: 'moderado', pesoKg: 95,
    }).expect(201);

    const auth = { Authorization: `Bearer ${conta.body.token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);
    const alvo = dia.body.refeicoes[dia.body.refeicoes.length - 1];

    const espaco = await req().get('/api/diario/espaco').set(auth).expect(200);
    const faltaProteina = espaco.body.proteinaG;

    const r = await req()
      .get(`/api/diario/montar/${alvo.id}/buscar?q=carne%20moida&papel=proteina`)
      .set(auth)
      .expect(200);

    expect(r.body.length).toBeGreaterThan(0);
    const escolha = r.body[0];

    // O bug que isso trava: a carne vinha em 55 g (22 g de proteína) porque o
    // teto de caloria cortava antes de olhar a proteína que faltava.
    //
    // Não se exige que uma refeição só feche o dia inteiro — 158 g de proteína
    // numa janta seria absurdo. O que se exige é que a porção seja uma parcela
    // séria do que falta, e não a migalha de antes.
    if (faltaProteina > 20) {
      expect(escolha.macros.proteinaG).toBeGreaterThan(
        Math.min(faltaProteina * 0.4, 45),
      );
    }

    // E sem virar porção absurda.
    expect(escolha.gramas).toBeLessThanOrEqual(300);
  });

  it('base e feijão ficam na porção típica, não incham pra fechar macro', async () => {
    const conta = await req().post('/api/auth/registrar').send({
      email: 'porcoes2@teste.com', senha: 'senha12345', nome: 'Porções',
      sexo: 'masculino', idadeAnos: 28, alturaCm: 184,
      nivelAtividade: 'moderado', pesoKg: 95,
    }).expect(201);

    const auth = { Authorization: `Bearer ${conta.body.token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);
    const alvo = dia.body.refeicoes[1];
    await req().patch(`/api/diario/refeicoes/${alvo.id}`)
      .set(auth).send({ nome: 'Almoço' }).expect(200);

    const r = await req().get(`/api/diario/montar/${alvo.id}`).set(auth).expect(200);

    // 400 g de arroz num prato é balde, não refeição.
    const base = r.body.componentes.find((c: { papel: string }) => c.papel === 'base');
    if (base) expect(base.gramas).toBeLessThanOrEqual(200);

    const feijao = r.body.componentes.find((c: { papel: string }) => c.papel === 'leguminosa');
    if (feijao) expect(feijao.gramas).toBeLessThanOrEqual(150);
  });

  it('a porção nunca estoura as calorias que restam', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);
    const alvo = dia.body.refeicoes[dia.body.refeicoes.length - 1];

    const espaco = await req().get('/api/diario/espaco').set(auth).expect(200);
    const r = await req()
      .get(`/api/diario/montar/${alvo.id}/buscar?q=frango&papel=proteina`)
      .set(auth)
      .expect(200);

    r.body.forEach((a: { macros: { kcal: number } }) => {
      expect(a.macros.kcal).toBeLessThanOrEqual(Math.max(0, espaco.body.kcal) + 60);
    });
  });

  it('a busca do prato tolera flexão de gênero', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);
    const alvo = dia.body.refeicoes[dia.body.refeicoes.length - 1];

    // A TACO escreve "moído"; a pessoa digita "moída".
    const r = await req()
      .get(`/api/diario/montar/${alvo.id}/buscar?q=moida&papel=proteina`)
      .set(auth)
      .expect(200);
    expect(r.body.length).toBeGreaterThan(0);
  });

  it('busca curta demais não devolve nada', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const dia = await req().get('/api/diario').set(auth).expect(200);
    const alvo = dia.body.refeicoes[0];

    const r = await req()
      .get(`/api/diario/montar/${alvo.id}/buscar?q=a&papel=proteina`)
      .set(auth)
      .expect(200);
    expect(r.body).toEqual([]);
  });

  it('lista quais refeições ainda estão vazias', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const r = await req().get('/api/diario/refeicoes-vazias').set(auth).expect(200);

    expect(r.body.length).toBeGreaterThan(0);
    r.body.forEach((x: { nome: string; vazia: boolean }) => {
      expect(typeof x.nome).toBe('string');
      expect(typeof x.vazia).toBe('boolean');
    });
  });

  it('serve o cliente web', async () => {
    await req().get('/').expect(200).expect('Content-Type', /html/);
    await req().get('/app.js').expect(200);
    await req().get('/estilo.css').expect(200);
  });
});
