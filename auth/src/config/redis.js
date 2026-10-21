const { createClient } = require('redis');
const env = require('./env');

const redisClient = createClient({
  url: env.redisUrl,
  // Fail fast instead of queueing commands while Redis is down, so requests
  // get a 503 immediately rather than hanging.
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
  },
});

redisClient.on('error', (err) => console.error(`[redis] ${err.message}`));
redisClient.on('ready', () => console.log('[redis] connected'));

async function connectRedis() {
  await redisClient.connect();
}

async function disconnectRedis() {
  if (redisClient.isOpen) await redisClient.quit();
}

module.exports = { redisClient, connectRedis, disconnectRedis };
