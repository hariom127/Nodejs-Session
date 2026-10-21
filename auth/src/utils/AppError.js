/**
 * Operational error with an HTTP status code. Anything thrown as an AppError is
 * considered safe to show to the client; every other error becomes a generic 500.
 */
class AppError extends Error {
  constructor(statusCode, message, code = 'ERROR', details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(401, message, code);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, message, 'NOT_FOUND');
  }

  static conflict(message) {
    return new AppError(409, message, 'CONFLICT');
  }

  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new AppError(503, message, 'SERVICE_UNAVAILABLE');
  }
}

module.exports = AppError;
