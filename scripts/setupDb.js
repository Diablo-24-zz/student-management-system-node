import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import env from '../src/config/env.js';

const rootConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  multipleStatements: true
};

const schemaPath = path.join(process.cwd(), 'sql', 'schema.sql');
const seedPath = path.join(process.cwd(), 'sql', 'seed.sql');

async function runSqlFile(filePath, connection) {
  const sql = await fs.readFile(filePath, 'utf8');
  await connection.query(sql);
}

async function main() {
  const connection = await mysql.createConnection(rootConfig);

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\``);
    await connection.query(`USE \`${env.DB_NAME}\``);
    await runSqlFile(schemaPath, connection);
    await runSqlFile(seedPath, connection);
    console.log(`Database setup complete for ${env.DB_NAME}.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Database setup failed:', error.message);
  process.exit(1);
});
