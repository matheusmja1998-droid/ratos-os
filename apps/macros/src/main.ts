import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PASTA_PUBLICA } from './comum/caminhos';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // O cliente web sai do próprio servidor: um HTML, um CSS e um JS.
  // Sem build separado — abre no celular e funciona.
  app.useStaticAssets(PASTA_PUBLICA);

  // Foto de prato chega em base64 e passa fácil do limite padrão de 100 kB do
  // Express — sem isso a requisição morre com 413 antes de chegar na rota.
  app.useBodyParser('json', { limit: '12mb' });

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Macros')
    .setDescription(
      'API de macros com metodologia de peso alvo, base TACO e planejamento reverso.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const porta = process.env.PORT ?? 3000;
  await app.listen(porta);
  console.log(`Macros em http://localhost:${porta} — API em /api, docs em /docs`);
}
bootstrap();
