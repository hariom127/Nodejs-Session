// Test environment: isolated database and Redis DB so real data is untouched.
// Must be required before anything from src/.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/blog_test_auth';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/15';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_ISSUER = 'blog-auth-service';
process.env.JWT_AUDIENCE = 'blog-api';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.LOGIN_MAX_ATTEMPTS = '3';

const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDb, disconnectDb } = require('../src/config/db');
const { redisClient, connectRedis, disconnectRedis } = require('../src/config/redis');

async function startTestServer() {
  await connectDb();
  await mongoose.connection.dropDatabase();
  await mongoose.syncIndexes();
  await connectRedis();
  await redisClient.flushDb();

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { body, token, raw, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (raw !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = raw;
    } else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(baseUrl + path, init);
    return { status: res.status, body: await res.json() };
  }

  async function stop() {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    await mongoose.connection.dropDatabase();
    await redisClient.flushDb();
    await disconnectDb();
    await disconnectRedis();
  }

  return { request, stop };
}

module.exports = { startTestServer };
