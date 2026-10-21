const bcrypt = require('bcrypt');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const { redisClient } = require('../config/redis');
const { signAccessToken, withRedis } = require('./tokenService');

// Compared against when the email does not exist, so "unknown email" and
// "wrong password" take the same time and cannot be told apart.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', env.bcryptSaltRounds);

const failKey = (ip, email) => `auth:login-fail:${ip}:${email}`;

async function signup({ name, email, password }) {
  if (await User.exists({ email })) {
    throw AppError.conflict('An account with this email already exists');
  }
  // A concurrent signup can still slip past the check above; the unique index
  // then raises E11000, which the error handler maps to 409.
  const user = await User.create({ name, email, password });
  return { user, ...signAccessToken(user) };
}

async function login({ email, password }, ip) {
  const key = failKey(ip, email);
  const { maxAttempts, windowSeconds } = env.loginRateLimit;

  const attempts = Number(await withRedis(() => redisClient.get(key))) || 0;
  if (attempts >= maxAttempts) {
    const retryAfter = await withRedis(() => redisClient.ttl(key));
    throw new AppError(
      429,
      `Too many failed login attempts. Try again in ${Math.max(retryAfter, 1)} seconds`,
      'TOO_MANY_ATTEMPTS',
    );
  }

  const user = await User.findOne({ email }).select('+password');
  const valid = user ? await user.comparePassword(password) : await bcrypt.compare(password, DUMMY_HASH);

  if (!valid) {
    await withRedis(async () => {
      // Fixed window: the TTL is set on the first failure only.
      if ((await redisClient.incr(key)) === 1) await redisClient.expire(key, windowSeconds);
    });
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  await withRedis(() => redisClient.del(key));
  return { user, ...signAccessToken(user) };
}

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  return user;
}

module.exports = { signup, login, getProfile };
