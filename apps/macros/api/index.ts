/**
 * Ponto de entrada na Vercel.
 *
 * Importa de `dist/` (gerado pelo `nest build`, que a Vercel roda no deploy)
 * em vez de `src/`: assim o bundler recebe JavaScript pronto e não precisa
 * resolver TypeScript nem os decorators do Nest.
 *
 * Serverless não mantém processo vivo entre requisições, então a app é criada
 * uma vez e guardada em memória — enquanto a instância estiver quente, as
 * próximas requisições reaproveitam. Por isso não se chama `listen()`: quem
 * escuta é a plataforma.
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../dist/app.module';

let servidor: unknown;

async function criar() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
    // Falha no boot viraria um FUNCTION_INVOCATION_FAILED opaco.
    // Melhor devolver o motivo real.
    const r = res as {
      statusCode: number;
      setHeader: (k: string, v: string) => void;
      end: (c: string) => void;
    };
    r.statusCode = 503;
    r.setHeader('Content-Type', 'application/json; charset=utf-8');
    r.end(JSON.stringify({
      erro: 'Servidor não conseguiu iniciar.',
      motivo: (erro as Error).message,
    }));
    return;
  }
  return (servidor as (a: unknown, b: unknown) => unknown)(req, res);
}
