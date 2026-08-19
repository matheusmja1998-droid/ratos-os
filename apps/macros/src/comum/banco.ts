import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Configuração do banco, decidida pelo ambiente.
 *
 * Com DATABASE_URL definida (Vercel, VPS, qualquer hospedagem), usa Postgres.
 * Sem ela, cai no SQLite em arquivo — que é o suficiente pra rodar no seu
 * próprio computador e não exige subir infraestrutura nenhuma pra testar.
 *
 * Serverless não pode usar SQLite em arquivo: o disco é efêmero e some entre
 * requisições, então cada refeição registrada se perderia.
 */
export function opcoesDoBanco(entidades: Function[]): TypeOrmModuleOptions {
  // A Vercel injeta a URL do Postgres com nomes diferentes conforme o
  // provedor (Neon usa POSTGRES_URL, Supabase costuma usar DATABASE_URL).
  // Aceita qualquer um pra não depender de renomear variável no painel.
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  if (url) {
    return {
      type: 'postgres',
      url,
      entities: entidades,
      synchronize: true,
      // Supabase, Neon e afins exigem TLS, mas emitem certificado que o Node
      // não valida por padrão.
      ssl: { rejectUnauthorized: false },
      extra: {
        // Em serverless cada invocação abre a própria conexão. Pool grande
        // esgota o limite do Postgres à toa.
        max: Number(process.env.DB_POOL_MAX ?? 3),
      },
    };
  }

  // Em serverless o disco é somente-leitura: SQLite falharia com um 500 opaco
  // na primeira requisição. Melhor dizer exatamente o que está faltando.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new Error(
      'Nenhuma URL de Postgres configurada (DATABASE_URL ou POSTGRES_URL). ' +
        'Em ambiente serverless o disco é efêmero e o SQLite não persiste — ' +
        'crie um Postgres e defina a variável nas configurações do projeto.',
    );
  }

  return {
    type: 'better-sqlite3',
    database: process.env.DB_PATH ?? 'macros.db',
    entities: entidades,
    synchronize: true,
  };
}
