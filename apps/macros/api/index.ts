/**
 * Ponto de entrada na Vercel.
 *
 * Serverless não mantém processo vivo entre requisições, então a app Nest é
 * criada uma vez e guardada em memória: enquanto a instância estiver quente,
 * as próximas requisições reaproveitam. É por isso que aqui não se chama
 * `listen()` — quem escuta é a plataforma.
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { PASTA_PUBLICA } from '../src/comum/caminhos';

let servidor: unknown;

async function criar() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(PASTA_PUBLICA);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Macros')
    .setDescription('Metas por peso alvo, base TACO e planejamento reverso.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async function handler(req: unknown, res: unknown) {
  try {
    servidor ??= await criar();
  } catch (erro) {
    // Falha na criação da app (tipicamente banco não configurado) viraria um
    // FUNCTION_INVOCATION_FAILED opaco. Melhor devolver o motivo real.
    const r = res as {
      statusCode: number;
      setHeader: (k: string, v: string) => void;
      end: (c: string) => void;
    };
    r.statusCode = 503;
    r.setHeader('Content-Type', 'application/json; charset=utf-8');
    r.end(
      JSON.stringify({
        erro: 'Servidor não conseguiu iniciar.',
        motivo: (erro as Error).message,
        pilha: (erro as Error).stack?.split('\n').slice(0, 6),
      }),
    );
    return;
  }
  return (servidor as (a: unknown, b: unknown) => unknown)(req, res);
}
