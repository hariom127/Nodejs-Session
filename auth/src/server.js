const env = require('./config/env');
const app = require('./app');
const { connectDb } = require('./config/db');
const { connectRedis } = require('./config/redis');
const User = require('./models/User');

let server;


async function start() {
  await connectDb();
  await connectRedis();
  server = app.listen(env.port, () => {
    console.log(`[auth] listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}



process.on('unhandledRejection', (err) => {
  console.error('[auth] unhandled rejection', err);
});
process.on('uncaughtException', (err) => {
  console.error('[auth] uncaught exception', err);
});

start().catch((err) => {
  console.error(`[auth] failed to start: ${err.message}`);
  process.exit(1); // exit with failure code
});
