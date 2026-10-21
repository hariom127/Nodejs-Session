const { before, after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startTestServer } = require('./setup');

let api;
before(async () => { api = await startTestServer(); });
after(async () => { await api.stop(); });

const alice = { name: 'Alice', email: 'Alice@Example.com', password: 'secret123' };

describe('POST /api/auth/signup', () => {
  it('creates a user, returns a token and never the password', async () => {
    const res = await api.request('POST', '/api/auth/signup', { body: alice });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const { user, accessToken, tokenType } = res.body.data;
    assert.equal(user.email, 'alice@example.com'); // normalized
    assert.equal(user.name, 'Alice');
    assert.ok(user.id);
    assert.equal(user.password, undefined);
    assert.equal(tokenType, 'Bearer');
    const payload = jwt.decode(accessToken);
    assert.equal(payload.sub, user.id);
    assert.ok(payload.jti);
  });

  it('rejects duplicate email (case-insensitive) with 409', async () => {
    const res = await api.request('POST', '/api/auth/signup', {
      body: { ...alice, email: 'ALICE@example.com' },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
  });

  it('handles concurrent duplicate signups via the unique index', async () => {
    const body = { name: 'Race', email: 'race@example.com', password: 'secret123' };
    const results = await Promise.all([1, 2, 3].map(() => api.request('POST', '/api/auth/signup', { body })));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409]);
  });

  it('returns 400 with details for missing fields', async () => {
    const res = await api.request('POST', '/api/auth/signup', { body: {} });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'BAD_REQUEST');
    const fields = res.body.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['email', 'name', 'password']);
  });

  it('returns 400 for invalid email and weak password', async () => {
    const res = await api.request('POST', '/api/auth/signup', {
      body: { name: 'Bob', email: 'not-an-email', password: 'short' },
    });
    assert.equal(res.status, 400);
    // Joi reports every failed rule, so password may appear more than once.
    const fields = [...new Set(res.body.error.details.map((d) => d.field))].sort();
    assert.deepEqual(fields, ['email', 'password']);
  });

  it('rejects passwords longer than 72 bytes (bcrypt limit)', async () => {
    const res = await api.request('POST', '/api/auth/signup', {
      body: { name: 'Bob', email: 'bob@example.com', password: `a1${'é'.repeat(36)}` }, // 38 chars, 74 bytes
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].message, 'password must be at most 72 bytes');
  });

  it('returns 400 for non-string values (no NoSQL operator injection)', async () => {
    const res = await api.request('POST', '/api/auth/signup', {
      body: { name: 'Bob', email: { $gt: '' }, password: 'secret123' },
    });
    assert.equal(res.status, 400);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await api.request('POST', '/api/auth/signup', { raw: '{"name": "Bob",' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const res = await api.request('POST', '/api/auth/login', {
      body: { email: 'alice@example.com', password: alice.password },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.accessToken);
    assert.equal(res.body.data.user.password, undefined);
  });

  it('returns the same 401 for wrong password and unknown email', async () => {
    const wrong = await api.request('POST', '/api/auth/login', {
      body: { email: 'alice@example.com', password: 'wrongpass1' },
    });
    const unknown = await api.request('POST', '/api/auth/login', {
      body: { email: 'nobody@example.com', password: 'wrongpass1' },
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
  });

  it('returns 400 for missing password', async () => {
    const res = await api.request('POST', '/api/auth/login', { body: { email: 'alice@example.com' } });
    assert.equal(res.status, 400);
  });

  it('rate-limits repeated failures with 429 (LOGIN_MAX_ATTEMPTS=3)', async () => {
    const body = { email: 'victim@example.com', password: 'wrongpass1' };
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await api.request('POST', '/api/auth/login', { body })).status, 401);
    }
    const res = await api.request('POST', '/api/auth/login', { body });
    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, 'TOO_MANY_ATTEMPTS');
  });
});

describe('Protected routes: GET /api/auth/me and POST /api/auth/logout', () => {
  let token;
  before(async () => {
    const res = await api.request('POST', '/api/auth/login', {
      body: { email: 'alice@example.com', password: alice.password },
    });
    token = res.body.data.accessToken;
  });

  it('returns the profile with a valid token', async () => {
    const res = await api.request('GET', '/api/auth/me', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, 'alice@example.com');
  });

  it('returns 401 TOKEN_MISSING without a token', async () => {
    const res = await api.request('GET', '/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_MISSING');
  });

  it('returns 401 TOKEN_INVALID for a garbage or wrongly-signed token', async () => {
    const garbage = await api.request('GET', '/api/auth/me', { token: 'not.a.jwt' });
    assert.equal(garbage.body.error.code, 'TOKEN_INVALID');
    const forged = jwt.sign({}, 'some-other-secret-that-is-long-enough!!', {
      subject: '64b000000000000000000000', jwtid: 'x', issuer: 'blog-auth-service', audience: 'blog-api',
    });
    const res = await api.request('GET', '/api/auth/me', { token: forged });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_INVALID');
  });

  it('returns 401 TOKEN_EXPIRED for an expired token', async () => {
    const expired = jwt.sign({}, process.env.JWT_SECRET, {
      subject: '64b000000000000000000000', jwtid: 'y', expiresIn: -10,
      issuer: 'blog-auth-service', audience: 'blog-api',
    });
    const res = await api.request('GET', '/api/auth/me', { token: expired });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
  });

  it('revokes the token on logout', async () => {
    const out = await api.request('POST', '/api/auth/logout', { token });
    assert.equal(out.status, 200);
    const res = await api.request('GET', '/api/auth/me', { token });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_REVOKED');
  });
});

describe('Misc', () => {
  it('returns JSON 404 for unknown routes', async () => {
    const res = await api.request('GET', '/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('reports health', async () => {
    const res = await api.request('GET', '/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { service: 'auth', mongo: 'up', redis: 'up' });
  });
});
