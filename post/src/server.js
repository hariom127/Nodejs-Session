const env = require('./config/env');
const app = require('./app');
const { connectDb } = require('./config/db');
const { connectRedis } = require('./config/redis');
const Post = require('./models/Post');

let server;
let shuttingDown = false;

async function start() {
  await connectDb();
  await Post.createIndexes();
  await connectRedis();
  server = app.listen(env.port, () => {
    console.log(`[post] listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}


process.on('unhandledRejection', (err) => {
  console.error('[post] unhandled rejection', err);
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  console.error('[post] uncaught exception', err);
  shutdown('uncaughtException', 1);
});

start().catch((err) => {
  console.error(`[post] failed to start: ${err.message}`);
  shutdown('startup failure', 1);
});
