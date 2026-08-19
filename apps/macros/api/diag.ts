/** Diagnóstico temporário: testa a conexão com o banco isoladamente. */
import { Client } from 'pg';

export default async function handler(_req: unknown, res: any) {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  const saida: Record<string, unknown> = {
    temUrl: Boolean(url),
    host: url ? url.split('@')[1]?.split('/')[0] : null,
  };
  try {
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const r = await c.query('select 1 as ok');
    saida.conectou = r.rows[0].ok === 1;
    await c.end();
  } catch (e) {
    saida.erro = (e as Error).message;
    saida.codigo = (e as { code?: string }).code;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(saida, null, 1));
}
