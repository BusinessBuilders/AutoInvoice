import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const TEST_DB_URL_FILE = path.join(__dirname, '..', '..', '.jest-test-db-url');

declare global {
  // eslint-disable-next-line no-var
  var __TEST_PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

export default async function globalSetup(): Promise<void> {
  // pgvector image: schema declares the vector extension (Customer/Service embeddings)
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('autoinvoice_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const uri = container.getConnectionUri();
  globalThis.__TEST_PG_CONTAINER__ = container;

  // Build schema directly from schema.prisma. We deliberately do NOT use
  // `migrate deploy`: the migrations directory only contains the SQL view/role
  // migrations, not the base tables (schema was historically `db push`ed).
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--schema=prisma/schema.prisma'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: uri },
    stdio: 'pipe',
  });

  // Holding-company views (raw SQL migration; vision_reader grants are
  // role-guarded so they no-op in the container).
  const viewsSql = fs.readFileSync(
    path.join(
      __dirname, '..', '..', 'prisma', 'migrations',
      '20260610000008_business_os_holding_views', 'migration.sql'
    ),
    'utf8'
  );
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pg');
  const client = new Client({ connectionString: uri });
  await client.connect();
  try {
    await client.query(viewsSql);
  } finally {
    await client.end();
  }

  // Hand the container URL to test workers (separate processes) via a file.
  fs.writeFileSync(TEST_DB_URL_FILE, uri, 'utf8');
}
