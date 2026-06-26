import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim() === '') {
    throw new Error('DATABASE_URL is required to run database migrations.');
  }

  const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const pool = new Pool({ connectionString });

  try {
    for (const file of migrationFiles) {
      const sql = await readFile(resolve(migrationsDirectory, file), 'utf8');
      await pool.query(sql);
      console.log(`Applied ${file}`);
    }
  } finally {
    await pool.end();
  }
}

await runMigrations();
