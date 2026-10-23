import mysql from 'mysql2/promise';
import env from './env.js';

const ssl = env.DB_SSL
  ? {
      rejectUnauthorized: env.NODE_ENV === 'production',
      ...(env.NODE_ENV === 'production' && env.DB_CA_CERT ? { ca: env.DB_CA_CERT } : {})
    }
  : undefined;

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  multipleStatements: false
});

export default pool;
