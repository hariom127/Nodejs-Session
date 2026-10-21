const { validationResult, matchedData } = require('express-validator');
const AppError = require('../utils/AppError');

/**
 * Put this after a route's validation rules, e.g.
 *   router.post('/signup', signupRules, validate, controller.signup);
 *
 * - If any rule failed → respond 400 with one error per field.
 * - If all rules passed → req.body keeps ONLY the fields that have rules,
 *   so extra fields sent by the client (like `author` or `_id`) are removed.
 */
function validate(req, res, next) {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    const errors = result.array({ onlyFirstError: true });
    const details = errors.map((err) => ({ field: err.path || null, message: err.msg }));

    // An invalid :id in the URL gets its own error code.
    const code = errors.some((err) => err.location === 'params') ? 'INVALID_ID' : 'BAD_REQUEST';
    throw new AppError(400, 'Validation failed', code, details);
  }

  req.body = matchedData(req, { locations: ['body'] });
  next();
}

module.exports = validate;
