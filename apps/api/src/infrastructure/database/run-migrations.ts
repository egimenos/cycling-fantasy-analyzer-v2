import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as path from 'path';

function log(level: string, msg: string, extra?: Record<string, unknown>): void {
  const entry = { level, msg, time: Date.now(), context: 'DatabaseMigrations', ...extra };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const connectionString = process.env.DATABASE_URL;

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  log('info', 'Running database migrations...');
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../../../drizzle/migrations'),
  });
  log('info', 'Migrations completed successfully.');

  await pool.end();
}

runMigrations().catch((err) => {
  log('error', 'Migration failed', { err: String(err) });
  process.exit(1);
});
