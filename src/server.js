import app from './app.js';
import env from './config/env.js';
import pool from './config/db.js';

const port = env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await pool.end();
    } finally {
      process.exit(0);
    }
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default server;
