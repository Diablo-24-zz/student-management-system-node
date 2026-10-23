import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function loadEnv(nodeEnv) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '-e', "import('./src/config/env.js')"],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: nodeEnv,
        DB_HOST: 'localhost',
        DB_PORT: '3306',
        DB_USER: 'test',
        DB_PASSWORD: '',
        DB_NAME: 'test',
        JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long'
      }
    }
  );
}

test('empty DB_PASSWORD is rejected in production', () => {
  const result = loadEnv('production');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DB_PASSWORD must not be empty in production/);
});

test('empty DB_PASSWORD is allowed outside production', () => {
  const result = loadEnv('development');
  assert.equal(result.status, 0, result.stderr);
});
