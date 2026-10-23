import dotenv from 'dotenv';

dotenv.config();

const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const env = {
  PORT: Number(process.env.PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_HOST: process.env.DB_HOST,
  DB_PORT: Number(process.env.DB_PORT || 3306),
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_NAME: process.env.DB_NAME,
  DB_SSL: String(process.env.DB_SSL || 'false').toLowerCase() === 'true',
  DB_CA_CERT: process.env.DB_CA_CERT || '',
  JWT_SECRET: process.env.JWT_SECRET,
  COOKIE_SECURE: String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true'
};

const missing = required.filter((key) => !env[key]);

if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

if (env.NODE_ENV === 'production' && env.DB_PASSWORD === '') {
  throw new Error('DB_PASSWORD must not be empty in production.');
}

if (env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

export default env;
