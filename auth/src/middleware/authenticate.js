const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const { verifyAccessToken, isTokenRevoked } = require('../services/tokenService');

/**
 * Verifies `Authorization: Bearer <jwt>` and sets req.user = { id, email }.
 * The user id comes only from the verified token's `sub` claim, never from
 * the request body, params or query.
 */
module.exports = async function authenticate(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  if (!match) throw AppError.unauthorized('Missing or malformed Authorization header', 'TOKEN_MISSING');

  let payload;
  try {
    payload = verifyAccessToken(match[1]);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Access token has expired', 'TOKEN_EXPIRED');
    }
    throw AppError.unauthorized('Invalid access token', 'TOKEN_INVALID');
  }

  if (!payload.jti || !mongoose.isObjectIdOrHexString(payload.sub)) {
    throw AppError.unauthorized('Invalid access token', 'TOKEN_INVALID');
  }
  if (await isTokenRevoked(payload.jti)) {
    throw AppError.unauthorized('Access token has been revoked', 'TOKEN_REVOKED');
  }

  req.user = { id: payload.sub, email: payload.email };
  req.token = { jti: payload.jti, exp: payload.exp };
  next();
};
