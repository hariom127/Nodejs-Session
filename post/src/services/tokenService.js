const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { redisClient } = require('../config/redis');
const AppError = require('../utils/AppError');

// Shared contract with the auth service, which writes these keys on logout.
const REVOKED_PREFIX = 'auth:revoked:';

/** Throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError) on failure. */
function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.secret, {
    algorithms: ['HS256'],
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });
}

async function isTokenRevoked(jti) {
  try {
    return (await redisClient.exists(`${REVOKED_PREFIX}${jti}`)) === 1;
  } catch (err) {
    // Fail closed: if we cannot check revocation, do not accept the token.
    console.error(`[redis] ${err.message}`);
    throw AppError.serviceUnavailable('Token store temporarily unavailable');
  }
}

module.exports = { verifyAccessToken, isTokenRevoked };
