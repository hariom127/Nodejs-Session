const authService = require('../services/authService');
const { revokeToken } = require('../services/tokenService');

// Express 5 forwards rejected promises from async handlers to the error
// middleware automatically, so no try/catch or asyncHandler wrapper is needed.

async function signup(req, res) {
  const result = await authService.signup(req.body);
  res.status(201).json({ success: true, data: result });
}

async function login(req, res) {
  const result = await authService.login(req.body, req.ip);
  res.status(200).json({ success: true, data: result });
}

async function logout(req, res) {
  await revokeToken(req.token);
  res.status(200).json({ success: true, data: { message: 'Logged out successfully' } });
}

async function me(req, res) {
  const user = await authService.getProfile(req.user.id);
  res.status(200).json({ success: true, data: { user } });
}

module.exports = { signup, login, logout, me };
