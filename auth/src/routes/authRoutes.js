const { Router } = require('express');
const controller = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { signupRules, loginRules } = require('../validators/authValidators');

const router = Router();

// rules → validate → controller
router.post('/signup', signupRules, validate, controller.signup);
router.post('/login', loginRules, validate, controller.login);
router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, controller.me);

module.exports = router;
