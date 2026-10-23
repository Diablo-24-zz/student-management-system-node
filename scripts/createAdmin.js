import readline from 'node:readline/promises';
import bcrypt from 'bcrypt';
import pool from '../src/config/db.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const username = process.env.ADMIN_USERNAME || await rl.question('Admin username: ');
const password = process.env.ADMIN_PASSWORD || await rl.question('Admin password: ', { hideEchoBack: true });

try {
  const hash = await bcrypt.hash(password, 12);
  await pool.query('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username.trim(), hash]);
  console.log('Admin user created successfully.');
} catch (error) {
  console.error('Unable to create admin:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
  rl.close();
}
