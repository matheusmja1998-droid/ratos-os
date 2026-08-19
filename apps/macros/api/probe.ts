// Reproduz o boot do Nest, capturando o erro real.
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

export default async function handler(_req: unknown, res: any) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    res.end(JSON.stringify({ boot: 'ok' }));
  } catch (e) {
    res.end(JSON.stringify({
      erro: (e as Error).message,
      pilha: (e as Error).stack?.split('\n').slice(0, 8),
    }, null, 1));
  }
}
