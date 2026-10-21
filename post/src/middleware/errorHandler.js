const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const env = require('../config/env');

const MONGO_UNAVAILABLE = new Set([
  'MongooseServerSelectionError',
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
]);

/** Map known library errors onto AppErrors; anything unknown becomes a 500. */
function normalize(err) {
  if (err instanceof AppError) return err;

  // Body parser errors (express.json)
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'Request body contains invalid JSON', 'INVALID_JSON');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'Request body is too large', 'PAYLOAD_TOO_LARGE');
  }

  if (err instanceof mongoose.Error.CastError) {
    return new AppError(400, `Invalid value for "${err.path}"`, 'INVALID_ID');
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new AppError(400, 'Validation failed', 'VALIDATION_ERROR', details);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || err.keyPattern || {})[0] || 'field';
    return new AppError(409, `A record with this ${field} already exists`, 'DUPLICATE_KEY');
  }
  if (MONGO_UNAVAILABLE.has(err.name)) {
    return new AppError(503, 'Database temporarily unavailable', 'DATABASE_UNAVAILABLE');
  }

  return new AppError(500, 'Internal server error', 'INTERNAL_ERROR');
}

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const error = normalize(err);
  if (error.statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  const body = { success: false, error: { code: error.code, message: error.message } };
  if (error.details) body.error.details = error.details;
  // Stack traces are only ever exposed in development.
  if (env.nodeEnv === 'development' && error.statusCode >= 500) body.error.stack = err.stack;

  res.status(error.statusCode).json(body);
};
