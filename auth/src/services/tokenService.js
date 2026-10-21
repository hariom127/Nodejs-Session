const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { redisClient } = require('../config/redis');
const AppError = require('../utils/AppError');

// Shared contract with the post service: a key under this prefix means the
// token with that `jti` has been revoked (logged out).
const REVOKED_PREFIX = 'auth:revoked:';

function signAccessToken(user) {
  const token = jwt.sign({ email: user.email }, env.jwt.secret, {
    algorithm: 'HS256',
    subject: user.id,
    jwtid: crypto.randomUUID(),
    expiresIn: env.jwt.expiresIn,
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });
  const { exp } = jwt.decode(token);
  return { accessToken: token, tokenType: 'Bearer', expiresAt: new Date(exp * 1000).toISOString() };
}

/** Throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError) on failure. */
function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.secret, {
    algorithms: ['HS256'], // pin the algorithm: rejects `alg: none` and alg-confusion tricks
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });
}

async function withRedis(operation) {
  try {
    return await operation();
  } catch (err) {
    console.error(`[redis] ${err.message}`);
    throw AppError.serviceUnavailable('Token store temporarily unavailable');
  }
}

/** Revoke a token until its natural expiry; after that the JWT is invalid anyway. */
async function revokeToken({ jti, exp }) {
  const ttl = exp - Math.floor(Date.now() / 1000);
  if (ttl <= 0) return;
  await withRedis(() => redisClient.set(`${REVOKED_PREFIX}${jti}`, '1', { EX: ttl }));
}

async function isTokenRevoked(jti) {
  return (await withRedis(() => redisClient.exists(`${REVOKED_PREFIX}${jti}`))) === 1;
}

module.exports = { signAccessToken, verifyAccessToken, revokeToken, isTokenRevoked, withRedis };
