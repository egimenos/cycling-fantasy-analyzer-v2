import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as path from 'path';

async function runMigrations(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://cycling:cycling@localhost:5432/cycling_analyzer';

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log('Running database migrations...');
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../../../drizzle/migrations'),
  });
  console.log('Migrations completed successfully.');

  await pool.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
