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
    const refeicao = antes.body.refeicoes[4];

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

  it('serve o cliente web', async () => {
    await req().get('/').expect(200).expect('Content-Type', /html/);
    await req().get('/app.js').expect(200);
    await req().get('/estilo.css').expect(200);
  });
});
