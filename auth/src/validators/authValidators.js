const { body } = require('express-validator');

// Each rule checks one field. Order matters: checks run from left to right.

const emailRule = body('email')
  .isString().withMessage('email is required')
  .trim()
  .isEmail().withMessage('email must be a valid email address')
  .toLowerCase();

const signupRules = [
  body('name')
    .isString().withMessage('name is required')
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('name must be 2-50 characters'),

  emailRule,

  body('password')
    .isString().withMessage('password is required')
    .isLength({ min: 8 }).withMessage('password must be at least 8 characters')
    .matches(/[A-Za-z]/).withMessage('password must contain at least one letter')
    .matches(/\d/).withMessage('password must contain at least one number')
    // bcrypt ignores everything after 72 bytes, so do not allow longer passwords.
    .custom((value) => Buffer.byteLength(value) <= 72).withMessage('password must be at most 72 bytes'),
];

const loginRules = [
  emailRule,
  body('password').isString().notEmpty().withMessage('password is required'),
];

module.exports = { signupRules, loginRules };
