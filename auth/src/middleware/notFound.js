const AppError = require('../utils/AppError');

module.exports = function notFound(req, res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};
