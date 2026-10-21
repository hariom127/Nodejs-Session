const { before, after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { startTestServer } = require('./setup');
const { redisClient } = require('../src/config/redis');

let api;
let alice; // { id, token }
let bob;

/** Mirrors what the auth service issues. */
function tokenFor(userId, opts = {}) {
  return jwt.sign({ email: `${userId}@example.com` }, opts.secret || process.env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    jwtid: opts.jti || crypto.randomUUID(),
    expiresIn: opts.expiresIn ?? '15m',
    issuer: opts.issuer || 'blog-auth-service',
    audience: 'blog-api',
  });
}

async function createUser(name) {
  // Users are owned by the auth service; insert straight into the shared collection.
  const { insertedId } = await mongoose.connection.collection('users').insertOne({
    name, email: `${name.toLowerCase()}@example.com`, password: 'hash', createdAt: new Date(), updatedAt: new Date(),
  });
  const id = insertedId.toString();
  return { id, token: tokenFor(id) };
}

const NONEXISTENT_ID = '64b0c0ffee0000000000beef';

before(async () => {
  api = await startTestServer();
  alice = await createUser('Alice');
  bob = await createUser('Bob');
});
after(async () => { await api.stop(); });

describe('Create', () => {
  it('creates a post owned by the token user and ignores a client-supplied author', async () => {
    const res = await api.request('POST', '/api/posts', {
      token: alice.token,
      body: { title: 'Hello world', content: 'First post', author: bob.id },
    });
    assert.equal(res.status, 201);
    const { post } = res.body.data;
    assert.equal(post.title, 'Hello world');
    assert.deepEqual(post.author, { id: alice.id, name: 'Alice' });
    assert.ok(post.createdAt && post.updatedAt);
  });

  it('requires authentication (401 TOKEN_MISSING)', async () => {
    const res = await api.request('POST', '/api/posts', { body: { title: 'Nope', content: 'x' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_MISSING');
  });

  it('validates required fields', async () => {
    const res = await api.request('POST', '/api/posts', { token: alice.token, body: { title: '  ' } });
    assert.equal(res.status, 400);
    const fields = res.body.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['content', 'title']);
  });

  it('rejects invalid JSON', async () => {
    const res = await api.request('POST', '/api/posts', { token: alice.token, raw: '{bad json' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });
});

describe('Read (public)', () => {
  let bobPostId;
  before(async () => {
    const res = await api.request('POST', '/api/posts', {
      token: bob.token, body: { title: 'Bob writes', content: 'Hi from Bob' },
    });
    bobPostId = res.body.data.post.id;
  });

  it('lists all users\' posts without auth, newest first, with pagination', async () => {
    const res = await api.request('GET', '/api/posts');
    assert.equal(res.status, 200);
    const { posts, pagination } = res.body.data;
    assert.equal(posts.length, 2);
    assert.equal(posts[0].title, 'Bob writes');
    assert.deepEqual(pagination, { page: 1, limit: 10, total: 2, totalPages: 1 });
  });

  it('filters by author and paginates', async () => {
    const res = await api.request('GET', `/api/posts?author=${alice.id}&limit=1&page=1`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.posts.length, 1);
    assert.equal(res.body.data.posts[0].author.id, alice.id);
  });

  it('applies Joi defaults and converts numeric query strings', async () => {
    const res = await api.request('GET', '/api/posts?limit=1');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.pagination.page, 1);
    assert.equal(res.body.data.pagination.limit, 1);
  });

  it('rejects invalid query params', async () => {
    const res = await api.request('GET', '/api/posts?limit=1000&author=xyz');
    assert.equal(res.status, 400);
  });

  it('gets a single post without auth', async () => {
    const res = await api.request('GET', `/api/posts/${bobPostId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.post.id, bobPostId);
  });

  it('returns 404 for a nonexistent post', async () => {
    const res = await api.request('GET', `/api/posts/${NONEXISTENT_ID}`);
    assert.equal(res.status, 404);
  });

  it('returns 400 for an invalid ObjectId', async () => {
    const res = await api.request('GET', '/api/posts/not-an-id');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_ID');
  });
});

describe('Update / delete ownership', () => {
  let alicePostId;
  before(async () => {
    const res = await api.request('POST', '/api/posts', {
      token: alice.token, body: { title: 'Alice owns this', content: 'Original' },
    });
    alicePostId = res.body.data.post.id;
  });

  it('lets the owner update title/content', async () => {
    const res = await api.request('PATCH', `/api/posts/${alicePostId}`, {
      token: alice.token, body: { content: 'Edited' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.post.content, 'Edited');
    assert.equal(res.body.data.post.title, 'Alice owns this');
  });

  it('forbids another user from updating (403) and leaves the post unchanged', async () => {
    const res = await api.request('PATCH', `/api/posts/${alicePostId}`, {
      token: bob.token, body: { title: 'Hacked by Bob' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
    const check = await api.request('GET', `/api/posts/${alicePostId}`);
    assert.equal(check.body.data.post.title, 'Alice owns this');
  });

  it('cannot transfer ownership through the update body', async () => {
    const res = await api.request('PATCH', `/api/posts/${alicePostId}`, {
      token: alice.token, body: { title: 'Still mine', author: bob.id },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.post.author.id, alice.id);
  });

  it('rejects an empty update body', async () => {
    const res = await api.request('PATCH', `/api/posts/${alicePostId}`, { token: alice.token, body: {} });
    assert.equal(res.status, 400);
  });

  it('forbids another user from deleting (403)', async () => {
    const res = await api.request('DELETE', `/api/posts/${alicePostId}`, { token: bob.token });
    assert.equal(res.status, 403);
    assert.equal((await api.request('GET', `/api/posts/${alicePostId}`)).status, 200);
  });

  it('returns 404 when updating/deleting a nonexistent post', async () => {
    const upd = await api.request('PATCH', `/api/posts/${NONEXISTENT_ID}`, { token: alice.token, body: { title: 'abc' } });
    const del = await api.request('DELETE', `/api/posts/${NONEXISTENT_ID}`, { token: alice.token });
    assert.equal(upd.status, 404);
    assert.equal(del.status, 404);
  });

  it('returns 400 for an invalid id on update/delete', async () => {
    const del = await api.request('DELETE', '/api/posts/123', { token: alice.token });
    assert.equal(del.status, 400);
  });

  it('lets the owner delete', async () => {
    const res = await api.request('DELETE', `/api/posts/${alicePostId}`, { token: alice.token });
    assert.equal(res.status, 200);
    assert.equal((await api.request('GET', `/api/posts/${alicePostId}`)).status, 404);
  });
});

describe('Token handling', () => {
  const body = { title: 'Token test', content: 'x' };

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const res = await api.request('POST', '/api/posts', { token: tokenFor(alice.id, { expiresIn: -10 }), body });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const res = await api.request('POST', '/api/posts', {
      token: tokenFor(alice.id, { secret: 'attacker-secret-attacker-secret-attacker' }), body,
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_INVALID');
  });

  it('rejects a token from the wrong issuer', async () => {
    const res = await api.request('POST', '/api/posts', { token: tokenFor(alice.id, { issuer: 'evil' }), body });
    assert.equal(res.body.error.code, 'TOKEN_INVALID');
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub: alice.id, jti: 'z' })}.`;
    const res = await api.request('POST', '/api/posts', { token: none, body });
    assert.equal(res.status, 401);
  });

  it('rejects a malformed Authorization header', async () => {
    const res = await api.request('POST', '/api/posts', { headers: { Authorization: 'Token abc' }, body });
    assert.equal(res.body.error.code, 'TOKEN_MISSING');
  });

  it('rejects a token revoked by the auth service (Redis denylist)', async () => {
    const jti = crypto.randomUUID();
    const token = tokenFor(alice.id, { jti });
    await redisClient.set(`auth:revoked:${jti}`, '1', { EX: 60 });
    const res = await api.request('POST', '/api/posts', { token, body });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_REVOKED');
  });
});
