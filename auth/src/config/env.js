require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw new Error(`Environment variable ${name} must be an integer`);
  return value;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters long');

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int('PORT', 4000),
  mongoUri: required('MONGO_URI'),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    issuer: process.env.JWT_ISSUER || 'blog-auth-service',
    audience: process.env.JWT_AUDIENCE || 'blog-api',
  },
  bcryptSaltRounds: int('BCRYPT_SALT_ROUNDS', 12),
  loginRateLimit: {
    maxAttempts: int('LOGIN_MAX_ATTEMPTS', 5),
    windowSeconds: int('LOGIN_WINDOW_SECONDS', 900),
  },
});
